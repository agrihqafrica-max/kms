import { useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context.js'
import { Brand, Loading } from '../components/States.jsx'
import { t } from '../i18n/index.js'

function mapAuthError(failure) {
  const code = failure?.code || ''
  if (code === 'auth/popup-closed-by-user') return 'Sign-in popup was closed before completing.'
  if (code === 'auth/popup-blocked') return 'Popup was blocked by the browser. Allow popups for this site and try again.'
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return t('invalidCredentials')
  }
  if (code === 'auth/email-already-in-use') {
    return 'An account with this email already exists. Switch to Sign In or Reset Password.'
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Enable this sign-in provider (Email/Password or GitHub) in Firebase Console → Authentication → Sign-in method, or use Continue with Gmail.'
  }
  if (code === 'auth/account-exists-with-different-credential') {
    return 'An account already exists with the same email under another sign-in method. Sign in with your original method first.'
  }
  return failure?.message || t('authError')
}

export default function AuthPage() {
  const {
    session,
    loading,
    notice,
    authBackend,
    setAuthBackend,
    supabaseConfigured,
    retainShop,
    setRetainShop,
    signInGoogle,
    signInGithub,
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

  async function handleFormSubmit(event) {
    event.preventDefault()
    if (mode === 'signin') {
      await runAction(async () => {
        await signInWithPassword({ identifier, password, backend: authBackend })
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
        const result = await signUpWithPassword({ username, email, password, backend: authBackend })
        if (result?.needsEmailConfirmation) {
          setInfo(t('checkEmailBody', { email: result.email }))
        }
      })
    } else if (mode === 'reset') {
      await runAction(async () => {
        const result = await requestPasswordReset({ identifier, backend: authBackend })
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
      <section className="auth-intro">
        <Brand />
        <h2>{t('welcome')}</h2>
        <p>{t('welcomeBody')}</p>
        <div className="auth-company-list" aria-label="Ecosystem companies">
          <strong>Companies inside Kenya Motorcycle Spare Parts General</strong>
          <ul>
            <li>Kenya Motor (Nairobi CBD &amp; Industrial Area)</li>
            <li>Kirinyaga Spares &amp; Workshop</li>
            <li>Rift Valley Boda Parts</li>
            <li>Plus your own registered shops &amp; workshops</li>
          </ul>
        </div>
        <small>{t('secureNote')}</small>
      </section>

      <section className="auth-card">
        <div className="auth-card-head">
          <h1 tabIndex={-1}>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? t('signUp') : mode === 'otp' ? 'Phone OTP Login' : t('resetPassword')}</h1>
          <div className="backend-toggle" role="group" aria-label="Authentication backend">
            <button
              type="button"
              className={authBackend === 'firebase' ? 'active' : ''}
              onClick={() => {
                setAuthBackend('firebase')
                setError('')
              }}
              disabled={disabled}
            >
              Firebase
            </button>
            <button
              type="button"
              className={authBackend === 'supabase' ? 'active' : ''}
              onClick={() => {
                setAuthBackend('supabase')
                setError('')
              }}
              disabled={disabled}
            >
              Supabase {supabaseConfigured ? '' : '(Setup)'}
            </button>
          </div>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Sign-in mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signin'}
            className={mode === 'signin' ? 'active' : ''}
            onClick={() => {
              setMode('signin')
              setError('')
              setInfo('')
            }}
          >
            Password
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => {
              setMode('signup')
              setError('')
              setInfo('')
            }}
          >
            Register
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'otp'}
            className={mode === 'otp' ? 'active' : ''}
            onClick={() => {
              setMode('otp')
              setError('')
              setInfo('')
            }}
          >
            Phone OTP
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'reset'}
            className={mode === 'reset' ? 'active' : ''}
            onClick={() => {
              setMode('reset')
              setError('')
              setInfo('')
            }}
          >
            Reset
          </button>
        </div>

        {authBackend === 'supabase' && !supabaseConfigured && (
          <p className="notice" role="status">
            Supabase URL/Anon Key are not set in environment variables yet (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Configure them in Settings &gt; Secrets or switch to Firebase above.
          </p>
        )}

        {notice && <p className="notice" role="status">{notice}</p>}
        {info && <p className="notice" role="status">{info}</p>}
        {error && <p className="form-error" id="auth-error" role="alert">{error}</p>}

        <form onSubmit={handleFormSubmit} className="auth-form">
          {mode === 'signin' && (
            <>
              <label>
                {t('email')}
                <input
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="username or name@gmail.com"
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
                  Remember my shop / workshop
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setMode('reset')
                    setError('')
                  }}
                >
                  {t('forgotPassword')}
                </button>
              </div>
              <button className="primary login-submit-btn" type="submit" disabled={disabled}>
                <span aria-hidden="true">→</span>
                {disabled ? t('working') : t('signIn')}
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
                {t('emailOnly')}
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@gmail.com"
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
                {disabled ? t('working') : 'Create Account & Send Email Verification'}
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
                  {disabled ? t('working') : otpSent ? 'Verify Code & Sign In' : 'Send SMS Verification Code'}
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
                {t('email')}
                <input
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  placeholder="Enter your username or Gmail/email"
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
          <span>or continue with</span>
        </div>

        <div className="oauth-grid">
          <button
            className="oauth-btn"
            type="button"
            onClick={() => void runAction(() => signInGoogle(authBackend))}
            disabled={disabled}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.2 14.7 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12S6.6 21.8 12 21.8c6.9 0 9.6-4.8 9.6-7.3 0-.5-.1-.9-.1-1.3H12z" />
            </svg>
            <span>Gmail (Google)</span>
          </button>
          <button
            className="oauth-btn"
            type="button"
            onClick={() => void runAction(() => signInGithub(authBackend))}
            disabled={disabled}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-1.95c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.08 0 4.41-2.7 5.39-5.26 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.66.79.55A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
            </svg>
            <span>GitHub</span>
          </button>
        </div>
      </section>
    </main>
  )
}
