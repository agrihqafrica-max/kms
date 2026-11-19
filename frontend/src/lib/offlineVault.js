const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

function getSubtleCrypto() {
  const cryptoObj = globalThis.crypto
  if (!cryptoObj?.subtle || !cryptoObj?.getRandomValues) {
    throw new Error('WebCrypto API is unavailable in this environment.')
  }
  return cryptoObj
}

function bytesToBase64(bytes) {
  let binary = ''
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (let i = 0; i < arr.length; i += 1) {
    binary += String.fromCharCode(arr[i])
  }
  return btoa(binary)
}

function base64ToBytes(b64) {
  const binary = atob(String(b64 || ''))
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

export function bytesToHex(bytes) {
  return Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function sha256Hex(input) {
  const cryptoObj = getSubtleCrypto()
  const raw = typeof input === 'string' ? TEXT_ENCODER.encode(input) : input
  const digest = await cryptoObj.subtle.digest('SHA-256', raw)
  return bytesToHex(new Uint8Array(digest))
}

async function deriveAesKey(passphrase, saltBytes, iterations = 100000) {
  const cleanPass = String(passphrase || '')
  if (cleanPass.length < 4) {
    throw new Error('Vault passphrase must be at least 4 characters.')
  }
  const cryptoObj = getSubtleCrypto()
  const keyMaterial = await cryptoObj.subtle.importKey(
    'raw',
    TEXT_ENCODER.encode(cleanPass),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )
  return cryptoObj.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptVaultPayload(payload, passphrase) {
  const cryptoObj = getSubtleCrypto()
  const salt = cryptoObj.getRandomValues(new Uint8Array(16))
  const iv = cryptoObj.getRandomValues(new Uint8Array(12))
  const key = await deriveAesKey(passphrase, salt)
  const encoded = TEXT_ENCODER.encode(JSON.stringify(payload))
  const ciphertext = await cryptoObj.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)
  return {
    v: 1,
    alg: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: 100000,
    saltB64: bytesToBase64(salt),
    ivB64: bytesToBase64(iv),
    ciphertextB64: bytesToBase64(new Uint8Array(ciphertext)),
    updatedAt: new Date().toISOString(),
  }
}

export async function decryptVaultPayload(envelope, passphrase) {
  if (!envelope || envelope.alg !== 'AES-256-GCM' || !envelope.ciphertextB64) {
    throw new Error('Encrypted offline vault envelope is invalid.')
  }
  const cryptoObj = getSubtleCrypto()
  const salt = base64ToBytes(envelope.saltB64)
  const iv = base64ToBytes(envelope.ivB64)
  const ciphertext = base64ToBytes(envelope.ciphertextB64)
  const key = await deriveAesKey(passphrase, salt, Number(envelope.iterations || 100000))
  try {
    const plainBuffer = await cryptoObj.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    return JSON.parse(TEXT_DECODER.decode(plainBuffer))
  } catch {
    throw new Error('Incorrect vault passphrase or tampered offline ciphertext.')
  }
}

export async function hashPinSalted(pin) {
  const cleanPin = String(pin || '').trim()
  if (!/^\d{4,8}$/.test(cleanPin)) {
    throw new Error('Manager override PIN must be 4 to 8 digits.')
  }
  const cryptoObj = getSubtleCrypto()
  const salt = cryptoObj.getRandomValues(new Uint8Array(16))
  const saltB64 = bytesToBase64(salt)
  const digestHex = await sha256Hex(`${saltB64}:${cleanPin}`)
  return {
    alg: 'SHA-256-SALTED',
    saltB64,
    digestHex,
    updatedAt: new Date().toISOString(),
  }
}

export async function verifyPinSalted(pin, storedRecord) {
  if (!storedRecord || !storedRecord.saltB64 || !storedRecord.digestHex) return false
  const cleanPin = String(pin || '').trim()
  if (!cleanPin) return false
  const candidate = await sha256Hex(`${storedRecord.saltB64}:${cleanPin}`)
  if (candidate.length !== storedRecord.digestHex.length) return false
  let diff = 0
  for (let i = 0; i < candidate.length; i += 1) {
    diff |= candidate.charCodeAt(i) ^ storedRecord.digestHex.charCodeAt(i)
  }
  return diff === 0
}

export async function packageEncryptedBackup(snapshotObj, passphrase) {
  const canonicalJson = JSON.stringify(snapshotObj)
  const sha256 = await sha256Hex(canonicalJson)
  const encrypted = await encryptVaultPayload(snapshotObj, passphrase)
  return {
    format: 'kmsp-encrypted-backup-v1',
    sha256,
    createdAt: new Date().toISOString(),
    encrypted,
  }
}

export async function unpackEncryptedBackup(kmsbakEnvelope, passphrase) {
  if (!kmsbakEnvelope || kmsbakEnvelope.format !== 'kmsp-encrypted-backup-v1') {
    throw new Error('Unsupported encrypted backup format.')
  }
  const snapshot = await decryptVaultPayload(kmsbakEnvelope.encrypted, passphrase)
  const actualSha = await sha256Hex(JSON.stringify(snapshot))
  if (kmsbakEnvelope.sha256 && actualSha !== kmsbakEnvelope.sha256) {
    throw new Error('Backup SHA-256 integrity verification failed.')
  }
  return { snapshot, sha256: actualSha, checksumVerified: true }
}
