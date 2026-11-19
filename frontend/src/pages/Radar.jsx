import { useLiveData } from '../lib/useLiveData.js'
import { Loading, ErrorState } from '../components/States.jsx'
import { formatDate } from '../lib/format.js'
import { t } from '../i18n/index.js'

export default function Radar() {
  const result = useLiveData('/radar/requests')
  return <section className="card"><h2>{t('radar')}</h2>
    {result.loading ? <Loading /> : result.error ? <ErrorState error={result.error} retry={result.retry} /> : !result.data?.length ? <p className="state-panel">{t('radarEmpty')}</p> : <ul className="request-list">{result.data.map(row => <li key={row.id}><strong>{row.part_description}</strong><span>{row.motorcycle_model}</span><div className="request-meta"><span>{row.urgency_status}</span><span>{row.status}</span><time dateTime={row.created_at}>{formatDate(row.created_at)}</time></div></li>)}</ul>}
  </section>
}
