import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthContext } from './context.js'
import { api } from '../lib/supabase.js'
import { storeSelection } from '../tenancy/selection.js'
import { t } from '../i18n/index.js'
import {
  auth,
  onAuthStateChanged,
  signInWithGoogle,
  signOutFirebase,
  testConnection,
} from '../lib/firebase.js'

function readLocalTestSession() {
  try {
    const isLocalHost =
      typeof window !== 'undefined' &&
      ['localhost', '127.0.0.1'].includes(window.location.hostname)
    if (!isLocalHost) return null
    const raw = window.sessionStorage.getItem('__kms_playwright_session')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.user?.id) return null
    return parsed
  } catch {
    return null
  }
}

export default function AuthProvider({ children }) {
  const [state, setState] = useState({ session: null, loading: true, recovery: null, notice: '' })
  const identity = useRef(null)
  const pendingAuth = useRef(null)
  const [authBusy, setAuthBusy] = useState(false)

  const runAuth = useCallback(async action => {
    if (pendingAuth.current) throw new DOMException('Authentication operation in progress', 'AbortError')
    const operation = Promise.resolve().then(action)
    pendingAuth.current = operation
    setAuthBusy(true)
    try {
      return await operation
    } finally {
      pendingAuth.current = null
      setAuthBusy(false)
    }
  }, [])

  const signInGoogle = useCallback(() => {
    return runAuth(() => signInWithGoogle())
  }, [runAuth])

  const signOut = useCallback(async (notice = '') => {
    if (identity.current) storeSelection(identity.current, {})
    identity.current = null
    api.setScope({ userId: null })
    try {
      window.sessionStorage.removeItem('__kms_playwright_session')
    } catch {
      // ignore storage access issues
    }
    try {
      await signOutFirebase()
    } catch {
      // ignore offline sign-out error
    }
    setState({ session: null, loading: false, recovery: null, notice })
    return true
  }, [])

  useEffect(() => {
    void testConnection()
    let active = true
    const unsub = onAuthStateChanged(auth, firebaseUser => {
      if (!active) return
      if (firebaseUser) {
        const session = {
          access_token: 'firebase-session',
          user: {
            id: firebaseUser.uid,
            email: firebaseUser.email || 'owner@kenyamoto.co.ke',
            displayName: firebaseUser.displayName || firebaseUser.email || 'KenyaMoto Owner',
            photoURL: firebaseUser.photoURL || '',
            emailVerified: firebaseUser.emailVerified,
          },
        }
        identity.current = session.user.id
        api.setScope({ userId: session.user.id })
        setState({ session, loading: false, recovery: null, notice: '' })
        return
      }
      const localPreview = readLocalTestSession()
      if (localPreview) {
        identity.current = localPreview.user.id
        api.setScope({ userId: localPreview.user.id })
        setState({ session: localPreview, loading: false, recovery: null, notice: '' })
        return
      }
      identity.current = null
      api.setScope({ userId: null })
      setState(prev => ({ session: null, loading: false, recovery: null, notice: prev.notice }))
    })
    return () => {
      active = false
      unsub()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, signOut, signInGoogle, runAuth, authBusy }}>
      {state.teardownError ? (
        <main className="selection-page">
          <p role="alert">{t('signOutFailed')}</p>
          <button onClick={() => signOut(state.notice)}>{t('signOut')}</button>
        </main>
      ) : (
        children
      )}
    </AuthContext.Provider>
  )
}
