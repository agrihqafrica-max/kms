import { useEffect, useState } from 'react'
import { useTenant } from '../tenancy/context.js'
import { useWorkspace } from '../lib/workspaceContext.js'
import { formatMoney } from '../lib/format.js'
import { addCartItem, setCartQuantity, removeCartItem } from './PosCart.js'
import { computePosSaleTotals } from '../lib/kmsDomain.js'
import { computeShiftReconciliation, evaluateDiscountApproval } from '../lib/platformGovernance.js'
import { t } from '../i18n/index.js'

export default function Pos() {
  const { data: { context } } = useTenant()
  const {
    activeBranchId,
    complianceMode,
    inventory,
    sales = [],
    expenses = [],
    customers = [],
    salesReturns = [],
    drawerShifts = [],
    offlineMode,
    setOfflineMode,
    outbox,
    syncOutbox,
    completePosCheckout,
    submitSalesReturn,
    resolveSalesReturn,
    openDrawerShift,
    closeDrawerShift,
    createCustomerProfile,
    updateCustomerConsent,
    sendWorkspaceNotification,
  } = useWorkspace()

  const [tab, setTab] = useState('register')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState([])
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [discountAmount, setDiscountAmount] = useState('0')
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [countedCash, setCountedCash] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim().toLowerCase()), 150)
    return () => clearTimeout(timer)
  }, [search])

  const branchItems = inventory.filter(i => i.branchId === activeBranchId)
  const branchReturns = salesReturns.filter(r => r.branchId === activeBranchId)
  const branchShifts = drawerShifts.filter(s => s.branchId === activeBranchId)
  const openShift = branchShifts.find(s => s.status === 'Open')

  const cashSales = sales
    .filter(s => s.branchId === activeBranchId && s.paymentMethod === 'cash')
    .reduce((sum, s) => sum + Number(s.totalAmount || 0), 0)
  const cashRefunds = branchReturns
    .filter(r => r.status === 'Approved' && r.refundMethod === 'cash')
    .reduce((sum, r) => sum + Number(r.refundAmount || 0), 0)
  const cashExpenses = expenses
    .filter(e => e.branchId === activeBranchId)
    .reduce((sum, e) => sum + Number(e.amount || 0), 0)
  const liveShiftPreview = openShift
    ? computeShiftReconciliation({
        openingFloat: openShift.openingFloat,
        cashSales,
        cashRefunds,
        cashExpenses,
        countedCash: Number(countedCash || 0),
      })
    : null

  const visibleItems = branchItems.filter(item => {
    if (!query) return true
    return (
      item.partName.toLowerCase().includes(query) ||
      item.partNumber.toLowerCase().includes(query) ||
      (item.category || '').toLowerCase().includes(query) ||
      (item.compatibleModels || '').toLowerCase().includes(query)
    )
  })

  const totals = computePosSaleTotals(cart, Number(discountAmount || 0), complianceMode)
  const discountCheck = evaluateDiscountApproval(context.role, totals.subtotal, Number(discountAmount || 0))
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || null

  async function checkout(event) {
    event.preventDefault()
    if (!cart.length || busy) return
    if (!discountCheck.allowed) {
      setError(`Discount ${discountCheck.discountPct}% exceeds ${context.role} limit (${discountCheck.maxAllowedPct}%). Owner/manager approval required.`)
      return
    }
    setBusy(true)
    setError('')
    setReceipt(null)
    try {
      const buyerLabel = selectedCustomer?.fullName || customerName
      const result = await completePosCheckout({
        cart,
        discountAmount: Number(discountAmount || 0),
        paymentMethod,
        paymentReference: reference,
        customerName: buyerLabel,
      })
      if (selectedCustomer) {
        await sendWorkspaceNotification({
          templateKey: 'SALE_RECEIPT',
          vars: { saleId: result.id, totalAmount: result.totals.totalAmount, customerName: selectedCustomer.fullName },
          channel: selectedCustomer.consentWhatsApp ? 'whatsapp' : 'in_app',
          category: 'transactional',
          customer: selectedCustomer,
        })
      }
      setReceipt({
        id: result.id,
        offlineQueued: result.offlineQueued,
        totals: result.totals,
        paymentMethod,
        customerName: buyerLabel.trim() || 'Walk-in Customer',
        complianceMode,
        timestamp: new Date().toLocaleTimeString(),
      })
      setCart([])
      setReference('')
      setCustomerName('')
      setSelectedCustomerId('')
      setDiscountAmount('0')
    } catch (failure) {
      setError(failure.message || t('requestError'))
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmitReturn(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await submitSalesReturn({
        saleId: form.get('saleId'),
        itemId: form.get('itemId'),
        quantity: form.get('quantity'),
        refundAmount: form.get('refundAmount'),
        refundMethod: form.get('refundMethod'),
        reason: form.get('reason'),
      })
      event.currentTarget.reset()
      setNotice('Return staged in PendingApproval awaiting manager authorization.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleOpenShift(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await openDrawerShift(form.get('openingFloat'), form.get('notes'))
      event.currentTarget.reset()
      setNotice('Cash drawer shift opened.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleCloseShift(event) {
    event.preventDefault()
    if (!openShift) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const recon = await closeDrawerShift(openShift.id, countedCash, 'End-of-shift physical drawer count')
      setCountedCash('')
      setNotice(`Shift closed. Expected ${formatMoney(recon.expectedCash)}, Counted ${formatMoney(recon.countedCash)}, Variance ${formatMoney(recon.variance)}.`)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateCustomer(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await createCustomerProfile({
        fullName: form.get('fullName'),
        phone: form.get('phone'),
        bikeModel: form.get('bikeModel'),
        consentWhatsApp: form.get('consentWhatsApp') === 'on',
        consentSms: form.get('consentSms') === 'on',
        consentMarketing: form.get('consentMarketing') === 'on',
      })
      event.currentTarget.reset()
      setNotice('Customer profile & communication consent saved.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stacked-pages">
      <section className="card">
        <div className="card-head wrap-head">
          <div>
            <p className="eyebrow">Counter Operations, Returns, Drawer &amp; Customer Consent</p>
            <h2>{t('spareParts')} Point of Sale</h2>
          </div>
          <div className="tab-strip" role="tablist" aria-label="POS modules">
            {[
              ['register', 'Counter Register'],
              ['returns', `Returns & Refunds (${branchReturns.filter(r => r.status === 'PendingApproval').length})`],
              ['shifts', `Cash Drawer (${openShift ? 'Open' : 'Closed'})`],
              ['customers', `Customers & Consent (${customers.length})`],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? 'active' : ''}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      {tab === 'register' && (
        <section className="pos-layout">
          <div className="card pos-products">
            <div className="card-head wrap-head">
              <div>
                <h2>Spare Parts Quick Pick</h2>
                <p className="muted">
                  {complianceMode === 'etims_vat'
                    ? 'eTIMS VAT (16%) active — invoices queue automatically & post to double-entry ledger.'
                    : 'Simplified Cash Mode active — VAT not charged.'}
                </p>
              </div>
              <div className="inline-controls">
                <button
                  type="button"
                  className={offlineMode ? 'status-tag warn' : 'status-tag ok'}
                  onClick={() => setOfflineMode(v => !v)}
                >
                  {offlineMode ? 'Offline Outbox Mode' : 'Online Sync Active'}
                </button>
                {outbox.length > 0 && !offlineMode && (
                  <button type="button" className="primary" onClick={() => void syncOutbox()}>
                    Sync {outbox.length} Queued
                  </button>
                )}
              </div>
            </div>

            <label className="search-field">
              Search by part name, SKU, or bike model
              <input
                type="search"
                placeholder="e.g. Boxer, HLX, NGK, PZ26…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </label>

            {!visibleItems.length ? (
              <p className="state-panel">{query ? t('searchEmpty') : t('inventoryEmpty')}</p>
            ) : (
              <div className="product-grid">
                {visibleItems.map(item => (
                  <button
                    type="button"
                    className="product"
                    key={item.id}
                    onClick={() =>
                      setCart(current =>
                        addCartItem(current, {
                          id: item.id,
                          part_name: item.partName,
                          part_number: item.partNumber,
                          retail_price: item.retailPrice,
                          stock_quantity: item.stockQuantity,
                          unitCost: item.unitCost,
                        }),
                      )
                    }
                    disabled={!item.stockQuantity}
                  >
                    <span>{item.partNumber}</span>
                    <h3>{item.partName}</h3>
                    <small>{item.compatibleModels || item.category}</small>
                    <strong>{formatMoney(item.retailPrice)}</strong>
                    <p>{t('stock', { count: item.stockQuantity })}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <form className="card cart" onSubmit={checkout}>
            <h2>Current Sale</h2>
            {outbox.length > 0 && (
              <p className="notice" role="status">
                {outbox.length} offline sale(s) saved locally awaiting sync.
              </p>
            )}
            {!cart.length ? (
              <div className="cart-empty">Tap spare parts to build a fast counter receipt.</div>
            ) : (
              <div className="cart-lines">
                {cart.map(row => (
                  <div className="cart-line" key={row.id}>
                    <div>
                      <strong>{row.part_name}</strong>
                      <small>{formatMoney(row.retail_price)} each</small>
                    </div>
                    <input
                      aria-label={`Quantity for ${row.part_name}`}
                      type="number"
                      min="1"
                      max={row.stock_quantity}
                      value={row.quantity}
                      onChange={e => setCart(current => setCartQuantity(current, row.id, Number(e.target.value) || 1))}
                    />
                    <button type="button" onClick={() => setCart(current => removeCartItem(current, row.id))}>
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="cart-inputs">
              <label>
                Registered Customer (Consent-Aware)
                <select value={selectedCustomerId} onChange={e => setSelectedCustomerId(e.target.value)}>
                  <option value="">Walk-in Customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} ({c.bikeModel || 'Rider'})
                    </option>
                  ))}
                </select>
              </label>
              {!selectedCustomerId && (
                <label>
                  Customer / Rider Name (optional)
                  <input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Walk-in Rider" />
                </label>
              )}
              <label>
                Discount (KES) — Max {discountCheck.maxAllowedPct}% ({context.role})
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={discountAmount}
                  onChange={e => setDiscountAmount(e.target.value)}
                />
              </label>
              {discountCheck.requiresManagerApproval && (
                <p className="form-error">
                  {discountCheck.discountPct}% discount exceeds {context.role} approval limit ({discountCheck.maxAllowedPct}%).
                </p>
              )}
              <label>
                Payment Method
                <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                  <option value="cash">Cash</option>
                  <option value="mobile_money_reference">M-Pesa / Mobile Money Ref</option>
                  <option value="bank_reference">Bank Transfer Ref</option>
                  <option value="card_reference">Card Ref</option>
                  <option value="credit">Approved Wholesale Credit</option>
                </select>
              </label>
              {paymentMethod !== 'cash' && paymentMethod !== 'credit' && (
                <label>
                  Payment Reference (M-Pesa Code / Ref)
                  <input value={reference} onChange={e => setReference(e.target.value)} required />
                </label>
              )}
            </div>

            <div className="totals">
              <p>
                <span>Subtotal</span>
                <strong>{formatMoney(totals.subtotal)}</strong>
              </p>
              {totals.discountAmount > 0 && (
                <p>
                  <span>Discount</span>
                  <strong>-{formatMoney(totals.discountAmount)}</strong>
                </p>
              )}
              <p>
                <span>VAT ({complianceMode === 'etims_vat' ? '16% eTIMS' : '0% Simplified'})</span>
                <strong>{formatMoney(totals.vatAmount)}</strong>
              </p>
              <p className="total">
                <span>Total</span>
                <strong>{formatMoney(totals.totalAmount)}</strong>
              </p>
            </div>

            <button className="primary checkout-btn" type="submit" disabled={!cart.length || busy || !discountCheck.allowed}>
              {busy ? 'Recording…' : offlineMode ? 'Save Sale to Offline Outbox' : 'Complete Sale & Post Ledger'}
            </button>

            {receipt && (
              <div className="receipt-box" role="status">
                <strong>{receipt.offlineQueued ? 'Saved Offline (Queued)' : 'Digital Receipt & Balanced JE Issued'}</strong>
                <p>Ref: {receipt.id}</p>
                <p>Buyer: {receipt.customerName} · {receipt.paymentMethod}</p>
                <p>Total: {formatMoney(receipt.totals.totalAmount)} ({receipt.timestamp})</p>
              </div>
            )}
          </form>
        </section>
      )}

      {tab === 'returns' && (
        <section className="card">
          <div className="card-head wrap-head">
            <div>
              <h2>POS Returns &amp; Refund Approval Queue</h2>
              <p className="muted">Approving a return atomically restores inventory (+return movement) and posts a balanced return reversal journal entry.</p>
            </div>
            <span className="status-tag warn">{branchReturns.filter(r => r.status === 'PendingApproval').length} Pending Approval</span>
          </div>

          <div className="saas-table-wrap">
            <table className="saas-table">
              <thead>
                <tr>
                  <th>SKU &amp; Reason</th>
                  <th>Method</th>
                  <th className="num">Qty</th>
                  <th className="num">Refund</th>
                  <th>Status</th>
                  <th className="num">Action</th>
                </tr>
              </thead>
              <tbody>
                {branchReturns.map(ret => (
                  <tr key={ret.id}>
                    <td>
                      <span className="cell-title mono">{ret.partNumber}</span>
                      <span className="cell-sub">{ret.reason}</span>
                    </td>
                    <td>{ret.refundMethod}</td>
                    <td className="num">{ret.quantity}</td>
                    <td className="num">{formatMoney(ret.refundAmount)}</td>
                    <td>
                      <span className={ret.status === 'Approved' ? 'status-tag ok' : ret.status === 'Rejected' ? 'status-tag danger' : 'status-tag warn'}>
                        {ret.status}
                      </span>
                    </td>
                    <td className="num">
                      {ret.status === 'PendingApproval' ? (
                        <div className="row-actions">
                          <button type="button" className="primary btn-sm" onClick={() => void resolveSalesReturn(ret.id, true)}>Approve</button>
                          <button type="button" className="btn-sm" onClick={() => void resolveSalesReturn(ret.id, false)}>Reject</button>
                        </div>
                      ) : (
                        <span className="muted">Locked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form className="inventory-form" onSubmit={handleSubmitReturn}>
            <h3>Stage Customer Return</h3>
            <div className="form-grid">
              <label>
                Returned SKU
                <select name="itemId" required>
                  {branchItems.map(i => (
                    <option key={i.id} value={i.id}>{i.partNumber} — {i.partName}</option>
                  ))}
                </select>
              </label>
              <label>Quantity<input name="quantity" type="number" min="1" defaultValue="1" required /></label>
              <label>Refund Amount (KES)<input name="refundAmount" type="number" min="0" step="0.01" defaultValue="550" required /></label>
              <label>
                Refund Method
                <select name="refundMethod" defaultValue="cash">
                  <option value="cash">Cash Drawer Refund</option>
                  <option value="mobile_money_reference">M-Pesa Reversal Reference</option>
                  <option value="credit_note">Store Credit Note</option>
                </select>
              </label>
              <label>Original Sale Ref (optional)<input name="saleId" placeholder="sale-..." /></label>
              <label>Return Reason<input name="reason" required placeholder="Wrong fitment or sealed exchange" /></label>
            </div>
            <button className="primary" type="submit" disabled={busy || !branchItems.length}>Stage Return Proposal</button>
          </form>
        </section>
      )}

      {tab === 'shifts' && (
        <section className="card">
          <div className="card-head wrap-head">
            <div>
              <h2>Cash Drawer Shift Reconciliation</h2>
              <p className="muted">Track opening float, expected cash (float + cash sales - cash refunds - cash expenses), and counted cash variance.</p>
            </div>
            <span className={openShift ? 'status-tag ok' : 'status-tag muted'}>
              {openShift ? `Open Shift (${openShift.shiftDay})` : 'No Active Open Shift'}
            </span>
          </div>

          {openShift && liveShiftPreview ? (
            <form onSubmit={handleCloseShift} className="sub-card">
              <div className="stats-grid">
                <div className="stat-card"><p>Opening Float</p><h3>{formatMoney(liveShiftPreview.openingFloat)}</h3></div>
                <div className="stat-card"><p>Cash Sales</p><h3>{formatMoney(liveShiftPreview.cashSales)}</h3></div>
                <div className="stat-card"><p>Refunds + Expenses</p><h3>{formatMoney(liveShiftPreview.cashRefunds + liveShiftPreview.cashExpenses)}</h3></div>
                <div className="stat-card"><p>Expected Cash</p><h3>{formatMoney(liveShiftPreview.expectedCash)}</h3></div>
              </div>
              <div className="form-grid">
                <label>
                  Counted Cash in Drawer (KES)
                  <input type="number" min="0" step="0.01" value={countedCash} onChange={e => setCountedCash(e.target.value)} required />
                </label>
              </div>
              <button className="primary" type="submit" disabled={busy}>Close Drawer Shift &amp; Record Variance</button>
            </form>
          ) : (
            <form onSubmit={handleOpenShift} className="inventory-form">
              <h3>Open New Cash Drawer Shift</h3>
              <div className="form-grid">
                <label>Opening Float (KES)<input name="openingFloat" type="number" min="0" defaultValue="5000" required /></label>
                <label>Shift Note<input name="notes" placeholder="Morning shift opening till count" /></label>
              </div>
              <button className="primary" type="submit" disabled={busy}>Open Cash Drawer Shift</button>
            </form>
          )}

          <div className="saas-table-wrap">
            <table className="saas-table">
              <thead>
                <tr>
                  <th>Shift Day</th>
                  <th className="num">Opening Float</th>
                  <th className="num">Expected Cash</th>
                  <th className="num">Counted</th>
                  <th className="num">Variance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {branchShifts.map(sh => (
                  <tr key={sh.id}>
                    <td>{sh.shiftDay}</td>
                    <td className="num">{formatMoney(sh.openingFloat)}</td>
                    <td className="num">{formatMoney(sh.expectedCash ?? sh.openingFloat)}</td>
                    <td className="num">{sh.countedCash != null ? formatMoney(sh.countedCash) : '—'}</td>
                    <td className="num">{sh.variance != null ? formatMoney(sh.variance) : '—'}</td>
                    <td><span className={sh.status === 'Open' ? 'status-tag ok' : 'status-tag muted'}>{sh.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'customers' && (
        <section className="card">
          <div className="card-head wrap-head">
            <div>
              <h2>Customer Profiles &amp; Communication Consent</h2>
              <p className="muted">Opt-out flags automatically suppress WhatsApp, SMS, or marketing campaigns before outbound queuing.</p>
            </div>
          </div>

          <div className="saas-table-wrap">
            <table className="saas-table">
              <thead>
                <tr>
                  <th>Customer / Rider</th>
                  <th>Bike Model &amp; Phone</th>
                  <th>WhatsApp</th>
                  <th>SMS</th>
                  <th>Marketing</th>
                  <th className="num">Consent Test</th>
                </tr>
              </thead>
              <tbody>
                {customers.map(c => (
                  <tr key={c.id}>
                    <td className="cell-title">{c.fullName}</td>
                    <td>{c.bikeModel || 'Standard'} · <span className="mono">{c.phone || '—'}</span></td>
                    <td>
                      <button type="button" className={c.consentWhatsApp ? 'status-tag ok' : 'status-tag danger'} onClick={() => void updateCustomerConsent(c.id, { consentWhatsApp: !c.consentWhatsApp })}>
                        {c.consentWhatsApp ? 'Opt-In' : 'Opt-Out'}
                      </button>
                    </td>
                    <td>
                      <button type="button" className={c.consentSms ? 'status-tag ok' : 'status-tag danger'} onClick={() => void updateCustomerConsent(c.id, { consentSms: !c.consentSms })}>
                        {c.consentSms ? 'Opt-In' : 'Opt-Out'}
                      </button>
                    </td>
                    <td>
                      <button type="button" className={c.consentMarketing ? 'status-tag ok' : 'status-tag danger'} onClick={() => void updateCustomerConsent(c.id, { consentMarketing: !c.consentMarketing })}>
                        {c.consentMarketing ? 'Opt-In' : 'Opt-Out'}
                      </button>
                    </td>
                    <td className="num">
                      <button
                        type="button"
                        className="btn-sm"
                        onClick={async () => {
                          const res = await sendWorkspaceNotification({
                            templateKey: 'MARKETING_PROMO',
                            vars: { partName: 'Bajaj Boxer Service Kit', discountLabel: '15%' },
                            channel: 'sms',
                            category: 'marketing',
                            customer: c,
                          })
                          setNotice(`SMS campaign for ${c.fullName} recorded as ${res?.status || 'Queued'} (check Alerts inbox).`)
                        }}
                      >
                        Test SMS Promo
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form className="inventory-form" onSubmit={handleCreateCustomer}>
            <h3>Add Customer / Boda Rider Profile</h3>
            <div className="form-grid">
              <label>Full Name<input name="fullName" required placeholder="Samuel Ochieng" /></label>
              <label>Phone (+254)<input name="phone" placeholder="+254712000111" /></label>
              <label>Motorcycle Model<input name="bikeModel" placeholder="Bajaj Boxer BM150" /></label>
            </div>
            <div className="inline-controls">
              <label className="checkbox-row"><input type="checkbox" name="consentWhatsApp" defaultChecked /> WhatsApp Consent</label>
              <label className="checkbox-row"><input type="checkbox" name="consentSms" defaultChecked /> SMS Consent</label>
              <label className="checkbox-row"><input type="checkbox" name="consentMarketing" /> Marketing Opt-In</label>
            </div>
            <button className="primary" type="submit" disabled={busy}>Save Customer Profile</button>
          </form>
        </section>
      )}
    </div>
  )
}
