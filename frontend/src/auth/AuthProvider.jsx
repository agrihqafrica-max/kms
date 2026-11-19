import { useCallback, useEffect, useRef, useState } from 'react'
import { AuthContext } from './context.js'
import { api, supabase } from '../lib/supabase.js'
import { storeSelection } from '../tenancy/selection.js'
import { t } from '../i18n/index.js'
import { authStateFromEvent } from './sessionState.js'

export default function AuthProvider({ children }) {
  const [state, setState] = useState({ session: null, loading: true, recovery: null, notice: '' })
  const identity = useRef(null)
  const teardown = useRef(null)
  const ending = useRef(false)
  const pendingAuth = useRef(null)
  const [authBusy, setAuthBusy] = useState(false)

  const runAuth = useCallback(async action => {
    if (pendingAuth.current || teardown.current) throw new DOMException('Authentication operation in progress', 'AbortError')
    const operation = Promise.resolve().then(action)
    pendingAuth.current = operation
    setAuthBusy(true)
    try {
      const result = await operation
      if (ending.current) throw new DOMException('Authentication superseded by sign-out', 'AbortError')
      return result
    } finally { pendingAuth.current = null; setAuthBusy(false) }
  }, [])

  const signOut = useCallback((notice = '') => {
    if (teardown.current) return teardown.current
    ending.current = true
    if (identity.current) storeSelection(identity.current, {})
    identity.current = null
    api.setScope({ userId: null })
    setState({ session: null, loading: true, recovery: null, notice })
    const operation = Promise.resolve().then(async () => {
      // A late provider response must settle before local removal, or it could restore its session afterwards.
      try { await pendingAuth.current } catch { /* Its outcome is discarded by teardown. */ }
      try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* Verify local removal even when server revocation fails. */ }
      let cleared = false
      try {
        const { data, error } = await supabase.auth.getSession()
        cleared = !error && !data.session
      } catch { cleared = false }
      ending.current = !cleared
      setState({ session: null, loading: false, recovery: null, notice, teardownError: !cleared })
      return cleared
    }).finally(() => { teardown.current = null })
    teardown.current = operation
    return operation
  }, [])

  useEffect(() => {
    let active = true
    let events = 0
    const update = (session, event) => {
      if (!active || ending.current) return
      const userId = session?.user.id ?? null
      if (identity.current !== userId) {
        if (identity.current) storeSelection(identity.current, {})
        identity.current = userId
        api.setScope({ userId })
      }
      setState(previous => authStateFromEvent(previous, session, event))
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      events++
      update(session, event)
    })
    const before = events
    supabase.auth.getSession().then(({ data, error }) => {
      if (events === before) update(error ? null : data.session)
    }).catch(() => { if (events === before) update(null) })
    api.setHandlers({ onExpired: () => { void signOut(t('sessionExpired')) }, onNetworkError: () => window.dispatchEvent(new Event('kms:network-error')) })
    return () => { active = false; subscription.unsubscribe(); api.setHandlers({ onExpired: null, onNetworkError: null }) }
  }, [signOut])

  return <AuthContext.Provider value={{ ...state, signOut, runAuth, authBusy }}>
    {state.teardownError ? <main className="selection-page"><p role="alert">{t('signOutFailed')}</p><button onClick={() => signOut(state.notice)}>{t('signOut')}</button></main> : children}
  </AuthContext.Provider>
}
