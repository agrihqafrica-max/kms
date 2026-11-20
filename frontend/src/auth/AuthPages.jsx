import { useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context.js'
import { Brand, Loading } from '../components/States.jsx'
import { t } from '../i18n/index.js'
import sparesWorkshopBg from '../assets/spares_workshop_bg.jpg'

function mapAuthError(failure) {
  const code = failure?.code || ''
  if (code === 'auth/popup-closed-by-user') return 'Sign-in popup was closed before completing.'
  if (code === 'auth/popup-blocked') return 'Popup was blocked by the browser. Allow popups for this site and try again.'
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return t('invalidCredentials')
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Sign in or reset your password.'
  }
  if (code === 'auth/operation-not-allowed') {
    return 'This sign-in method is not enabled yet. Use Continue with Google or contact your administrator.'
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'An account already exists with this email under another sign-in method.'
  }
  return failure?.message || t('authError')
}

export default function AuthPage() {
  const {
    session,
    loading,
    notice,
    retainShop,
    setRetainShop,
    signInGoogle,
    signInWithPassword,
    signUpWithPassword,
    requestPasswordReset,
    requestPhoneOtp,
    verifyPhoneOtp,
    authBusy,
  } = useAuth()
  const location = useLocation()
  const destination = /^\/app\/(overview|pos|inventory|radar|finance|dispatch|assistant|network)$/.test(location.state?.from ?? '')
    ? location.state.from
    : '/app/overview'

  const [mode, setMode] = useState('signin')
  const [identifier, setIdentifier] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [phone, setPhone] = useState('+254')
  const [otpCode, setOtpCode] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  if (loading) return <Loading />
  if (session) return <Navigate to={destination} state={location.state} replace />

  async function runAction(fn) {
    if (submitting.current || authBusy) return
    submitting.current = true
    setBusy(true)
    setError('')
    setInfo('')
    try {
      await fn()
    } catch (failure) {
      setError(mapAuthError(failure))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
    setInfo('')
  }

  async function handleFormSubmit(event) {
    event.preventDefault()
    if (mode === 'signin') {
      await runAction(async () => {
        await signInWithPassword({ identifier, password, backend: 'firebase' })
      })
    } else if (mode === 'signup') {
      if (password.length < 6) {
        setError(t('passwordShort'))
        return
      }
      if (password !== confirmation) {
        setError(t('passwordMismatch'))
        return
      }
      await runAction(async () => {
        const result = await signUpWithPassword({ username, email, password, backend: 'firebase' })
        if (result?.needsEmailConfirmation) {
          setInfo(t('checkEmailBody', { email: result.email }))
        }
      })
    } else if (mode === 'reset') {
      await runAction(async () => {
        const result = await requestPasswordReset({ identifier, backend: 'firebase' })
        setInfo(t('resetSent', { email: result.email }))
      })
    } else if (mode === 'otp') {
      await runAction(async () => {
        if (!otpSent) {
          await requestPhoneOtp(phone)
          setOtpSent(true)
          setInfo(`Sent 6-digit SMS code to ${phone}. Enter the code below within 5 minutes.`)
        } else {
          await verifyPhoneOtp({ phone, code: otpCode })
        }
      })
    }
  }

  const disabled = busy || authBusy

  return (
    <main className="auth-page">
      <div className="auth-bg-backdrop" aria-hidden="true">
        <img
          className="auth-bg-image"
          src={sparesWorkshopBg}
          alt=""
          referrerPolicy="no-referrer"
        />
        <div className="auth-bg-scrim" />
      </div>

      <section className="auth-card" aria-label="Sign in to Kenya Motorcycle Spare Parts Ecosystem">
        <div className="auth-brand-header">
          <Brand showSub={false} asHeading />
        </div>

        <h2 className="auth-mode-title">
          {mode === 'signin'
            ? 'Sign in'
            : mode === 'signup'
              ? 'Register'
              : mode === 'otp'
                ? 'Phone OTP'
                : 'Reset password'}
        </h2>

        {notice && <p className="notice" role="status">{notice}</p>}
        {info && <p className="notice" role="status">{info}</p>}
        {error && <p className="form-error" id="auth-error" role="alert">{error}</p>}

        <form onSubmit={handleFormSubmit} className="auth-form">
          {mode === 'signin' && (
            <>
              <label>
                Email
                <input
                  name="identifier"
                  type="text"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  required
                  disabled={disabled}
                />
              </label>
              <label>
                {t('password')}
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  disabled={disabled}
                />
              </label>
              <div className="auth-row-between">
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={retainShop}
                    onChange={e => setRetainShop(e.target.checked)}
                    disabled={disabled}
                  />
                  Remember me
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => switchMode('reset')}
                >
                  Forgot password?
                </button>
              </div>
              <button className="primary login-submit-btn" type="submit" disabled={disabled}>
                {disabled ? t('working') : 'Sign in'}
              </button>
            </>
          )}

          {mode === 'signup' && (
            <>
              <label>
                {t('username')}
                <input
                  name="username"
                  type="text"
                  autoComplete="username"
                  placeholder="e.g. kenyamotor_shop"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  minLength={2}
                  required
                  disabled={disabled}
                />
              </label>
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  disabled={disabled}
                />
              </label>
              <label>
                {t('password')}
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={6}
                  required
                  disabled={disabled}
                />
              </label>
              <label>
                {t('confirmPassword')}
                <input
                  name="confirmation"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={confirmation}
                  onChange={e => setConfirmation(e.target.value)}
                  minLength={6}
                  required
                  disabled={disabled}
                />
              </label>
              <button className="primary login-submit-btn" type="submit" disabled={disabled}>
                {disabled ? t('working') : 'Register'}
              </button>
            </>
          )}

          {mode === 'otp' && (
            <>
              <label>
                Kenyan Mobile Number (+254)
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+254712345678"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  required
                  disabled={disabled || otpSent}
                />
              </label>
              {otpSent && (
                <label>
                  6-Digit SMS Verification Code
                  <input
                    name="otpCode"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value)}
                    required
                    disabled={disabled}
                  />
                </label>
              )}
              <div className="actions-inline">
                <button className="primary login-submit-btn" type="submit" disabled={disabled}>
                  {disabled ? t('working') : otpSent ? 'Verify Code & Sign In' : 'Send SMS Code'}
                </button>
                {otpSent && (
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => {
                      setOtpSent(false)
                      setOtpCode('')
                    }}
                  >
                    Change Number
                  </button>
                )}
              </div>
            </>
          )}

          {mode === 'reset' && (
            <>
              <label>
                Email
                <input
                  name="identifier"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  required
                  disabled={disabled}
                />
              </label>
              <button className="primary login-submit-btn" type="submit" disabled={disabled}>
                {disabled ? t('working') : 'Send Password Reset Email'}
              </button>
            </>
          )}
        </form>

        <div className="auth-divider" aria-hidden="true">
          <span>or</span>
        </div>

        <button
          className="oauth-btn google-signin-btn"
          type="button"
          onClick={() => void runAction(() => signInGoogle('firebase'))}
          disabled={disabled}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
            />
          </svg>
          <span>Continue with Google</span>
        </button>

        <div className="auth-mode-footer" role="tablist" aria-label="Sign-in options">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={`auth-mode-btn${mode === 'signin' ? ' active' : ''}`}
            onClick={() => switchMode('signin')}
            disabled={disabled}
          >
            Password
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={`auth-mode-btn${mode === 'signup' ? ' active' : ''}`}
            onClick={() => switchMode('signup')}
            disabled={disabled}
          >
            Register
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'otp'}
            className={`auth-mode-btn${mode === 'otp' ? ' active' : ''}`}
            onClick={() => switchMode('otp')}
            disabled={disabled}
          >
            Phone OTP
          </button>
        </div>
      </section>
    </main>
  )
}
