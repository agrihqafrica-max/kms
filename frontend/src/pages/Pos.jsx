import { useEffect, useState } from 'react'
import { useTenant } from '../tenancy/context.js'
import { useLiveData } from '../lib/useLiveData.js'
import { formatMoney } from '../lib/format.js'
import { Loading, ErrorState } from '../components/States.jsx'
import { t } from '../i18n/index.js'

export default function Pos() {
  const { data: { context } } = useTenant()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 250); return () => clearTimeout(timer) }, [search])
  const result = useLiveData(context.branch_id ? `/inventory/branches/${context.branch_id}?search=${encodeURIComponent(query)}` : null)
  return <section className="card pos-products"><h2>{t('spareParts')}</h2><p>{t('readOnly')}</p>
    <label className="search-field">{t('searchParts')}<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
    {!context.branch_id ? <div className="state-panel"><h2>{t('branchRequired')}</h2><p>{t('branchUnavailable')}</p></div> : result.loading ? <Loading /> : result.error ? <ErrorState error={result.error} retry={result.retry} /> : !result.data?.length ? <p className="state-panel">{t(query ? 'searchEmpty' : 'inventoryEmpty')}</p> : <div className="product-grid">{result.data.map(item => <article className="product" key={item.id}><span>{item.part_number}</span><h3>{item.part_name}</h3><strong>{formatMoney(item.retail_price)}</strong><p>{t('stock', { count: item.stock_quantity })}</p></article>)}</div>}
    <button className="checkout" disabled>{t('checkoutLater')}</button>
  </section>
}
