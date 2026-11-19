import { useState } from 'react'
import { useWorkspace } from '../lib/workspaceContext.js'
import { formatMoney } from '../lib/format.js'

export default function Dispatch() {
  const {
    branches,
    activeBranchId,
    transfers,
    creditAccounts,
    createBranchTransfer,
    updateBranchTransfer,
    createCreditAccount,
    settleCreditBalance,
  } = useWorkspace()

  const [riderName, setRiderName] = useState('Peter Ochieng')
  const [plateNumber, setPlateNumber] = useState('KMFB 720C')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleTransferSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setNotice('')
    try {
      await createBranchTransfer({
        destinationBranchName: form.get('destinationBranchName'),
        partSummary: form.get('partSummary'),
        quantity: form.get('quantity'),
      })
      event.currentTarget.reset()
      setNotice('Branch transfer request logged.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreditSubmit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setNotice('')
    try {
      await createCreditAccount({
        customerName: form.get('customerName'),
        creditLimit: form.get('creditLimit'),
        outstandingBalance: form.get('outstandingBalance'),
        lastOrderDaysAgo: form.get('lastOrderDaysAgo'),
      })
      event.currentTarget.reset()
      setNotice('Wholesale credit profile added.')
    } finally {
      setBusy(false)
    }
  }

  const otherBranch = branches.find(b => b.id !== activeBranchId) || branches[0]

  return (
    <div className="stacked-pages">
      <section className="card">
        <div className="card-head wrap-head">
          <div>
            <p className="eyebrow">Phase 3 · Wholesale, Branch Transfers &amp; Riders</p>
            <h2>Inter-Branch Dispatch &amp; Rider Tracking</h2>
          </div>
          <div className="inline-controls">
            <label className="compact-field">
              Rider Name
              <input value={riderName} onChange={e => setRiderName(e.target.value)} />
            </label>
            <label className="compact-field">
              Bike Plate
              <input value={plateNumber} onChange={e => setPlateNumber(e.target.value)} />
            </label>
          </div>
        </div>

        {notice && <p className="notice" role="status">{notice}</p>}

        <div className="po-list">
          {transfers.map(tr => (
            <article className="sub-card" key={tr.id}>
              <div className="card-head wrap-head">
                <div>
                  <strong>{tr.partSummary} (Qty {tr.quantity})</strong>
                  <p className="muted">
                    To: {tr.destinationBranchName} · Status: <strong>{tr.status}</strong>
                    {tr.riderName ? ` · Rider: ${tr.riderName}` : ''}
                    {tr.plateNumber ? ` (${tr.plateNumber})` : ''}
                  </p>
                </div>
                <div className="inline-controls">
                  {tr.status === 'Pending' && (
                    <>
                      <button className="primary" type="button" onClick={() => void updateBranchTransfer(tr.id, 'Approved')}>
                        Approve
                      </button>
                      <button type="button" onClick={() => void updateBranchTransfer(tr.id, 'Rejected')}>
                        Reject
                      </button>
                    </>
                  )}
                  {tr.status === 'Approved' && (
                    <button
                      className="primary"
                      type="button"
                      onClick={() => void updateBranchTransfer(tr.id, 'Dispatched', { riderName, plateNumber })}
                    >
                      Dispatch Rider
                    </button>
                  )}
                  {tr.status === 'Dispatched' && (
                    <button className="primary" type="button" onClick={() => void updateBranchTransfer(tr.id, 'Received')}>
                      Confirm POD Received
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>

        <form className="inventory-form" onSubmit={handleTransferSubmit}>
          <h3>Request Inter-Branch Stock Transfer</h3>
          <div className="form-grid">
            <label>
              Destination Branch / Hub
              <input name="destinationBranchName" defaultValue={otherBranch?.name || 'Industrial Area Depot'} required />
            </label>
            <label>
              Part Summary
              <input name="partSummary" placeholder="Bajaj Boxer Chain Kit (BJ-CSK-150)" required />
            </label>
            <label>
              Quantity
              <input name="quantity" type="number" min="1" defaultValue="4" required />
            </label>
          </div>
          <button className="primary" type="submit" disabled={busy}>Create Transfer Request</button>
        </form>
      </section>

      <section className="card">
        <p className="eyebrow">Phase 3 · Trade Receivables &amp; Retention</p>
        <h2>Wholesale Credit Limits &amp; Buyer Churn Radar</h2>
        <div className="po-list">
          {creditAccounts.map(acc => {
            const utilization = acc.creditLimit > 0 ? Math.round((acc.outstandingBalance / acc.creditLimit) * 100) : 0
            return (
              <article className="sub-card" key={acc.id}>
                <div className="card-head wrap-head">
                  <div>
                    <strong>{acc.customerName}</strong>
                    <p className="muted">
                      Outstanding: <strong>{formatMoney(acc.outstandingBalance)}</strong> / Limit {formatMoney(acc.creditLimit)} ({utilization}% utilized) · Last order: {acc.lastOrderDaysAgo}d ago
                    </p>
                  </div>
                  <div className="inline-controls">
                    <span className={`status-tag ${acc.churnRisk === 'High' ? 'danger' : acc.churnRisk === 'Medium' ? 'warn' : 'ok'}`}>
                      Churn: {acc.churnRisk}
                    </span>
                    {acc.outstandingBalance > 0 && (
                      <button type="button" onClick={() => void settleCreditBalance(acc.id, 10000)}>
                        Record KES 10,000 Payment
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        <form className="inventory-form" onSubmit={handleCreditSubmit}>
          <h3>Add Wholesale Buyer Credit Account</h3>
          <div className="form-grid">
            <label>Wholesale Customer<input name="customerName" required placeholder="Githurai Spares & Hardware" /></label>
            <label>Credit Limit (KES)<input name="creditLimit" type="number" min="1000" defaultValue="75000" required /></label>
            <label>Current Balance (KES)<input name="outstandingBalance" type="number" min="0" defaultValue="0" /></label>
            <label>Days Since Last Order<input name="lastOrderDaysAgo" type="number" min="0" defaultValue="0" /></label>
          </div>
          <button className="primary" type="submit" disabled={busy}>Save Credit Account</button>
        </form>
      </section>
    </div>
  )
}
