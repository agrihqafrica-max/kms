import { Link } from 'react-router-dom'
import { useTenant } from '../tenancy/context.js'
import { useWorkspace } from '../lib/workspaceContext.js'
import { formatMoney, nairobiDay } from '../lib/format.js'
import { classifyStockVelocity } from '../lib/kmsDomain.js'
import { buildWeeklySalesTrend } from '../lib/reportingEngine.js'
import { canAccessNavItem } from '../lib/platformGovernance.js'
import { t } from '../i18n/index.js'

export default function Overview() {
  const { data: { context, memberships = [] } } = useTenant()
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

  const role = context.role || 'owner'
  const canViewFinance = ['owner', 'manager', 'accountant'].includes(role)
  const canViewCosts = ['owner', 'manager', 'accountant'].includes(role)
  const canViewPos = canAccessNavItem(role, 'pos')
  const canViewAssistant = canAccessNavItem(role, 'assistant')
  const canViewRadar = canAccessNavItem(role, 'radar')
  const canViewInventory = canAccessNavItem(role, 'inventory')
  const canViewDispatch = canAccessNavItem(role, 'dispatch')

  const date = nairobiDay()
  const targetBranchId = context.branch_id || activeBranchId
  const membershipMatch = memberships.find(
    m => m.organization_id === context.organization_id && (!targetBranchId || m.branch_id === targetBranchId),
  )
  const activeBranch =
    branches.find(b => b.id === targetBranchId) ||
    (membershipMatch
      ? { id: membershipMatch.branch_id, name: membershipMatch.branch_name || context.organization_name }
      : branches[0])
  const branchItems = inventory.filter(i => i.branchId === targetBranchId)
  const branchSales = sales.filter(s => s.branchId === targetBranchId)
  const branchExpenses = expenses.filter(e => e.branchId === targetBranchId)

  const netSales = branchSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0)
  const expenseTotal = branchExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
  const lowStockCount = branchItems.filter(i => Number(i.stockQuantity) <= Number(i.reorderLevel)).length
  const deadStockCount = branchItems.filter(i => classifyStockVelocity(i).velocity === 'dead').length
  const inventoryValue = branchItems.reduce((sum, i) => sum + Number(i.unitCost) * Number(i.stockQuantity), 0)

  const pendingPOs = purchaseOrders.filter(po => po.status === 'Pending').length
  const activeTransfers = transfers.filter(tr => tr.status !== 'Received' && tr.status !== 'Rejected').length
  const openRadarCount = radarRequests.filter(r => r.status === 'Open' || r.status === 'Pending').length
  const weeklyTrend = buildWeeklySalesTrend(sales, targetBranchId)

  return (
    <>
      <section className="card">
        <div className="card-head wrap-head">
          <div>
            <h2>{activeBranch?.name || t('dashboardTitle')}</h2>
            <p className="muted period-note">
              Nairobi date: {date} · Team: <strong>{t(`role_${role}`)}</strong> · Mode:{' '}
              <strong>{complianceMode === 'etims_vat' ? 'KRA eTIMS VAT (16%)' : 'Simplified Cash'}</strong>
              {offlineMode ? ' · Offline Outbox Active' : ''}
              {outbox.length > 0 ? ` · ${outbox.length} queued offline sale(s)` : ''}
            </p>
          </div>
          <div className="actions-inline">
            {canViewPos && <Link className="button-link" to="/app/pos">Open Counter POS</Link>}
            {canViewInventory && <Link className="button-link" to="/app/inventory">Manage Spares Stock</Link>}
            {canViewFinance && <Link className="button-link" to="/app/finance">Finance &amp; EOD</Link>}
            {canViewAssistant && <Link className="button-link" to="/app/assistant">Ask Gemini Co-Pilot</Link>}
          </div>
        </div>

        <div className="stats-grid">
          {canViewFinance ? (
            <>
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
              {canViewCosts && (
                <div className="stat-card">
                  <div>
                    <p>Stock Cost Value</p>
                    <h3>{formatMoney(inventoryValue)}</h3>
                    <small>{branchItems.length} active branch SKUs</small>
                  </div>
                </div>
              )}
            </>
          ) : role === 'cashier' ? (
            <>
              <div className="stat-card">
                <div>
                  <p>Counter Orders</p>
                  <h3>{branchSales.length}</h3>
                  <small>Receipts processed at this branch</small>
                </div>
              </div>
              <div className="stat-card">
                <div>
                  <p>Catalogue SKUs</p>
                  <h3>{branchItems.length}</h3>
                  <small>Ready for counter lookup &amp; POS</small>
                </div>
              </div>
              <div className="stat-card">
                <div>
                  <p>{t('lowStock')}</p>
                  <h3>{lowStockCount}</h3>
                  <small>Flagged for restock</small>
                </div>
              </div>
              <div className="stat-card">
                <div>
                  <p>Open Parts Radar</p>
                  <h3>{openRadarCount}</h3>
                  <small>Active customer sourcing requests</small>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="stat-card">
                <div>
                  <p>Active Branch SKUs</p>
                  <h3>{branchItems.length}</h3>
                  <small>Tracked parts &amp; bins</small>
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
                  <p>Pending Purchase Orders</p>
                  <h3>{pendingPOs}</h3>
                  <small>Awaiting GRN receiving</small>
                </div>
              </div>
              <div className="stat-card">
                <div>
                  <p>Active Transfers / Dispatch</p>
                  <h3>{activeTransfers}</h3>
                  <small>In-transit branch movements</small>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="dashboard-grid">
        {canViewFinance ? (
          <section className="card chart-card">
            <div className="card-head wrap-head">
              <div>
                <p className="eyebrow">Operations Pulse (7-Day EAT)</p>
                <h2>Daily Branch Revenue Trend</h2>
              </div>
              <span className="status-tag ok">{pendingPOs} Pending PO · {activeTransfers} Active Dispatch</span>
            </div>
            <div className="chart" aria-label="7-day Nairobi revenue activity">
              <div className="bars">
                {weeklyTrend.buckets.map(bar => (
                  <div
                    className="bar-wrap"
                    key={bar.dayKey}
                    title={`${bar.dayKey}: ${formatMoney(bar.totalSales)} (${bar.orderCount} sale(s))`}
                  >
                    <span style={{ height: `${bar.heightPct}%` }} />
                    <small>{bar.dayLabel}</small>
                  </div>
                ))}
              </div>
            </div>
            <p className="muted mt-xs">
              {weeklyTrend.hasSalesData
                ? `Peak day: ${formatMoney(weeklyTrend.maxSales)} · Hover any day bar for Nairobi EAT daily total.`
                : 'No completed sales recorded on this branch in the past 7 Nairobi EAT days yet.'}
            </p>
          </section>
        ) : (
          <section className="card">
            <div className="card-head wrap-head">
              <div>
                <p className="eyebrow">Team Focus · {t(`role_${role}`)}</p>
                <h2>{role === 'cashier' ? 'Counter & Dispatch Queue' : 'Warehouse Replenishment & Transfers'}</h2>
              </div>
              {canViewDispatch && <Link className="text-button" to="/app/dispatch">Open Dispatch →</Link>}
            </div>
            <p className="muted">
              {role === 'cashier'
                ? 'Financial totals, profit margins, and company day reports are restricted to management. Use Counter POS, Check Spares in Quick Dock, and Parts Radar.'
                : 'Sales revenue and profit figures are hidden for the Stock & Supply team. Focus on cycle counts, GRN receiving, and low-stock reorders.'}
            </p>
            <div className="stats-grid mt-md">
              <div className="stat-card">
                <p>Pending POs</p>
                <h3>{pendingPOs}</h3>
              </div>
              <div className="stat-card">
                <p>Active Dispatches</p>
                <h3>{activeTransfers}</h3>
              </div>
            </div>
          </section>
        )}

        {canViewRadar && (
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
        )}
      </div>

      {canViewFinance && (
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
      )}
    </>
  )
}
