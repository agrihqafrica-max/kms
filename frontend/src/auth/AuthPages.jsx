import { useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from './context.js'
import { Brand, Loading } from '../components/States.jsx'
import { t } from '../i18n/index.js'
import { recoveryMatches, updateRecoveryPassword } from './sessionState.js'
import { config } from '../lib/env.js'

export default function AuthPage({ mode }) {
  const { session, loading, recovery, notice, signOut, runAuth, authBusy } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const destination = /^\/app\/(overview|pos|inventory|radar|finance|dispatch)$/.test(location.state?.from ?? '') ? location.state.from : '/app/overview'
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const titles = { signin: 'signIn', signup: 'signUp', reset: 'resetPassword', update: 'updatePassword' }
  if (loading) return <Loading />
  if (session && mode !== 'update' && mode !== 'reset') return <Navigate to={recovery ? '/update-password' : destination} state={location.state} replace />
  const invalidRecovery = mode === 'update' && !recoveryMatches(recovery, session)

  async function submit(event) {
    event.preventDefault()
    if (submitting.current || authBusy || loading || invalidRecovery) return
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (mode === 'signup' || mode === 'update') {
      if (password.length < 6) { setError(t('passwordShort')); return }
      if (password !== form.get('confirmation')) { setError(t('passwordMismatch')); return }
    }
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const result = await runAuth(() => {
        if (mode === 'signin') return supabase.auth.signInWithPassword({ email, password })
        if (mode === 'signup') return supabase.auth.signUp({ email, password })
        if (mode === 'reset') return supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/update-password` })
        return updateRecoveryPassword(supabase.auth, recovery, password, config)
      })
      if (mode === 'reset') {
        if (result.error?.status === 429) setError(t('rateLimited'))
        else setSuccess(t('resetSent'))
      } else if (result.error) {
        setError(t(result.error.status === 429 ? 'rateLimited' : mode === 'signin' ? 'invalidCredentials' : 'authError'))
      } else if (mode === 'signup' && !result.data.session) {
        setSuccess(t('checkEmailBody', { email }))
      } else if (mode === 'update') {
        const { data } = await supabase.auth.getSession()
        if (!recoveryMatches(recovery, data.session)) return
        if (await signOut(t('passwordUpdated'))) navigate('/signin', { replace: true })
      }
    } catch (failure) {
      setError(t(failure.name !== 'AbortError' ? 'networkError' : mode === 'update' ? 'recoveryInvalid' : 'authInProgress'))
    } finally { submitting.current = false; setBusy(false) }
  }

  return <main className="auth-page">
    <section className="auth-intro"><Brand /><h2>{t('welcome')}</h2><p>{t('welcomeBody')}</p><small>{t('secureNote')}</small></section>
    <section className="auth-card">
      <h1 tabIndex={-1}>{t(titles[mode])}</h1>
      {notice && <p className="notice" role="status">{notice}</p>}
      {invalidRecovery ? <p role="alert">{t('recoveryInvalid')}</p> : success ? <div role="status"><h2>{t('checkEmail')}</h2><p>{success}</p></div> : <form onSubmit={submit}>
        {mode !== 'update' && <label>{t('email')}<input name="email" type="email" autoComplete="email" required disabled={busy || authBusy} /></label>}
        {mode !== 'reset' && <label>{t('password')}<input name="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required disabled={busy || authBusy} aria-describedby={error ? 'auth-error' : undefined} /></label>}
        {(mode === 'signup' || mode === 'update') && <label>{t('confirmPassword')}<input name="confirmation" type="password" autoComplete="new-password" required disabled={busy || authBusy} /></label>}
        {error && <p className="form-error" id="auth-error" role="alert">{error}</p>}
        <button className="primary" type="submit" disabled={busy || authBusy}>{t(busy || authBusy ? 'working' : titles[mode])}</button>
      </form>}
      <div className="auth-links">
        {mode === 'signin' ? <><Link to="/reset-password">{t('forgotPassword')}</Link><p>{t('newAccount')} <Link to="/signup">{t('signUp')}</Link></p></> : <Link to="/signin">{t('backSignIn')}</Link>}
        {invalidRecovery && <Link to="/reset-password">{t('resetPassword')}</Link>}
      </div>
    </section>
  </main>
}
