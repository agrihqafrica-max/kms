import { Link } from 'react-router-dom'
import { t } from '../i18n/index.js'

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
export function Brand() { return <div className="brand"><div className="brand-mark" aria-hidden="true">{t('brandMark')}</div><div><strong>{t('brand')}</strong><span>{t('brandSub')}</span></div></div> }
export function ConfigError({ names }) { return <main className="auth-page"><section className="auth-card"><Brand /><h1>{t('configTitle')}</h1><p>{t('configBody')}</p><ul>{names.map(name => <li key={name}>{name}</li>)}</ul></section></main> }
