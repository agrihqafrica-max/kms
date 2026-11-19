import { useTenant } from '../tenancy/context.js'
import { useLiveData } from '../lib/useLiveData.js'
import { formatMoney, nairobiDay } from '../lib/format.js'
import { Loading, ErrorState } from '../components/States.jsx'
import Radar from './Radar.jsx'
import { t } from '../i18n/index.js'

export default function Overview() {
  const { data: { context } } = useTenant()
  const date = nairobiDay()
  const result = useLiveData(context.branch_id ? `/finance/dashboard?start_date=${date}&end_date=${date}` : null)
  const measures = [['net_sales', 'netSales', true], ['sales_count', 'salesCount'], ['expense_total', 'expenseTotal', true], ['low_stock_count', 'lowStock'], ['inventory_items_count', 'inventoryCount']]
  return <>
    <section className="card"><h2>{t('dashboardTitle')}</h2><p className="muted period-note">{t('dashboardPeriod', { date })}</p>
      {!context.branch_id ? <div className="state-panel"><h2>{t('branchRequired')}</h2><p>{t('branchUnavailable')}</p></div> : result.loading ? <Loading /> : result.error ? <ErrorState error={result.error} retry={result.retry} /> : <div className="stats-grid">
        {measures.map(([key, label, money]) => <div className="stat-card" key={key}><div><p>{t(label)}</p><h3>{result.data?.[key] == null ? t('unavailable') : money ? formatMoney(result.data[key]) : result.data[key]}</h3></div></div>)}
      </div>}
    </section>
    <div className="dashboard-grid"><Radar /><section className="card"><h2>{t('trendTitle')}</h2><p>{t('trendUnavailable')}</p><h2 className="section-heading">{t('profit')}</h2><p>{t('unavailable')}</p></section></div>
    <section className="card"><h2>{t('recentTitle')}</h2><p>{t('recentUnavailable')}</p></section>
  </>
}
