import { useState } from 'react'
import { useWorkspace } from '../lib/workspaceContext.js'
import { formatMoney, nairobiDay } from '../lib/format.js'
import { CHART_OF_ACCOUNTS, parseJournalLines } from '../lib/accountingEngine.js'
import {
  buildCashReconciliationReport,
  buildDailyBusinessSummary,
  buildProfitCogsReport,
  buildPurchaseReport,
  buildSalesReport,
  buildStockReport,
  exportReportToCsv,
} from '../lib/reportingEngine.js'

export default function Finance() {
  const {
    activeBranchId,
    complianceMode,
    setComplianceMode,
    sales = [],
    expenses = [],
    stockMovements = [],
    inventory = [],
    purchaseOrders = [],
    suppliers = [],
    salesReturns = [],
    drawerShifts = [],
    journalEntries = [],
    etimsInvoices = [],
    payoutBatches = [],
    recordDailyExpense,
    retryEtimsInvoice,
    createPayoutBatch,
    resolvePayoutBatch,
    postReversingJournalEntry,
    appendAuditLog,
  } = useWorkspace()

  const [tab, setTab] = useState('eod')
  const [busy, setBusy] = useState(false)
  const [cashCounted, setCashCounted] = useState('')
  const [eodResult, setEodResult] = useState(null)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('all')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const branchSales = sales.filter(s => s.branchId === activeBranchId)
  const branchExpenses = expenses.filter(e => e.branchId === activeBranchId)
  const branchJournals = journalEntries.filter(j => j.branchId === activeBranchId)
  const cashSalesTotal = branchSales.filter(s => s.paymentMethod === 'cash').reduce((sum, s) => sum + Number(s.totalAmount || 0), 0)
  const totalSales = branchSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0)
  const totalExpenses = branchExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
  const totalVat = branchSales.reduce((sum, s) => sum + Number(s.vatAmount || 0), 0)
  const expectedDrawerCash = Math.max(0, cashSalesTotal - totalExpenses)

  const dailySummary = buildDailyBusinessSummary({
    sales,
    expenses,
    salesReturns,
    etimsInvoices,
    journalEntries,
    branchId: activeBranchId,
    startDate,
    endDate,
  })
  const salesRep = buildSalesReport({
    sales,
    salesReturns,
    branchId: activeBranchId,
    startDate,
    endDate,
    paymentMethod: paymentMethodFilter,
  })
  const profitRep = buildProfitCogsReport({
    sales,
    expenses,
    stockMovements,
    inventory,
    branchId: activeBranchId,
    startDate,
    endDate,
  })
  const cashRep = buildCashReconciliationReport({
    drawerShifts,
    branchId: activeBranchId,
    startDate,
    endDate,
  })
  const stockRep = buildStockReport({ inventory, stockMovements, branchId: activeBranchId })
  const purchaseRep = buildPurchaseReport({ purchaseOrders, suppliers, branchId: activeBranchId })

  async function submitExpense(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await recordDailyExpense({
        category: form.get('category'),
        amount: form.get('amount'),
        description: form.get('description') || '',
      })
      event.currentTarget.reset()
      setMessage('Expense saved and balanced double-entry journal posted.')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  async function submitEod(event) {
    event.preventDefault()
    const counted = Number(cashCounted || 0)
    const variance = counted - expectedDrawerCash
    setEodResult({
      date: nairobiDay(),
      totalSales,
      totalExpenses,
      expectedDrawerCash,
      counted,
      variance,
    })
    await appendAuditLog(
      'EOD_RECONCILED',
      'Finance',
      `Closed drawer EOD for ${nairobiDay()}: Expected KES ${expectedDrawerCash}, Counted KES ${counted}, Variance KES ${variance}`,
    )
    setMessage('End-of-Day cash reconciliation logged to Audit Trail.')
  }

  async function handleNewPayout(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await createPayoutBatch({
      title: form.get('title'),
      category: form.get('category'),
      recipientCount: form.get('recipientCount'),
      totalAmount: form.get('totalAmount'),
    })
    event.currentTarget.reset()
    setMessage('Payout batch staged (locked until explicit Owner approval).')
  }

  function downloadCsv(filename, columns, rows) {
    const csv = exportReportToCsv(columns, rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    setMessage(`Exported ${filename}.`)
  }

  return (
    <div className="stacked-pages">
      <section className="card">
        <div className="card-head wrap-head">
          <div>
            <p className="eyebrow">Double-Entry Ledger, Financial Reports, Tax &amp; Payouts</p>
            <h2>Accounting &amp; Financial Control</h2>
          </div>
          <div className="tab-strip" role="tablist" aria-label="Finance modules">
            {[
              ['eod', 'Tax & EOD Close'],
              ['ledger', `Double-Entry Ledger (${branchJournals.length})`],
              ['reports', 'Reports & CSV Exports'],
              ['etims', `eTIMS & Payouts (${etimsInvoices.length})`],
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

        <div className="stats-grid">
          <div className="stat-card"><p>Net Sales (After Returns)</p><h3>{formatMoney(dailySummary.netSales)}</h3></div>
          <div className="stat-card"><p>Output VAT Accrued</p><h3>{formatMoney(totalVat)}</h3></div>
          <div className="stat-card"><p>Gross Profit / Margin</p><h3>{formatMoney(profitRep.grossProfit)}</h3><small>{profitRep.grossMarginPct}% gross margin</small></div>
          <div className="stat-card"><p>Balanced Journals</p><h3>{branchJournals.length}</h3><small>100% Debit == Credit</small></div>
        </div>

        {message && <p className="notice mt-md" role="status">{message}</p>}
        {error && <p className="form-error mt-md" role="alert">{error}</p>}
      </section>

      {tab === 'eod' && (
        <div className="stacked-pages">
          <section className="card">
            <div className="card-head wrap-head">
              <div>
                <h2>Tax &amp; Compliance Mode</h2>
                <p className="muted">Switch between Simplified Informal Cash mode and formal KRA eTIMS VAT (16%) without losing historical records.</p>
              </div>
              <div className="inline-controls">
                <button type="button" className={complianceMode === 'etims_vat' ? 'primary' : ''} onClick={() => void setComplianceMode('etims_vat')}>
                  KRA eTIMS VAT (16%)
                </button>
                <button type="button" className={complianceMode === 'simplified' ? 'primary' : ''} onClick={() => void setComplianceMode('simplified')}>
                  Simplified Informal Mode
                </button>
              </div>
            </div>
          </section>

          <div className="dashboard-grid">
            <section className="card">
              <h2>Daily Expense Capture</h2>
              <form onSubmit={submitExpense} className="expense-form">
                <label>Category<input name="category" placeholder="Boda Courier, Petty Cash, Airtime…" required /></label>
                <label>Amount (KES)<input name="amount" type="number" min="1" step="0.01" required /></label>
                <label>Description<input name="description" placeholder="Optional note" /></label>
                <button className="primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Record Expense & Post JE'}</button>
              </form>
              <ul className="draft-list mt-lg">
                {branchExpenses.slice(0, 6).map(exp => (
                  <li key={exp.id}>
                    <div>
                      <strong>{exp.category}</strong>
                      <small>{exp.description || exp.expenseDate}</small>
                    </div>
                    <strong>{formatMoney(exp.amount)}</strong>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card">
              <h2>End-of-Day Cash Reconciliation</h2>
              <p className="muted">Expected drawer cash: <strong>{formatMoney(expectedDrawerCash)}</strong></p>
              <form onSubmit={submitEod} className="expense-form">
                <label>
                  Counted Cash in Drawer (KES)
                  <input type="number" min="0" step="0.01" value={cashCounted} onChange={e => setCashCounted(e.target.value)} required />
                </label>
                <button className="primary" type="submit">Close EOD &amp; Log Variance</button>
              </form>
              {eodResult && (
                <div className="sub-card mt-md">
                  <strong>EOD Summary ({eodResult.date})</strong>
                  <p>Expected Cash: {formatMoney(eodResult.expectedDrawerCash)} · Counted: {formatMoney(eodResult.counted)}</p>
                  <p>Variance: <strong className={eodResult.variance < 0 ? 'form-error' : ''}>{formatMoney(eodResult.variance)}</strong></p>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {tab === 'ledger' && (
        <div className="stacked-pages">
          <section className="card">
            <div className="card-head wrap-head">
              <div>
                <h2>Immutable Double-Entry General Ledger</h2>
                <p className="muted">Every sale, expense, GRN receipt, return, purchase return, and approved variance auto-posts a balanced entry. Corrections create reversing entries only.</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    `kenyamoto-general-ledger-${activeBranchId}.csv`,
                    ['EntryNumber', 'Type', 'DebitAccount', 'CreditAccount', 'TotalDebitKES', 'TotalCreditKES', 'Description'],
                    branchJournals.map(j => [j.entryNumber, j.entryType, j.debitAccount, j.creditAccount, j.totalDebit, j.totalCredit, j.description]),
                  )
                }
              >
                Export Ledger CSV
              </button>
            </div>

            <div className="saas-table-wrap">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Entry # &amp; Type</th>
                    <th>Journal Lines (Dr / Cr)</th>
                    <th className="num">Total Debit</th>
                    <th className="num">Total Credit</th>
                    <th className="num">Correction</th>
                  </tr>
                </thead>
                <tbody>
                  {branchJournals.map(je => {
                    const lines = parseJournalLines(je)
                    const alreadyReversed = branchJournals.some(other => other.reversesEntryId === je.id)
                    return (
                      <tr key={je.id}>
                        <td>
                          <span className="cell-title mono">{je.entryNumber}</span>
                          <span className="status-tag muted">{je.entryType}</span>
                          <span className="cell-sub">{je.description}</span>
                        </td>
                        <td>
                          <div className="je-lines">
                            {lines.map((l, idx) => (
                              <span key={`${je.id}-${idx}`}>
                                {l.account}: {l.debit > 0 ? `Dr ${formatMoney(l.debit)}` : `Cr ${formatMoney(l.credit)}`}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="num">{formatMoney(je.totalDebit)}</td>
                        <td className="num">{formatMoney(je.totalCredit)}</td>
                        <td className="num">
                          {je.entryType !== 'manual_reversal' && !alreadyReversed ? (
                            <button
                              type="button"
                              className="btn-sm"
                              onClick={() => void postReversingJournalEntry(je.id, 'Accountant ledger reversal')}
                            >
                              Post Reversal
                            </button>
                          ) : (
                            <span className="muted">{alreadyReversed ? 'Reversed' : 'Reversal Entry'}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>Chart of Accounts (CoA)</h2>
            <div className="saas-table-wrap">
              <table className="saas-table">
                <thead>
                  <tr><th>Account Code</th><th>Account Name</th><th>Category</th></tr>
                </thead>
                <tbody>
                  {CHART_OF_ACCOUNTS.map(acc => (
                    <tr key={acc.code}>
                      <td className="mono">{acc.code}</td>
                      <td className="cell-title">{acc.name}</td>
                      <td><span className="status-tag muted">{acc.category}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === 'reports' && (
        <section className="card">
          <div className="card-head wrap-head">
            <div>
              <h2>Operational &amp; Financial Reports (RPT-002 – RPT-007)</h2>
              <p className="muted">Live Nairobi branch KPIs reconciled from immutable sales, stock movements, POs, and drawer shifts.</p>
            </div>
            <button
              type="button"
              className="primary"
              onClick={() =>
                downloadCsv(
                  `kenyamoto-daily-summary-${nairobiDay()}.csv`,
                  ['Metric', 'Value'],
                  [
                    ['Transactions', dailySummary.transactionCount],
                    ['Gross Sales KES', dailySummary.grossSales],
                    ['Approved Returns KES', dailySummary.totalRefunds],
                    ['Net Sales KES', dailySummary.netSales],
                    ['COGS KES', profitRep.cogs],
                    ['Gross Profit KES', profitRep.grossProfit],
                    ['Operating Expenses KES', profitRep.operatingExpenses],
                    ['Net Profit KES', profitRep.netProfit],
                  ],
                )
              }
            >
              Export Daily Summary CSV
            </button>
          </div>

          <div className="filter-bar">
            <label>
              Start Date (Nairobi EAT)
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </label>
            <label>
              End Date (Nairobi EAT)
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </label>
            <label>
              Payment Method Filter
              <select value={paymentMethodFilter} onChange={e => setPaymentMethodFilter(e.target.value)}>
                <option value="all">All Tender Methods</option>
                <option value="cash">Cash</option>
                <option value="mobile_money_reference">M-Pesa / Mobile Money</option>
                <option value="bank_reference">Bank Transfer</option>
                <option value="card_reference">Card</option>
                <option value="credit">Approved Credit</option>
                <option value="split">Split Tender</option>
              </select>
            </label>
            {(startDate || endDate || paymentMethodFilter !== 'all') && (
              <button
                type="button"
                className="btn-sm"
                onClick={() => {
                  setStartDate('')
                  setEndDate('')
                  setPaymentMethodFilter('all')
                }}
              >
                Clear Filters
              </button>
            )}
          </div>

          <div className="dashboard-grid">
            <article className="sub-card">
              <strong>RPT-002 · Daily Business Summary</strong>
              <p className="muted">Sales Count: {dailySummary.transactionCount} · Net Sales: {formatMoney(dailySummary.netSales)}</p>
              <p className="muted">Expenses: {formatMoney(dailySummary.totalExpenses)} · Net Cash Flow: <strong>{formatMoney(dailySummary.netOperatingCashFlow)}</strong></p>
            </article>

            <article className="sub-card">
              <strong>RPT-003 · Sales by Payment Method</strong>
              {salesRep.byPaymentMethod.map(m => (
                <p className="muted" key={m.method}>{m.method}: {m.count} txn(s) — <strong>{formatMoney(m.total)}</strong></p>
              ))}
            </article>

            <article className="sub-card">
              <strong>RPT-004 · Profit, COGS &amp; Net Margin</strong>
              <p className="muted">Net Rev (Ex-VAT): {formatMoney(profitRep.netRevenueExVat)} · COGS: {formatMoney(profitRep.cogs)}</p>
              <p className="muted">Gross Profit: {formatMoney(profitRep.grossProfit)} ({profitRep.grossMarginPct}%) · Net Profit: <strong>{formatMoney(profitRep.netProfit)}</strong></p>
            </article>

            <article className="sub-card">
              <strong>RPT-005 &amp; RPT-007 · Cash Variance &amp; Procurement</strong>
              <p className="muted">Shift Cash Variance: {formatMoney(cashRep.totalVariance)} ({cashRep.openCount} open, {cashRep.closedCount} closed)</p>
              <p className="muted">POs: {purchaseRep.orderCount} · Landed: {formatMoney(purchaseRep.totalLandedCost)} (+{purchaseRep.freightOverheadPct}% freight/clearing)</p>
            </article>
          </div>

          <div className="card-head wrap-head section-divider">
            <h3>RPT-006 · Branch Stock On-Hand, ABC Tier &amp; Valuation ({stockRep.length} SKUs)</h3>
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  `kenyamoto-stock-report-${activeBranchId}.csv`,
                  ['PartNumber', 'PartName', 'AbcTier', 'Bin', 'OnHand', 'Reserved', 'Available', 'CostValueKES', 'RetailValueKES'],
                  stockRep.map(r => [r.partNumber, r.partName, r.abcTier, r.binLocation, r.onHand, r.reserved, r.available, r.costValue, r.retailValue]),
                )
              }
            >
              Export Stock CSV
            </button>
          </div>
          <div className="saas-table-wrap">
            <table className="saas-table">
              <thead>
                <tr>
                  <th>SKU &amp; ABC</th>
                  <th>Bin</th>
                  <th className="num">On Hand / Avail</th>
                  <th className="num">Cost Value</th>
                  <th className="num">Retail Value</th>
                </tr>
              </thead>
              <tbody>
                {stockRep.map(row => (
                  <tr key={row.partNumber}>
                    <td>
                      <span className="mono">{row.partNumber}</span> · {row.partName}{' '}
                      <span className={`abc-badge abc-badge-${String(row.abcTier || 'c').toLowerCase()}`}>
                        {row.abcTier}
                      </span>
                    </td>
                    <td className="mono">{row.binLocation}</td>
                    <td className="num">{row.onHand} ({row.available} avail)</td>
                    <td className="num">{formatMoney(row.costValue)}</td>
                    <td className="num">{formatMoney(row.retailValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'etims' && (
        <div className="stacked-pages">
          <section className="card">
            <h2>KRA eTIMS VSCU Submission Queue</h2>
            {!etimsInvoices.length ? (
              <p className="muted">No eTIMS invoices queued yet. Complete a POS sale in eTIMS VAT mode to queue an electronic invoice.</p>
            ) : (
              <div className="po-list">
                {etimsInvoices.map(inv => (
                  <article className="sub-card" key={inv.id}>
                    <div className="card-head wrap-head">
                      <div>
                        <strong>{inv.invoiceNumber}</strong>
                        <p className="muted">
                          Total: {formatMoney(inv.totalAmount)} (VAT {formatMoney(inv.vatAmount)}) · Status: <strong>{inv.status}</strong>
                          {inv.cuin ? ` · CUIN: ${inv.cuin}` : ''}
                        </p>
                      </div>
                      {inv.status !== 'Accepted' && (
                        <button className="primary" type="button" onClick={() => void retryEtimsInvoice(inv.id)}>
                          Submit to VSCU (Mock CUIN)
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2>Owner-Approved Payout Batches</h2>
            <div className="po-list">
              {payoutBatches.map(batch => (
                <article className="sub-card" key={batch.id}>
                  <div className="card-head wrap-head">
                    <div>
                      <strong>{batch.title}</strong>
                      <p className="muted">
                        {batch.category} · {batch.recipientCount} recipient(s) · <strong>{formatMoney(batch.totalAmount)}</strong> · Status: <strong>{batch.status}</strong>
                      </p>
                    </div>
                    {batch.status === 'PendingApproval' && (
                      <div className="inline-controls">
                        <button className="primary" type="button" onClick={() => void resolvePayoutBatch(batch.id, true)}>Approve Payout</button>
                        <button type="button" onClick={() => void resolvePayoutBatch(batch.id, false)}>Reject</button>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <form className="inventory-form" onSubmit={handleNewPayout}>
              <h3>Stage New Payout Batch</h3>
              <div className="form-grid">
                <label>Batch Title<input name="title" required placeholder="Nairobi Riders Weekly Payout" /></label>
                <label>
                  Category
                  <select name="category">
                    <option value="RiderSettlement">Rider Settlement</option>
                    <option value="Payroll">Payroll (PAYE / SHIF / NSSF)</option>
                    <option value="ReferralCommission">Referral Commission</option>
                    <option value="SupplierPayable">Supplier Payable</option>
                  </select>
                </label>
                <label>Recipients<input name="recipientCount" type="number" min="1" defaultValue="3" required /></label>
                <label>Total Amount (KES)<input name="totalAmount" type="number" min="1" step="0.01" required /></label>
              </div>
              <button className="primary" type="submit">Stage Payout Batch</button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
