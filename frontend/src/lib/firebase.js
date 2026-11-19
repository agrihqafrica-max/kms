import { initializeApp, getApps } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore'
import firebaseConfig from '../../../firebase-applet-config.json'

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId)
export const googleProvider = new GoogleAuthProvider()

googleProvider.setCustomParameters({ prompt: 'select_account' })

export const OperationType = Object.freeze({
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
})

export function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: (auth.currentUser?.providerData || []).map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL,
      })),
    },
    operationType,
    path,
  }
  console.error('Firestore Error:', JSON.stringify(errInfo))
  throw new Error(JSON.stringify(errInfo))
}

export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'))
    return { ok: true }
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: the client is offline.')
      return { ok: false, offline: true }
    }
    return { ok: false, error }
  }
}

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider)
}

export async function signOutFirebase() {
  return firebaseSignOut(auth)
}

export { onAuthStateChanged }
