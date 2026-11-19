import { Link } from 'react-router-dom'
import { useWorkspace } from '../lib/workspaceContext.js'
import { formatMoney, nairobiDay } from '../lib/format.js'
import { classifyStockVelocity } from '../lib/kmsDomain.js'
import { t } from '../i18n/index.js'

const WEEKLY_BARS = [
  { day: 'Mon', pct: 46 },
  { day: 'Tue', pct: 62 },
  { day: 'Wed', pct: 58 },
  { day: 'Thu', pct: 74 },
  { day: 'Fri', pct: 92 },
  { day: 'Sat', pct: 86 },
  { day: 'Sun', pct: 39 },
]

export default function Overview() {
  const {
    activeBranchId,
    branches,
    complianceMode,
    inventory,
    sales,
    expenses,
    radarRequests,
    purchaseOrders,
    transfers,
    outbox,
    offlineMode,
  } = useWorkspace()

  const date = nairobiDay()
  const activeBranch = branches.find(b => b.id === activeBranchId) || branches[0]
  const branchItems = inventory.filter(i => i.branchId === activeBranchId)
  const branchSales = sales.filter(s => s.branchId === activeBranchId)
  const branchExpenses = expenses.filter(e => e.branchId === activeBranchId)

  const netSales = branchSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0)
  const expenseTotal = branchExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
  const lowStockCount = branchItems.filter(i => Number(i.stockQuantity) <= Number(i.reorderLevel)).length
  const deadStockCount = branchItems.filter(i => classifyStockVelocity(i).velocity === 'dead').length
  const inventoryValue = branchItems.reduce((sum, i) => sum + Number(i.unitCost) * Number(i.stockQuantity), 0)

  const pendingPOs = purchaseOrders.filter(po => po.status === 'Pending').length
  const activeTransfers = transfers.filter(tr => tr.status !== 'Received' && tr.status !== 'Rejected').length

  return (
    <>
      <section className="card">
        <div className="card-head wrap-head">
          <div>
            <h2>{activeBranch?.name || t('dashboardTitle')}</h2>
            <p className="muted period-note">
              Nairobi date: {date} · Mode: <strong>{complianceMode === 'etims_vat' ? 'KRA eTIMS VAT (16%)' : 'Simplified Cash'}</strong>
              {offlineMode ? ' · Offline Outbox Active' : ''}
              {outbox.length > 0 ? ` · ${outbox.length} queued offline sale(s)` : ''}
            </p>
          </div>
          <div className="actions-inline">
            <Link className="button-link" to="/app/pos">Open Counter POS</Link>
            <Link className="button-link" to="/app/assistant">Ask Gemini Co-Pilot</Link>
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div>
              <p>{t('netSales')}</p>
              <h3>{formatMoney(netSales)}</h3>
              <small>{branchSales.length} completed order(s)</small>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <p>{t('expenseTotal')}</p>
              <h3>{formatMoney(expenseTotal)}</h3>
              <small>{branchExpenses.length} expense entries</small>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <p>{t('lowStock')}</p>
              <h3>{lowStockCount}</h3>
              <small>{deadStockCount} dead-stock SKU(s)</small>
            </div>
          </div>
          <div className="stat-card">
            <div>
              <p>Stock Cost Value</p>
              <h3>{formatMoney(inventoryValue)}</h3>
              <small>{branchItems.length} active branch SKUs</small>
            </div>
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="card chart-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Operations Pulse</p>
              <h2>Weekly Sales &amp; Fulfilment Activity</h2>
            </div>
            <span className="status-tag ok">{pendingPOs} Pending PO · {activeTransfers} Active Dispatch</span>
          </div>
          <div className="chart" aria-label="Weekly revenue activity">
            <div className="bars">
              {WEEKLY_BARS.map(bar => (
                <div className="bar-wrap" key={bar.day}>
                  <span style={{ height: `${bar.pct}%` }} />
                  <small>{bar.day}</small>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="card radar-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Phase 4 · Parts Radar</p>
              <h2>Live Sourcing Requests</h2>
            </div>
            <Link className="text-button" to="/app/radar">Open Radar →</Link>
          </div>
          {radarRequests.slice(0, 4).map((req, idx) => (
            <div className="radar-row" key={req.id}>
              <div className={`radar-badge b${idx % 3}`}>{req.urgencyStatus === 'Urgent' ? '!' : 'PR'}</div>
              <div>
                <strong>{req.partDescription}</strong>
                <small>{req.motorcycleModel || 'Universal'} · {req.locationArea || 'Nairobi'}</small>
              </div>
              <span className="status-tag warn">{req.status}</span>
            </div>
          ))}
        </section>
      </div>

      <section className="card sales-card">
        <div className="card-head">
          <div>
            <p className="eyebrow">Ledger Integrity</p>
            <h2>{t('recentTitle')}</h2>
          </div>
          <Link className="text-button" to="/app/finance">Finance &amp; eTIMS →</Link>
        </div>
        {!branchSales.length ? (
          <p className="muted">No sales recorded on this branch yet. Complete a sale on Counter POS.</p>
        ) : (
          <div className="sales-table">
            <div className="table-head">
              <span>Order</span>
              <span>Payment Method</span>
              <span>eTIMS Status</span>
              <span>Total</span>
            </div>
            {branchSales.slice(0, 6).map(sale => (
              <div className="table-row" key={sale.id}>
                <span>{sale.customerName || 'Walk-in Rider'}</span>
                <span>{sale.paymentMethod}</span>
                <span>{sale.etimsStatus}</span>
                <strong>{formatMoney(sale.totalAmount)}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
