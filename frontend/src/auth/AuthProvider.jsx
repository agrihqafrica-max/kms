import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthContext } from './context.js'
import { api, isMockMode, supabase } from '../lib/supabase.js'
import { storeSelection } from '../tenancy/selection.js'
import { t } from '../i18n/index.js'
import {
  auth,
  onAuthStateChanged,
  reloadFirebaseUser,
  resendFirebaseVerification,
  sendFirebasePasswordReset,
  signInWithEmail,
  signInWithGithub,
  signInWithGoogle,
  signOutFirebase,
  signUpWithEmail,
  testConnection,
} from '../lib/firebase.js'

const BACKEND_PREF_KEY = 'kms.authBackend'
const RETAIN_SHOP_KEY = 'kms.retainShop'
const USERNAME_MAP_KEY = 'kms.usernames'
const OAUTH_SESSION_KEY = 'kms.oauth.session'
const SESSION_REVOKED_KEY = 'kms.sessionRevokedAt'
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000

function readUsernameMap() {
  try {
    return JSON.parse(localStorage.getItem(USERNAME_MAP_KEY) || '{}')
  } catch {
    return {}
  }
}

function saveUsernameLocal(username, email) {
  const cleanUser = String(username || '').trim().toLowerCase()
  const cleanEmail = String(email || '').trim().toLowerCase()
  if (!cleanUser || !cleanEmail.includes('@')) return
  try {
    const map = readUsernameMap()
    map[cleanUser] = cleanEmail
    localStorage.setItem(USERNAME_MAP_KEY, JSON.stringify(map))
  } catch {
    // ignore storage errors
  }
}

async function resolveIdentifierToEmail(identifier) {
  const clean = String(identifier || '').trim()
  if (!clean) throw new Error('Enter your username or email address.')
  if (clean.includes('@')) return clean.toLowerCase()

  const localEmail = readUsernameMap()[clean.toLowerCase()]
  if (localEmail) return localEmail

  const res = await fetch('/api/auth/resolve-username', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: clean }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.email) {
    throw new Error(data.detail || `No email found for username "${clean}". Use your email address or create an account first.`)
  }
  saveUsernameLocal(clean, data.email)
  return data.email
}

function readLocalOAuthSession() {
  try {
    const raw = window.sessionStorage.getItem(OAUTH_SESSION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed?.user?.id) return parsed
    }
  } catch {
    // ignore
  }
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

function readRetainShopPref() {
  try {
    const saved = localStorage.getItem(RETAIN_SHOP_KEY)
    return saved === null ? true : saved === 'true'
  } catch {
    return true
  }
}

function readAuthBackendPref() {
  try {
    const saved = localStorage.getItem(BACKEND_PREF_KEY)
    if (saved === 'supabase' && !isMockMode) return 'supabase'
    return 'firebase'
  } catch {
    return 'firebase'
  }
}

export default function AuthProvider({ children }) {
  const [state, setState] = useState({ session: null, loading: true, recovery: null, notice: '' })
  const [authBackend, setAuthBackendState] = useState(readAuthBackendPref)
  const [retainShop, setRetainShopState] = useState(readRetainShopPref)
  const [sessionStartedAt, setSessionStartedAt] = useState(() => Date.now())
  const identity = useRef(null)
  const pendingAuth = useRef(null)
  const githubPopupResolver = useRef(null)
  const lastActivityRef = useRef(Date.now())
  const [authBusy, setAuthBusy] = useState(false)

  const setAuthBackend = useCallback(next => {
    const value = next === 'supabase' ? 'supabase' : 'firebase'
    setAuthBackendState(value)
    try {
      localStorage.setItem(BACKEND_PREF_KEY, value)
    } catch {
      // ignore
    }
  }, [])

  const setRetainShop = useCallback(next => {
    const flag = Boolean(next)
    setRetainShopState(flag)
    try {
      localStorage.setItem(RETAIN_SHOP_KEY, String(flag))
    } catch {
      // ignore
    }
  }, [])

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

  const signInGoogle = useCallback(
    (backend = authBackend) => {
      return runAuth(async () => {
        if (backend === 'supabase') {
          if (isMockMode) {
            throw new Error('Supabase is not configured yet (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY), or switch the Auth Engine toggle to Firebase.')
          }
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/app/overview` },
          })
          if (error) throw error
          return true
        }
        return signInWithGoogle()
      })
    },
    [authBackend, runAuth],
  )

  const signInGithub = useCallback(
    (backend = authBackend) => {
      return runAuth(async () => {
        if (backend === 'supabase') {
          if (isMockMode) {
            throw new Error('Supabase is not configured yet (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY), or switch the Auth Engine toggle to Firebase.')
          }
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'github',
            options: { redirectTo: `${window.location.origin}/app/overview` },
          })
          if (error) throw error
          return true
        }

        // Prefer server-side GitHub OAuth popup if GITHUB_CLIENT_ID is configured
        try {
          const urlRes = await fetch('/api/auth/github/url')
          const urlData = await urlRes.json().catch(() => ({}))
          if (urlData?.configured && urlData?.url) {
            return await new Promise((resolve, reject) => {
              const popup = window.open(urlData.url, 'github_oauth_popup', 'width=600,height=720')
              if (!popup) {
                reject(new Error('Popup was blocked by the browser. Allow popups for this site and try again.'))
                return
              }
              githubPopupResolver.current = { resolve, reject }
            })
          }
        } catch (err) {
          if (err?.message?.includes('Popup was blocked')) throw err
        }

        return signInWithGithub()
      })
    },
    [authBackend, runAuth],
  )

  const signInWithPassword = useCallback(
    ({ identifier, password, backend = authBackend }) => {
      return runAuth(async () => {
        const email = await resolveIdentifierToEmail(identifier)
        if (!password) throw new Error('Password is required.')

        if (backend === 'supabase') {
          if (isMockMode) {
            throw new Error('Supabase is not configured yet (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY), or switch the Auth Engine toggle to Firebase.')
          }
          const { data, error } = await supabase.auth.signInWithPassword({ email, password })
          if (error) throw error
          return data
        }

        return signInWithEmail(email, password)
      })
    },
    [authBackend, runAuth],
  )

  const signUpWithPassword = useCallback(
    ({ username, email, password, backend = authBackend }) => {
      return runAuth(async () => {
        const cleanEmail = String(email || '').trim().toLowerCase()
        const cleanUsername = String(username || '').trim().toLowerCase()
        if (!cleanEmail.includes('@')) throw new Error('Enter a valid email address.')
        if (!password || password.length < 6) throw new Error(t('passwordShort'))

        if (cleanUsername) {
          saveUsernameLocal(cleanUsername, cleanEmail)
          await fetch('/api/auth/register-username', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: cleanUsername, email: cleanEmail }),
          }).catch(() => {})
        }

        if (backend === 'supabase') {
          if (isMockMode) {
            throw new Error('Supabase is not configured yet (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY), or switch the Auth Engine toggle to Firebase.')
          }
          const { data, error } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
              data: cleanUsername ? { username: cleanUsername } : {},
              emailRedirectTo: `${window.location.origin}/signin`,
            },
          })
          if (error) throw error
          return {
            needsEmailConfirmation: !data.session,
            email: cleanEmail,
            backend: 'supabase',
          }
        }

        const cred = await signUpWithEmail(cleanEmail, password, cleanUsername || cleanEmail.split('@')[0])
        return {
          needsEmailConfirmation: !cred.user?.emailVerified,
          email: cleanEmail,
          backend: 'firebase',
        }
      })
    },
    [authBackend, runAuth],
  )

  const requestPasswordReset = useCallback(
    ({ identifier, backend = authBackend }) => {
      return runAuth(async () => {
        const email = await resolveIdentifierToEmail(identifier)
        if (backend === 'supabase') {
          if (isMockMode) {
            throw new Error('Supabase is not configured yet (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY), or switch the Auth Engine toggle to Firebase.')
          }
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/signin`,
          })
          if (error) throw error
          return { email, backend: 'supabase' }
        }
        await sendFirebasePasswordReset(email)
        return { email, backend: 'firebase' }
      })
    },
    [authBackend, runAuth],
  )

  const resendVerification = useCallback(async () => {
    await resendFirebaseVerification()
    return true
  }, [])

  const refreshVerification = useCallback(async () => {
    const updated = await reloadFirebaseUser()
    if (updated) {
      setState(prev =>
        prev.session
          ? {
              ...prev,
              session: {
                ...prev.session,
                user: { ...prev.session.user, emailVerified: updated.emailVerified },
              },
            }
          : prev,
      )
    }
    return Boolean(updated?.emailVerified)
  }, [])

  const signOut = useCallback(
    async (notice = '') => {
      if (identity.current && !retainShop) {
        storeSelection(identity.current, {})
      }
      identity.current = null
      api.setScope({ userId: null })
      try {
        window.sessionStorage.removeItem('__kms_playwright_session')
        window.sessionStorage.removeItem(OAUTH_SESSION_KEY)
      } catch {
        // ignore storage access issues
      }
      if (!isMockMode) {
        try {
          await supabase.auth.signOut({ scope: 'local' })
        } catch {
          // ignore
        }
      }
      try {
        await signOutFirebase()
      } catch {
        // ignore offline sign-out error
      }
      setState({ session: null, loading: false, recovery: null, notice })
      return true
    },
    [retainShop],
  )

  const revokeAllSessions = useCallback(async () => {
    const targetUid = identity.current || state.session?.user?.id
    const ts = Date.now()
    try {
      localStorage.setItem(SESSION_REVOKED_KEY, String(ts))
    } catch {
      // ignore
    }
    if (targetUid) {
      await fetch('/api/auth/sessions/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUid }),
      }).catch(() => {})
    }
    await signOut('All active sessions on this account were revoked.')
  }, [signOut, state.session?.user?.id])

  const requestPhoneOtp = useCallback(
    phone =>
      runAuth(async () => {
        const res = await fetch('/api/auth/otp/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.detail || data.error || 'Could not send OTP SMS.')
        }
        return data
      }),
    [runAuth],
  )

  const verifyPhoneOtp = useCallback(
    ({ phone, code }) =>
      runAuth(async () => {
        const res = await fetch('/api/auth/otp/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, code }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.user) {
          throw new Error(data.detail || 'OTP verification failed.')
        }
        const session = {
          access_token: 'phone-otp-session',
          provider: 'phone-otp',
          user: {
            id: data.user.id,
            email: data.user.email,
            phone: data.user.phone,
            displayName: data.user.displayName,
            emailVerified: true,
          },
        }
        try {
          window.sessionStorage.setItem(OAUTH_SESSION_KEY, JSON.stringify(session))
        } catch {
          // ignore
        }
        const now = Date.now()
        setSessionStartedAt(now)
        identity.current = session.user.id
        api.setScope({ userId: session.user.id })
        setState({ session, loading: false, recovery: null, notice: '' })
        return session
      }),
    [runAuth],
  )

  useEffect(() => {
    const onStorage = e => {
      if (e.key === SESSION_REVOKED_KEY && e.newValue && identity.current) {
        void signOut('Signed out because sessions were revoked in another tab.')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [signOut])

  useEffect(() => {
    if (!state.session) return undefined
    const touch = () => {
      lastActivityRef.current = Date.now()
    }
    const events = ['pointerdown', 'keydown', 'scroll']
    events.forEach(ev => window.addEventListener(ev, touch, { passive: true }))
    const timer = setInterval(() => {
      if (Date.now() - lastActivityRef.current > SESSION_IDLE_TIMEOUT_MS) {
        void signOut('Session automatically locked after 30 minutes of inactivity.')
      }
    }, 60_000)
    return () => {
      events.forEach(ev => window.removeEventListener(ev, touch))
      clearInterval(timer)
    }
  }, [state.session, signOut])

  useEffect(() => {
    const handleOAuthMessage = event => {
      const origin = event.origin || ''
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
        return
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data?.user) {
        const u = event.data.user
        const session = {
          access_token: 'github-oauth-session',
          provider: 'github-oauth',
          user: {
            id: u.id,
            email: u.email,
            username: u.username || '',
            displayName: u.displayName || u.username || 'GitHub User',
            photoURL: u.photoURL || '',
            emailVerified: true,
          },
        }
        try {
          window.sessionStorage.setItem(OAUTH_SESSION_KEY, JSON.stringify(session))
        } catch {
          // ignore
        }
        identity.current = session.user.id
        api.setScope({ userId: session.user.id })
        setState({ session, loading: false, recovery: null, notice: '' })
        githubPopupResolver.current?.resolve(session)
        githubPopupResolver.current = null
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        const err = new Error(event.data.error || 'GitHub OAuth failed.')
        githubPopupResolver.current?.reject(err)
        githubPopupResolver.current = null
      }
    }
    window.addEventListener('message', handleOAuthMessage)
    return () => window.removeEventListener('message', handleOAuthMessage)
  }, [])

  useEffect(() => {
    void testConnection()
    let active = true

    let supaSub = null
    if (!isMockMode) {
      supabase.auth.getSession().then(({ data }) => {
        if (!active || !data?.session?.user) return
        const s = data.session
        const session = {
          access_token: s.access_token,
          provider: 'supabase',
          user: {
            id: s.user.id,
            email: s.user.email || '',
            username: s.user.user_metadata?.username || '',
            displayName: s.user.user_metadata?.username || s.user.email?.split('@')[0] || 'Shop User',
            photoURL: s.user.user_metadata?.avatar_url || '',
            emailVerified: Boolean(s.user.email_confirmed_at),
          },
        }
        identity.current = session.user.id
        api.setScope({ userId: session.user.id })
        setState({ session, loading: false, recovery: null, notice: '' })
      })

      const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
        if (!active) return
        if (s?.user) {
          const session = {
            access_token: s.access_token,
            provider: 'supabase',
            user: {
              id: s.user.id,
              email: s.user.email || '',
              username: s.user.user_metadata?.username || '',
              displayName: s.user.user_metadata?.username || s.user.email?.split('@')[0] || 'Shop User',
              photoURL: s.user.user_metadata?.avatar_url || '',
              emailVerified: Boolean(s.user.email_confirmed_at),
            },
          }
          identity.current = session.user.id
          api.setScope({ userId: session.user.id })
          setState({ session, loading: false, recovery: null, notice: '' })
        } else if (!auth.currentUser && !readLocalOAuthSession()) {
          identity.current = null
          api.setScope({ userId: null })
          setState(prev => ({ session: null, loading: false, recovery: null, notice: prev.notice }))
        }
      })
      supaSub = listener?.subscription
    }

    const unsub = onAuthStateChanged(auth, firebaseUser => {
      if (!active) return
      if (firebaseUser) {
        const session = {
          access_token: 'firebase-session',
          provider: 'firebase',
          user: {
            id: firebaseUser.uid,
            email: firebaseUser.email || 'owner@kenyamoto.co.ke',
            displayName: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Kenya Motor User',
            photoURL: firebaseUser.photoURL || '',
            emailVerified: firebaseUser.emailVerified,
          },
        }
        identity.current = session.user.id
        api.setScope({ userId: session.user.id })
        setState({ session, loading: false, recovery: null, notice: '' })
        return
      }
      const oauthSession = readLocalOAuthSession()
      if (oauthSession) {
        identity.current = oauthSession.user.id
        api.setScope({ userId: oauthSession.user.id })
        setState({ session: oauthSession, loading: false, recovery: null, notice: '' })
        return
      }
      if (!isMockMode) {
        // Keep Supabase session if active
        supabase.auth.getSession().then(({ data }) => {
          if (!active) return
          if (data?.session?.user) return
          identity.current = null
          api.setScope({ userId: null })
          setState(prev => ({ session: null, loading: false, recovery: null, notice: prev.notice }))
        })
        return
      }
      identity.current = null
      api.setScope({ userId: null })
      setState(prev => ({ session: null, loading: false, recovery: null, notice: prev.notice }))
    })
    return () => {
      active = false
      unsub()
      supaSub?.unsubscribe?.()
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        authBackend,
        setAuthBackend,
        supabaseConfigured: !isMockMode,
        retainShop,
        setRetainShop,
        signOut,
        revokeAllSessions,
        sessionStartedAt,
        requestPhoneOtp,
        verifyPhoneOtp,
        signInGoogle,
        signInGithub,
        signInWithPassword,
        signUpWithPassword,
        requestPasswordReset,
        resendVerification,
        refreshVerification,
        runAuth,
        authBusy,
      }}
    >
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
