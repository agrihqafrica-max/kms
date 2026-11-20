import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTenant } from '../tenancy/context.js'
import { useWorkspace } from '../lib/workspaceContext.js'
import { formatMoney } from '../lib/format.js'
import { addCartItem, setCartQuantity, removeCartItem } from './PosCart.js'
import { computePosSaleTotals, validateSplitPayments } from '../lib/kmsDomain.js'
import {
  computeShiftReconciliation,
  evaluateDiscountApproval,
  generateEscPosReceipt,
  parseCustomerCsvImport,
} from '../lib/platformGovernance.js'
import { t } from '../i18n/index.js'

const VALID_POS_TABS = ['register', 'returns', 'shifts', 'customers']

export default function Pos() {
  const { data: { context } } = useTenant()
  const {
    activeBranchId,
    complianceMode,
    tenantSettings,
    inventory,
    sales = [],
    expenses = [],
    customers = [],
    salesReturns = [],
    drawerShifts = [],
    approvalRequests = [],
    offlineMode,
    setOfflineMode,
    outbox,
    outboxConflicts = [],
    syncOutbox,
    resolveOutboxConflict,
    completePosCheckout,
    submitSalesReturn,
    resolveSalesReturn,
    openDrawerShift,
    closeDrawerShift,
    createCustomerProfile,
    importCustomerRows,
    updateCustomerConsent,
    sendWorkspaceNotification,
    requestApproval,
    resolveApprovalRequest,
  } = useWorkspace()

  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const tab = VALID_POS_TABS.includes(rawTab) ? rawTab : 'register'
  const setTab = nextTab => {
    setSearchParams(nextTab === 'register' ? {} : { tab: nextTab }, { replace: true })
  }
  const [customerCsvText, setCustomerCsvText] = useState(
    'fullName,phone,bikeModel,consentWhatsApp,consentSms,consentMarketing\nPeter Mwangi,+254712345678,Bajaj Boxer BM150,true,true,false',
  )
  const [customerCsvReport, setCustomerCsvReport] = useState(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [cart, setCart] = useState([])
  const [splitMode, setSplitMode] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [splitPayments, setSplitPayments] = useState([
    { method: 'cash', amount: '', reference: '' },
    { method: 'mobile_money_reference', amount: '', reference: '' },
  ])
  const [customerName, setCustomerName] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [discountAmount, setDiscountAmount] = useState('0')
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const [receiptEmail, setReceiptEmail] = useState('')
  const [receiptEmailStatus, setReceiptEmailStatus] = useState('')
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
  const discountApprovals = approvalRequests.filter(a => a.requestType === 'discount_override')

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
      (item.barcode || '').toLowerCase().includes(query) ||
      (item.category || '').toLowerCase().includes(query) ||
      (item.compatibleModels || '').toLowerCase().includes(query)
    )
  })

  const totals = computePosSaleTotals(cart, Number(discountAmount || 0), complianceMode)
  const discountCheck = evaluateDiscountApproval(context.role, totals.subtotal, Number(discountAmount || 0))
  const approvedDiscountOverride = discountApprovals.find(a => {
    if (a.status !== 'Approved') return false
    try {
      const payload = JSON.parse(a.payloadJson || '{}')
      return Number(payload.discountAmount || 0) >= Number(discountAmount || 0)
    } catch {
      return false
    }
  })
  const canCheckoutDiscount = discountCheck.allowed || Boolean(approvedDiscountOverride)
  const splitPreview = splitMode && cart.length ? validateSplitPayments(splitPayments, totals.totalAmount) : null
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) || null

  function handleBarcodeScanKey(event) {
    if (event.key !== 'Enter') return
    const token = search.trim().toLowerCase()
    if (!token) return
    const exactMatch = branchItems.find(
      item =>
        (item.barcode && item.barcode.toLowerCase() === token) ||
        item.partNumber.toLowerCase() === token,
    )
    if (exactMatch && exactMatch.stockQuantity > 0) {
      event.preventDefault()
      setCart(current =>
        addCartItem(current, {
          id: exactMatch.id,
          part_name: exactMatch.partName,
          part_number: exactMatch.partNumber,
          retail_price: exactMatch.retailPrice,
          stock_quantity: exactMatch.stockQuantity,
          unitCost: exactMatch.unitCost,
        }),
      )
      setSearch('')
      setNotice(`Barcode / SKU matched: added 1x ${exactMatch.partNumber} (${exactMatch.partName}).`)
    }
  }

  function updateSplitLine(idx, patch) {
    setSplitPayments(prev => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }

  async function handleRequestDiscountApproval() {
    setBusy(true)
    setError('')
    try {
      await requestApproval({
        requestType: 'discount_override',
        summary: `POS Discount ${discountCheck.discountPct}% (KES ${discountAmount}) on subtotal KES ${totals.subtotal}`,
        requestedRole: context.role,
        payload: {
          subtotal: totals.subtotal,
          discountAmount: Number(discountAmount || 0),
          discountPct: discountCheck.discountPct,
        },
      })
      setNotice('Discount override approval request submitted to manager queue.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function checkout(event) {
    event.preventDefault()
    if (!cart.length || busy) return
    if (!canCheckoutDiscount) {
      setError(`Discount ${discountCheck.discountPct}% exceeds ${context.role} limit (${discountCheck.maxAllowedPct}%). Owner/manager approval required.`)
      return
    }
    if (splitMode && splitPreview && !splitPreview.valid) {
      setError(splitPreview.error)
      return
    }
    setBusy(true)
    setError('')
    setReceipt(null)
    setReceiptEmailStatus('')
    try {
      const buyerLabel = selectedCustomer?.fullName || customerName
      const cartSnapshot = cart.map(row => ({
        partNumber: row.part_number,
        partName: row.part_name,
        quantity: Number(row.quantity || 1),
        unitPrice: Number(row.retail_price || 0),
      }))
      const result = await completePosCheckout({
        cart,
        discountAmount: Number(discountAmount || 0),
        paymentMethod: splitMode ? splitPreview?.primaryMethod || 'split' : paymentMethod,
        paymentReference: splitMode
          ? splitPayments.map(p => p.reference).filter(Boolean).join(', ')
          : reference,
        payments: splitMode ? splitPayments : null,
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
        items: cartSnapshot,
        paymentMethod: splitMode ? splitPreview?.primaryMethod || 'split' : paymentMethod,
        payments: splitMode ? splitPreview?.normalizedPayments || [] : [{ method: paymentMethod, amount: result.totals.totalAmount }],
        changeDue: splitMode ? splitPreview?.changeDue || 0 : 0,
        customerName: buyerLabel.trim() || 'Walk-in Customer',
        complianceMode,
        prefix: tenantSettings?.receiptPrefix || 'KMSP',
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

  async function handleEmailReceipt() {
    if (!receipt || !receiptEmail.trim()) return
    setReceiptEmailStatus('Sending receipt…')
    try {
      const lineText = (receipt.items || [])
        .map(l => `- ${l.partNumber} ${l.partName} x${l.quantity} = KES ${(l.quantity * l.unitPrice).toLocaleString()}`)
        .join('\n')
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: receiptEmail.trim(),
          subject: `${receipt.prefix}-${receipt.id} · Official Spare Parts Receipt`,
          text: `Receipt: ${receipt.id}\nCustomer: ${receipt.customerName}\nMethod: ${receipt.paymentMethod}\n\nItems:\n${lineText}\n\nTotal: KES ${receipt.totals.totalAmount.toLocaleString()}\nVAT: KES ${receipt.totals.vatAmount.toLocaleString()}`,
          companyName: context.organization_name || 'Kenya Motorcycle Spare Parts General',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.detail || 'Could not send email receipt.')
      setReceiptEmailStatus(`Receipt emailed to ${data.to} via ${data.provider}.`)
    } catch (err) {
      setReceiptEmailStatus(err.message || 'Email delivery unavailable (configure SMTP or RESEND_API_KEY).')
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
      <section className="card no-print">
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
        {notice && <p className="notice mt-md" role="status">{notice}</p>}
        {error && <p className="form-error mt-md" role="alert">{error}</p>}
      </section>

      {tab === 'register' && (
        <section className="pos-layout">
          <div className="card pos-products no-print">
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
              Search or Scan Barcode / SKU (Press Enter to Quick-Add)
              <input
                type="search"
                placeholder="Scan barcode or search Boxer, HLX, NGK, PZ26…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onKeyDown={handleBarcodeScanKey}
              />
            </label>

            {outboxConflicts.length > 0 && (
              <div className="sub-card mt-md">
                <strong>Offline Outbox Conflict Queue ({outboxConflicts.length})</strong>
                <p className="muted">Resolve price drift, stock shortage, or revoked-device conflicts before posting to ledger.</p>
                <div className="po-list mt-sm">
                  {outboxConflicts.map(conflict => (
                    <div className="sub-card" key={conflict.idempotencyKey}>
                      <div className="card-head wrap-head">
                        <div>
                          <span className="mono">{conflict.idempotencyKey}</span>
                          <p className="form-error mt-xs">{(conflict.conflictReasons || []).join(' ')}</p>
                        </div>
                        <div className="inline-controls">
                          <button
                            type="button"
                            className="primary btn-sm"
                            onClick={() => void resolveOutboxConflict(conflict.idempotencyKey, 'accept_current')}
                          >
                            Re-price &amp; Sync
                          </button>
                          <button
                            type="button"
                            className="btn-sm"
                            onClick={() => void resolveOutboxConflict(conflict.idempotencyKey, 'discard')}
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
            <div className="card-head wrap-head no-print">
              <h2>Current Sale</h2>
              <button
                type="button"
                className={splitMode ? 'primary btn-sm' : 'btn-sm'}
                onClick={() => setSplitMode(v => !v)}
              >
                {splitMode ? 'Split Tender On' : 'Split Payment'}
              </button>
            </div>
            {outbox.length > 0 && (
              <p className="notice no-print" role="status">
                {outbox.length} offline sale(s) saved locally awaiting sync.
              </p>
            )}
            {!cart.length ? (
              <div className="cart-empty no-print">Tap spare parts or scan barcode to build a fast counter receipt.</div>
            ) : (
              <div className="cart-lines no-print">
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

            <div className="cart-inputs no-print">
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
              {discountCheck.requiresManagerApproval && !approvedDiscountOverride && (
                <div className="sub-card">
                  <p className="form-error">
                    {discountCheck.discountPct}% discount exceeds {context.role} approval limit ({discountCheck.maxAllowedPct}%).
                  </p>
                  <button
                    type="button"
                    className="btn-sm mt-xs"
                    disabled={busy || !cart.length}
                    onClick={() => void handleRequestDiscountApproval()}
                  >
                    Request Manager Approval
                  </button>
                </div>
              )}
              {approvedDiscountOverride && (
                <p className="notice">Manager discount override approved ({approvedDiscountOverride.resolvedBy}).</p>
              )}

              {!splitMode ? (
                <>
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
                </>
              ) : (
                <div className="split-tender-box">
                  <div className="card-head wrap-head">
                    <strong>Split-Tender Payments (POS-006)</strong>
                    <button
                      type="button"
                      className="btn-sm"
                      onClick={() => setSplitPayments(prev => [...prev, { method: 'card_reference', amount: '', reference: '' }])}
                    >
                      + Tender
                    </button>
                  </div>
                  {splitPayments.map((line, idx) => (
                    <div className="split-tender-row" key={`split-${idx}`}>
                      <select
                        aria-label={`Tender method ${idx + 1}`}
                        value={line.method}
                        onChange={e => updateSplitLine(idx, { method: e.target.value })}
                      >
                        <option value="cash">Cash</option>
                        <option value="mobile_money_reference">M-Pesa Ref</option>
                        <option value="bank_reference">Bank Ref</option>
                        <option value="card_reference">Card Ref</option>
                        <option value="credit">Credit</option>
                      </select>
                      <input
                        aria-label={`Tender amount ${idx + 1}`}
                        type="number"
                        min="0"
                        step="1"
                        placeholder="KES"
                        value={line.amount}
                        onChange={e => updateSplitLine(idx, { amount: e.target.value })}
                      />
                      {splitPayments.length > 1 && (
                        <button
                          type="button"
                          className="btn-sm"
                          onClick={() => setSplitPayments(prev => prev.filter((_, i) => i !== idx))}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                  {splitPreview && (
                    <small className={splitPreview.valid ? 'muted' : 'form-error'}>
                      {splitPreview.valid
                        ? `Tendered ${formatMoney(splitPreview.totalTendered)}${splitPreview.changeDue > 0 ? ` · Cash Change ${formatMoney(splitPreview.changeDue)}` : ''}`
                        : splitPreview.error}
                    </small>
                  )}
                </div>
              )}
            </div>

            <div className="totals no-print">
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

            <button
              className="primary checkout-btn no-print"
              type="submit"
              disabled={!cart.length || busy || !canCheckoutDiscount || (splitMode && splitPreview && !splitPreview.valid)}
            >
              {busy ? 'Recording…' : offlineMode ? 'Save Sale to Offline Outbox' : 'Complete Sale & Post Ledger'}
            </button>

            {discountApprovals.filter(a => a.status === 'PendingApproval').length > 0 && (
              <div className="sub-card mt-md no-print">
                <strong>Pending Discount Override Queue</strong>
                {discountApprovals
                  .filter(a => a.status === 'PendingApproval')
                  .map(req => (
                    <div className="mt-xs" key={req.id}>
                      <small>{req.summary} · by {req.requestedBy}</small>
                      <div className="inline-controls mt-xs">
                        <button
                          type="button"
                          className="primary btn-sm"
                          onClick={() => void resolveApprovalRequest(req.id, true, { approverRole: context.role })}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="btn-sm"
                          onClick={() => void resolveApprovalRequest(req.id, false, { approverRole: context.role })}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {receipt && (
              <div className="thermal-receipt mt-md" role="status">
                <strong>{context.organization_name || 'Kenya Motorcycle Spare Parts General'}</strong>
                <small>
                  {receipt.offlineQueued ? 'Saved Offline (Queued)' : `Official Thermal Receipt · ${receipt.prefix}-${receipt.id}`}
                </small>
                <small>Buyer: {receipt.customerName} · {receipt.timestamp}</small>
                <div className="thermal-receipt-lines">
                  {(receipt.items || []).map((line, i) => (
                    <div className="thermal-receipt-line" key={`${line.partNumber}-${i}`}>
                      <span>{line.partNumber} × {line.quantity}</span>
                      <span>{formatMoney(line.quantity * line.unitPrice)}</span>
                    </div>
                  ))}
                </div>
                <div className="thermal-receipt-line">
                  <span>VAT ({receipt.complianceMode === 'etims_vat' ? '16%' : '0%'})</span>
                  <span>{formatMoney(receipt.totals.vatAmount)}</span>
                </div>
                <div className="thermal-receipt-line">
                  <strong>Total ({receipt.paymentMethod})</strong>
                  <strong>{formatMoney(receipt.totals.totalAmount)}</strong>
                </div>
                {receipt.changeDue > 0 && (
                  <div className="thermal-receipt-line">
                    <span>Cash Change</span>
                    <span>{formatMoney(receipt.changeDue)}</span>
                  </div>
                )}
                <div className="inline-controls mt-sm no-print">
                  <button type="button" className="btn-sm" onClick={() => window.print()}>
                    Print 80mm Receipt
                  </button>
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => {
                      const raw = generateEscPosReceipt(receipt, context.organization_name || 'Kenya Motorcycle Spare Parts General')
                      const blob = new Blob([raw], { type: 'text/plain;charset=utf-8' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${receipt.prefix}-${receipt.id}-escpos.txt`
                      a.click()
                      URL.revokeObjectURL(url)
                    }}
                  >
                    Download ESC/POS
                  </button>
                </div>
                <div className="inline-controls mt-xs no-print">
                  <input
                    type="email"
                    aria-label="Customer email for receipt"
                    placeholder="Email receipt to rider…"
                    value={receiptEmail}
                    onChange={e => setReceiptEmail(e.target.value)}
                  />
                  <button type="button" className="btn-sm" onClick={() => void handleEmailReceipt()}>
                    Email
                  </button>
                </div>
                {receiptEmailStatus && <small className="muted no-print">{receiptEmailStatus}</small>}
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
              <p className="muted">Approving a return atomically restores inventory (+return movement) and posts a balanced return reversal journal entry with separation of duties (BR-002).</p>
            </div>
            <span className="status-tag warn">{branchReturns.filter(r => r.status === 'PendingApproval').length} Pending Approval</span>
          </div>

          <div className="saas-table-wrap">
            <table className="saas-table">
              <thead>
                <tr>
                  <th>SKU &amp; Reason</th>
                  <th>Method &amp; Actors</th>
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
                    <td>
                      <span>{ret.refundMethod}</span>
                      <span className="cell-sub">
                        Req: {ret.requestedBy || 'Counter'} {ret.resolvedBy ? `· Auth: ${ret.resolvedBy}` : ''}
                      </span>
                    </td>
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

          <div className="inventory-form">
            <h3>Bulk Customer CSV Import (PLT-010)</h3>
            <p className="muted">Columns: fullName,phone,bikeModel,consentWhatsApp,consentSms,consentMarketing</p>
            <textarea rows={3} value={customerCsvText} onChange={e => setCustomerCsvText(e.target.value)} />
            <div className="inline-controls">
              <button
                type="button"
                onClick={() => setCustomerCsvReport(parseCustomerCsvImport(customerCsvText, customers))}
              >
                Validate Customer CSV
              </button>
              {customerCsvReport?.validRows?.length > 0 && (
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      const res = await importCustomerRows(customerCsvReport.validRows)
                      setCustomerCsvReport(null)
                      setNotice(`Imported ${res.imported} customer profile(s).`)
                    } finally {
                      setBusy(false)
                    }
                  }}
                >
                  Import {customerCsvReport.validRows.length} Customer(s)
                </button>
              )}
            </div>
            {customerCsvReport && (
              <small className="muted">
                Valid: <strong>{customerCsvReport.validRows.length}</strong> · Duplicates skipped:{' '}
                <strong>{customerCsvReport.duplicates.length}</strong> · Errors: <strong>{customerCsvReport.errors.length}</strong>
              </small>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
