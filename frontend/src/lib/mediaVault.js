import { sha256Hex } from './offlineVault.js'

const MEDIA_STORE_PREFIX = 'kms_media_vault_'

function storageKey(uid = 'anon') {
  return `${MEDIA_STORE_PREFIX}${uid || 'anon'}`
}

export function listMediaAttachments(uid = 'anon') {
  try {
    const raw = localStorage.getItem(storageKey(uid))
    const parsed = JSON.parse(raw || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getLocalMediaAttachment(uid = 'anon', mediaId) {
  if (!mediaId) return null
  return listMediaAttachments(uid).find(m => m.mediaId === mediaId) || null
}

export function saveLocalMediaAttachment(uid = 'anon', record) {
  const current = listMediaAttachments(uid)
  const next = [record, ...current.filter(m => m.mediaId !== record.mediaId)].slice(0, 40)
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(next))
  } catch {
    // Keep at least latest 10 items if quota is tight
    try {
      localStorage.setItem(storageKey(uid), JSON.stringify(next.slice(0, 10)))
    } catch {
      // ignore storage quota overflow
    }
  }
  return record
}

export function removeLocalMediaAttachment(uid = 'anon', mediaId) {
  const next = listMediaAttachments(uid).filter(m => m.mediaId !== mediaId)
  try {
    localStorage.setItem(storageKey(uid), JSON.stringify(next))
  } catch {
    // ignore
  }
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file selected.'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Could not read selected file.'))
    reader.readAsDataURL(file)
  })
}

export async function compressImageFile(file, { maxWidth = 900, quality = 0.78 } = {}) {
  if (!file) throw new Error('Image file is required.')
  const dataUrl = await readFileAsDataUrl(file)
  if (!String(file.type || '').startsWith('image/')) {
    const sha256 = await sha256Hex(dataUrl.slice(0, 8192))
    return {
      mediaId: `med-${Date.now().toString(36)}`,
      fileName: String(file.name || 'document.pdf').slice(0, 120),
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: Number(file.size || dataUrl.length),
      sha256,
      dataUrl: dataUrl.slice(0, 220000),
      createdAt: new Date().toISOString(),
    }
  }

  const compressedUrl = await new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      try {
        const scale = img.width > maxWidth ? maxWidth / img.width : 1
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch {
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })

  const sha256 = await sha256Hex(compressedUrl)
  return {
    mediaId: `img-${Date.now().toString(36)}`,
    fileName: String(file.name || 'part-photo.jpg').slice(0, 120),
    mimeType: 'image/jpeg',
    sizeBytes: compressedUrl.length,
    sha256,
    dataUrl: compressedUrl,
    createdAt: new Date().toISOString(),
  }
}
