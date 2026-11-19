import { useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context.js'
import { Brand, Loading } from '../components/States.jsx'
import { t } from '../i18n/index.js'

export default function AuthPage() {
  const { session, loading, notice, signInGoogle, authBusy } = useAuth()
  const location = useLocation()
  const destination = /^\/app\/(overview|pos|inventory|radar|finance|dispatch|assistant|network)$/.test(location.state?.from ?? '')
    ? location.state.from
    : '/app/overview'
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  if (loading) return <Loading />
  if (session) return <Navigate to={destination} state={location.state} replace />

  async function handleGoogleSignIn() {
    if (submitting.current || authBusy) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      await signInGoogle()
    } catch (failure) {
      const code = failure?.code || ''
      if (code === 'auth/popup-closed-by-user') {
        setError('Google sign-in popup was closed before completing.')
      } else if (code === 'auth/popup-blocked') {
        setError('Popup was blocked by the browser. Allow popups for this site and try again.')
      } else {
        setError(failure?.message || t('authError'))
      }
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-intro">
        <Brand />
        <h2>{t('welcome')}</h2>
        <p>Sign in with Google to manage Nairobi &amp; regional motorcycle spare-parts branches, offline-first POS, procurement, dispatch, Parts Radar, KRA eTIMS, and Gemini AI co-pilots.</p>
        <small>Your workspace data is isolated per verified Google account inside Cloud Firestore.</small>
      </section>
      <section className="auth-card">
        <h1 tabIndex={-1}>{t('signIn')}</h1>
        {notice && <p className="notice" role="status">{notice}</p>}
        <p className="muted">Authenticate with your Google business account to unlock live multi-branch sync and AI supply-chain tools.</p>
        {error && <p className="form-error" id="auth-error" role="alert">{error}</p>}
        <button
          className="primary google-signin-btn"
          type="button"
          onClick={handleGoogleSignIn}
          disabled={busy || authBusy}
        >
          {busy || authBusy ? t('working') : 'Sign in with Google'}
        </button>
      </section>
    </main>
  )
}
