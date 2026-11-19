import { useState } from 'react'
import { useTenant } from '../tenancy/context.js'
import { useLiveData } from '../lib/useLiveData.js'
import { api } from '../lib/supabase.js'
import { formatMoney } from '../lib/format.js'
import { Loading, ErrorState } from '../components/States.jsx'

export default function Inventory() {
  const { data: { context }, reload } = useTenant()
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const path = context.branch_id ? `/inventory/branches/${context.branch_id}?search=${encodeURIComponent(search)}` : null
  const result = useLiveData(path)

  async function createItem(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = {
      part_name: form.get('part_name'), part_number: form.get('part_number'), category: form.get('category') || null,
      compatible_models: String(form.get('compatible_models') || '').split(',').map(v => v.trim()).filter(Boolean),
      unit_cost: form.get('unit_cost'), retail_price: form.get('retail_price'),
      stock_quantity: Number(form.get('stock_quantity') || 0), reorder_level: Number(form.get('reorder_level') || 0),
    }
    setBusy(true); setError('')
    try {
      await api.request('/inventory/items', { method: 'POST', body: payload })
      event.currentTarget.reset(); result.retry(); reload()
    } catch (failure) { setError(failure.detail || failure.message) }
    finally { setBusy(false) }
  }

  return <section className="card inventory-page">
    <h2>Inventory</h2>
    {!context.branch_id ? <div className="state-panel"><h2>Branch required</h2><p>Select a branch before viewing inventory.</p></div> : <>
      <label>Search<input type="search" value={search} onChange={event => setSearch(event.target.value)} /></label>
      {result.loading ? <Loading /> : result.error ? <ErrorState error={result.error} retry={result.retry} /> : <div className="inventory-table"><div className="inventory-head"><b>Part</b><b>Stock</b><b>Price</b></div>
        {!result.data?.length ? <p>No inventory items found.</p> : result.data.map(row => <div className="inventory-row" key={row.id}><span><strong>{row.part_name}</strong><small>{row.part_number}</small></span><span>{row.stock_quantity}</span><strong>{formatMoney(row.retail_price)}</strong></div>)}</div>}
      {['owner','manager','storekeeper'].includes(context.role) && <form className="inventory-form" onSubmit={createItem}>
        <h3>Add inventory item</h3><div className="form-grid">
          <label>Part name<input name="part_name" required /></label><label>Part number<input name="part_number" required /></label>
          <label>Category<input name="category" /></label><label>Bike models (comma-separated)<input name="compatible_models" /></label>
          <label>Buying cost<input name="unit_cost" type="number" min="0.01" step="0.01" required /></label><label>Retail price<input name="retail_price" type="number" min="0.01" step="0.01" required /></label>
          <label>Stock quantity<input name="stock_quantity" type="number" min="0" defaultValue="0" /></label><label>Reorder level<input name="reorder_level" type="number" min="0" defaultValue="0" /></label>
        </div>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Add item'}</button>
      </form>}
    </>}
  </section>
}
