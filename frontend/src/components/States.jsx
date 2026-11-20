import { useState } from 'react'
import { Link } from 'react-router-dom'
import { t } from '../i18n/index.js'
import redMotoGpLogo from '../assets/red_motogp_logo.jpg'

export function Loading() { return <div className="state-panel" role="status">{t('loading')}</div> }
export function ErrorState({ error, retry }) {
  const forbidden = error?.status === 403
  const branch = error?.status === 400 && error.detail?.includes?.('X-Branch-Id')
  return <section className="state-panel error-panel" role="alert">
    <h2>{t(forbidden ? 'permissionTitle' : branch ? 'branchRequired' : 'errorTitle')}</h2>
    <p>{branch ? t('branchUnavailable') : error?.message ?? t('requestError')}</p>
    <div className="actions">
      {forbidden ? <><a className="button-link" href="#tenant-switcher">{t('chooseBranch')}</a><Link className="button-link" to="/select-organization">{t('switchOrg')}</Link><Link className="button-link" to="/app/overview">{t('backOverview')}</Link></> : retry && <button onClick={retry}>{t('retry')}</button>}
    </div>
  </section>
}
export function SuperbikeLogo() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 32 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="17" r="4.5" />
      <circle cx="25" cy="17" r="4.5" />
      <path d="M11.5 17h4.8l4.2-6.5h4.2" />
      <path d="M9.5 12.2 15 9.2l4.8 1.3" />
      <path d="M19.2 7.2 22.8 6l2.4 5.2" />
      <path d="M22.8 6 24.5 4.5" />
      <path d="M7 17l4.2-4.8" />
    </svg>
  )
}

export function Brand({ showSub = true, asHeading = false } = {}) {
  const [logoError, setLogoError] = useState(false)
  return (
    <div className="brand">
      <div className="brand-mark" aria-hidden="true">
        {logoError ? (
          <SuperbikeLogo />
        ) : (
          <img
            src={redMotoGpLogo}
            alt=""
            className="brand-logo-img"
            referrerPolicy="no-referrer"
            onError={() => setLogoError(true)}
          />
        )}
      </div>
      <div>
        {asHeading ? (
          <h1 className="brand-title" tabIndex={-1}>{t('brand')}</h1>
        ) : (
          <strong>{t('brand')}</strong>
        )}
        {showSub && <span>{t('brandSub')}</span>}
      </div>
    </div>
  )
}

export function ConfigError({ names }) { return <main className="auth-page"><section className="auth-card"><Brand showSub={false} /><h1>{t('configTitle')}</h1><p>{t('configBody')}</p><ul>{names.map(name => <li key={name}>{name}</li>)}</ul></section></main> }
