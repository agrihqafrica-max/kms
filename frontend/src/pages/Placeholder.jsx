import { t } from '../i18n/index.js'
export default function Placeholder({ page }) {
  return <section className="card simple-page"><h2>{t(page)}</h2><p>{t(`${page}Future`)}</p><p className="badge">{t('notAvailable')}</p></section>
}
