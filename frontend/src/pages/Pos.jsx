import { useEffect, useState } from 'react'
import { useTenant } from '../tenancy/context.js'
import { useLiveData } from '../lib/useLiveData.js'
import { api } from '../lib/supabase.js'
import { formatMoney } from '../lib/format.js'
import { Loading, ErrorState } from '../components/States.jsx'
import { t } from '../i18n/index.js'
import { addCartItem, setCartQuantity, removeCartItem, cartTotals } from './PosCart.js'

export default function Pos() {
  const { data: { context } } = useTenant()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { const timer = setTimeout(() => setQuery(search.trim()), 250); return () => clearTimeout(timer) }, [search])
  const result = useLiveData(context.branch_id ? `/inventory/branches/${context.branch_id}?search=${encodeURIComponent(query)}` : null)
  const totals = cartTotals(cart)

  async function checkout(event) {
    event.preventDefault()
    if (!cart.length || busy) return
    setBusy(true); setError(''); setMessage('')
    try {
      const sale = await api.request('/pos/checkout', { method: 'POST', body: {
        payment_method: paymentMethod,
        mpesa_receipt_number: reference.trim() || null,
        cart: cart.map(row => ({ item_id: row.id, quantity: row.quantity })),
      } })
      setCart([]); setReference(''); setMessage(`Sale completed: ${sale.id ?? sale.order_id ?? 'confirmed'}`); result.retry()
    } catch (failure) { setError(failure.detail || failure.message || t('requestError')) }
    finally { setBusy(false) }
  }

  return <section className="pos-layout"><div className="card pos-products"><h2>{t('spareParts')}</h2>
    <label className="search-field">{t('searchParts')}<input type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
    {!context.branch_id ? <div className="state-panel"><h2>{t('branchRequired')}</h2><p>{t('branchUnavailable')}</p></div> : result.loading ? <Loading /> : result.error ? <ErrorState error={result.error} retry={result.retry} /> : !result.data?.length ? <p className="state-panel">{t(query ? 'searchEmpty' : 'inventoryEmpty')}</p> : <div className="product-grid">{result.data.map(item => <button className="product" key={item.id} onClick={() => setCart(current => addCartItem(current, item))} disabled={!item.stock_quantity}><span>{item.part_number}</span><h3>{item.part_name}</h3><strong>{formatMoney(item.retail_price)}</strong><p>{t('stock', { count: item.stock_quantity })}</p></button>)}</div>}
  </div><form className="card cart" onSubmit={checkout}><h2>Current sale</h2>
    {!cart.length ? <div className="cart-empty">Add parts to start a sale.</div> : <div className="cart-lines">{cart.map(row => <div className="cart-line" key={row.id}><div><strong>{row.part_name}</strong><small>{formatMoney(row.retail_price)}</small></div><input aria-label={`Quantity for ${row.part_name}`} type="number" min="1" max={row.stock_quantity} value={row.quantity} onChange={e => setCart(current => setCartQuantity(current, row.id, Number(e.target.value) || 1))} /><button type="button" onClick={() => setCart(current => removeCartItem(current, row.id))}>Remove</button></div>)}</div>}
    <label>Payment method<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="mobile_money_reference">Mobile-money reference</option><option value="bank_reference">Bank reference</option><option value="card_reference">Card reference</option></select></label>
    {paymentMethod !== 'cash' && <label>Payment reference<input value={reference} onChange={e => setReference(e.target.value)} required /></label>}
    <div className="totals"><p><span>Subtotal</span><strong>{formatMoney(String(totals.subtotal))}</strong></p><p className="total"><span>Total</span><strong>{formatMoney(String(totals.total))}</strong></p></div>
    {message && <p role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}
    <button className="checkout" type="submit" disabled={!cart.length || busy || !context.branch_id}>{busy ? 'Completing…' : 'Complete sale'}</button>
  </form></section>
}
