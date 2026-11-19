import { useState } from 'react'
import { useTenant } from '../tenancy/context.js'
import { api } from '../lib/supabase.js'
import { nairobiDay } from '../lib/format.js'

export default function Finance() {
  const { data: { context } } = useTenant()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const payload = { category: form.get('category'), amount: form.get('amount'), description: form.get('description') || null, expense_date: nairobiDay() }
    setBusy(true); setError(''); setMessage('')
    try { await api.request('/finance/expenses', { method: 'POST', body: payload }); setMessage('Expense recorded.'); event.currentTarget.reset() }
    catch (failure) { setError(failure.detail || failure.message) }
    finally { setBusy(false) }
  }

  if (!['owner','manager','accountant'].includes(context.role)) return <section className="card simple-page"><h2>Finance & EOD</h2><p>You do not have finance access.</p></section>
  return <section className="card finance-page"><h2>Daily expense</h2>
    <form onSubmit={submit} className="expense-form">
      <label>Category<input name="category" required /></label><label>Amount (KES)<input name="amount" type="number" min="0.01" step="0.01" required /></label><label>Description<input name="description" /></label>
      {message && <p role="status">{message}</p>}{error && <p className="form-error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Record expense'}</button>
    </form>
  </section>
}
