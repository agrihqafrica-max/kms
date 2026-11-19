import { useState } from 'react'
import { useWorkspace } from '../lib/workspaceContext.js'
import { formatMoney } from '../lib/format.js'
import { blindStockProjection, classifyStockVelocity } from '../lib/kmsDomain.js'
import { ROLE_APPROVAL_LIMITS } from '../lib/platformGovernance.js'
import { buildPlatformHealthReport } from '../lib/reportingEngine.js'

export default function Network() {
  const {
    inventory = [],
    auditLogs = [],
    branches,
    activeBranchId,
    outbox = [],
    etimsInvoices = [],
    notifications = [],
    journalEntries = [],
    featureFlags = {},
    toggleFeatureFlag,
    notificationPrefs = {},
    toggleNotificationPref,
  } = useWorkspace()

  const [tab, setTab] = useState('governance')
  const activeBranch = branches.find(b => b.id === activeBranchId) || branches[0]
  const blindCatalogue = inventory
    .filter(item => item.blindListed)
    .map(item => blindStockProjection(item, activeBranch?.area || 'Nairobi'))

  const forecastRows = inventory.map(item => {
    const metrics = classifyStockVelocity(item)
    const monthlyProjection =
      metrics.velocity === 'fast'
        ? Math.max(item.reorderLevel * 3, 24)
        : metrics.velocity === 'normal'
          ? Math.max(item.reorderLevel * 2, 12)
          : metrics.velocity === 'slow'
            ? 4
            : 0
    return { item, metrics, monthlyProjection }
  })

  const health = buildPlatformHealthReport({
    outbox,
    etimsInvoices,
    notifications,
    journalEntries,
    auditLogs,
  })

  function exportForecastCsv() {
    const headers = ['PartNumber,PartName,Branch,StockOnHand,Velocity,Projected30DayDemand,SuggestedReorderQty']
    const rows = forecastRows.map(
      r =>
        `"${r.item.partNumber}","${r.item.partName}","${r.item.branchId}",${r.item.stockQuantity},${r.metrics.velocity},${r.monthlyProjection},${r.metrics.suggestedOrderQty}`,
    )
    const blob = new Blob([headers.concat(rows).join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'kenyamoto-demand-forecast.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="stacked-pages">
      <section className="card">
        <div className="card-head wrap-head">
          <div>
            <p className="eyebrow">Tenant Governance, Feature Flags, Health &amp; Blind-Stock Network</p>
            <h2>Network &amp; Platform Governance</h2>
          </div>
          <div className="tab-strip" role="tablist" aria-label="Network and governance tabs">
            {[
              ['governance', 'Feature Flags & Limits'],
              ['health', `Health & Audit (${auditLogs.length})`],
              ['marketplace', `Blind Catalogue & Forecast (${blindCatalogue.length})`],
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
      </section>

      {tab === 'governance' && (
        <div className="dashboard-grid">
          <section className="card">
            <h2>Tenant Feature Flags (PLT-007)</h2>
            <p className="muted">Enable or suspend tenant capabilities safely with audit trail logging.</p>
            <div className="switch-list">
              {[
                ['etimsVscu', 'KRA eTIMS VAT & VSCU Queue'],
                ['offlineOutbox', 'Offline POS Outbox & Idempotent Sync'],
                ['packBreaking', 'UoM Pack-Breaking Conversions'],
                ['partsRadar', 'Parts Radar Sourcing Network'],
                ['blindStock', 'Blind-Stock Margin Protection'],
                ['aiCopilot', 'Gemini Parts & Operations Co-Pilot'],
              ].map(([key, label]) => (
                <div className="switch-row" key={key}>
                  <span>{label}</span>
                  <button
                    type="button"
                    className={featureFlags[key] ? 'status-tag ok' : 'status-tag danger'}
                    onClick={() => toggleFeatureFlag(key)}
                  >
                    {featureFlags[key] ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              ))}
            </div>

            <h3 style={{ marginTop: '18px' }}>Notification Channel Preferences (NTF-008)</h3>
            <div className="switch-list">
              {[
                ['inAppEnabled', 'In-App Notification Center'],
                ['whatsAppEnabled', 'WhatsApp Customer Receipts'],
                ['smsEnabled', 'SMS Alerts & Campaigns'],
                ['quietHoursEnabled', 'Quiet Hours (21:00–07:00 EAT Deferral)'],
              ].map(([key, label]) => (
                <div className="switch-row" key={key}>
                  <span>{label}</span>
                  <button
                    type="button"
                    className={notificationPrefs[key] ? 'status-tag ok' : 'status-tag muted'}
                    onClick={() => toggleNotificationPref(key)}
                  >
                    {notificationPrefs[key] ? 'ON' : 'OFF'}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>Role Approval Limits Matrix (IDN-009)</h2>
            <p className="muted">Enforced dynamically on POS discounts, direct refunds, and payout approvals.</p>
            <div className="saas-table-wrap">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th className="num">Max Discount %</th>
                    <th className="num">Direct Refund Cap</th>
                    <th className="num">Payout Approval Cap</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(ROLE_APPROVAL_LIMITS).map(([role, caps]) => (
                    <tr key={role}>
                      <td className="cell-title">{role.toUpperCase()}</td>
                      <td className="num">{caps.maxDiscountPct}%</td>
                      <td className="num">{Number.isFinite(caps.maxDirectRefundKes) ? formatMoney(caps.maxDirectRefundKes) : 'Unlimited'}</td>
                      <td className="num">{Number.isFinite(caps.maxPayoutApproveKes) ? formatMoney(caps.maxPayoutApproveKes) : 'Unlimited'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {tab === 'health' && (
        <div className="stacked-pages">
          <section className="card">
            <h2>Platform &amp; Sync Health Summary (RPT-014 / OPS-001)</h2>
            <div className="stats-grid">
              <div className="stat-card"><p>Balanced Journals</p><h3>{health.balancedJournalRatio}</h3></div>
              <div className="stat-card"><p>Offline Outbox Queued</p><h3>{health.offlineOutboxPending}</h3></div>
              <div className="stat-card"><p>Suppressed Alerts (Opt-Out)</p><h3>{health.suppressedNotifications}</h3></div>
              <div className="stat-card"><p>eTIMS Pending Queue</p><h3>{health.etimsFailedOrQueued}</h3></div>
            </div>
          </section>

          <section className="card">
            <h2>Immutable Security &amp; Operations Audit Trail</h2>
            <div className="po-list">
              {auditLogs.slice(0, 20).map(log => (
                <article className="sub-card" key={log.id}>
                  <div className="card-head wrap-head">
                    <strong>{log.actionType} · {log.module}</strong>
                    <span className="muted">{log.branchId || 'Org-wide'}</span>
                  </div>
                  <p className="muted">{log.summary}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === 'marketplace' && (
        <div className="stacked-pages">
          <section className="card">
            <h2>Blind-Stock Visibility Catalogue</h2>
            <p className="muted">Buyers and mechanics see part availability status, area, delivery ETA, and retail price — never your buying cost or exact warehouse stock depth.</p>
            <div className="product-grid">
              {blindCatalogue.map(listing => (
                <article className="product" key={listing.id}>
                  <span>{listing.partNumber}</span>
                  <h3>{listing.partName}</h3>
                  <small>{listing.compatibleModels}</small>
                  <p><strong>{listing.availabilityBadge}</strong> · {listing.areaLabel}</p>
                  <strong>{formatMoney(listing.retailPrice)}</strong>
                  <p className="muted">{listing.deliveryEta}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head wrap-head">
              <div>
                <h2>30-Day SKU Demand Forecast &amp; Replenishment</h2>
              </div>
              <button className="primary" type="button" onClick={exportForecastCsv}>
                Export CSV Report
              </button>
            </div>

            <div className="sales-table">
              <div className="table-head">
                <span>SKU</span>
                <span>Velocity</span>
                <span>30d Demand Est.</span>
                <span>Reorder Plan</span>
              </div>
              {forecastRows.map(row => (
                <div className="table-row" key={row.item.id}>
                  <span><strong>{row.item.partNumber}</strong><small className="muted"> {row.item.partName}</small></span>
                  <span>{row.metrics.velocity.toUpperCase()}</span>
                  <strong>{row.monthlyProjection} units</strong>
                  <strong>{row.metrics.suggestedOrderQty > 0 ? `+${row.metrics.suggestedOrderQty} units` : 'Sufficient'}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
