const STORAGE_KEY = 'kms.mock.session'
const DEFAULT_USER_ID = '30000000-0000-4000-8000-000000000001'

function encodeBase64Url(value) {
  return btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function buildSession(email = 'owner@kenyamoto.co.ke', userId = DEFAULT_USER_ID) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const iat = Math.floor(Date.now() / 1000)
  const sessionId = `mock-session-${iat}`
  const access_token = `${encodeBase64Url({ alg: 'HS256', typ: 'JWT' })}.${encodeBase64Url({
    sub: userId,
    email,
    session_id: sessionId,
    exp,
    iat,
    aud: 'authenticated',
    role: 'authenticated',
  })}.mock-signature`
  return {
    access_token,
    refresh_token: `mock-refresh-${iat}`,
    expires_in: 3600,
    expires_at: exp,
    token_type: 'bearer',
    user: {
      id: userId,
      email,
      aud: 'authenticated',
      role: 'authenticated',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  }
}

export function createMockSupabase() {
  let currentSession = null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) currentSession = JSON.parse(raw)
  } catch {
    currentSession = null
  }

  const listeners = new Set()
  const notify = (event, session) => {
    for (const cb of listeners) {
      try { cb(event, session) } catch { /* ignore listener errors */ }
    }
  }
  const persist = session => {
    currentSession = session
    try {
      if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
      else localStorage.removeItem(STORAGE_KEY)
    } catch { /* ignore storage errors */ }
  }

  return {
    auth: {
      async getSession() {
        return { data: { session: currentSession }, error: null }
      },
      async refreshSession() {
        if (!currentSession) return { data: { session: null }, error: new Error('No session') }
        const rotated = buildSession(currentSession.user?.email, currentSession.user?.id)
        persist(rotated)
        notify('TOKEN_REFRESHED', rotated)
        return { data: { session: rotated }, error: null }
      },
      onAuthStateChange(callback) {
        listeners.add(callback)
        return {
          data: {
            subscription: {
              unsubscribe: () => listeners.delete(callback),
            },
          },
        }
      },
      async signInWithPassword({ email, password }) {
        if (!email || !password) {
          return { data: { session: null, user: null }, error: { status: 400, message: 'Invalid login credentials' } }
        }
        const session = buildSession(email)
        persist(session)
        notify('SIGNED_IN', session)
        return { data: { session, user: session.user }, error: null }
      },
      async signUp({ email, password }) {
        if (!email || !password || password.length < 6) {
          return { data: { session: null, user: null }, error: { status: 400, message: 'Invalid signup details' } }
        }
        const session = buildSession(email)
        persist(session)
        notify('SIGNED_IN', session)
        return { data: { session, user: session.user }, error: null }
      },
      async resetPasswordForEmail() {
        return { data: {}, error: null }
      },
      async signOut() {
        persist(null)
        notify('SIGNED_OUT', null)
        return { error: null }
      },
    },
  }
}
