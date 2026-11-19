import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { api } from '../lib/supabase.js'
import { storeSelection } from '../tenancy/selection.js'
import { Brand } from '../components/States.jsx'
import { t } from '../i18n/index.js'

const CUSTOM_ORGS_PREFIX = 'kms.customOrgs.'

export default function OrganizationRegistration() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)

  async function submit(event) {
    event.preventDefault()
    if (submitting.current) return
    const form = new FormData(event.currentTarget)
    const name = String(form.get('name') ?? '').trim()
    const shopName = String(form.get('branch_name') ?? '').trim() || `${name} Main Shop`
    const area = String(form.get('area') ?? '').trim() || 'Kenya'
    const payload = {
      name,
      kra_pin: String(form.get('kra_pin') ?? '').trim() || null,
      org_type: String(form.get('org_type') ?? 'RETAIL'),
      subscription_tier: 'standard',
      kra_compliance_enabled: form.get('kra_compliance_enabled') === 'on',
      payroll_compliance_enabled: form.get('payroll_compliance_enabled') === 'on',
    }
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      let orgId = `org-${Date.now()}`
      const branchId = `branch-${Date.now()}`
      try {
        const res = await api.request('/organizations/register', { tenant: false, method: 'POST', body: payload })
        if (res?.organization_id) orgId = res.organization_id
      } catch {
        // Persist locally for Firebase-authenticated sessions if REST token isn't active
      }

      if (session?.user?.id) {
        try {
          const key = `${CUSTOM_ORGS_PREFIX}${session.user.id}`
          const existing = JSON.parse(localStorage.getItem(key) || '[]')
          const next = [
            ...(Array.isArray(existing) ? existing : []),
            {
              organization_id: orgId,
              organization_name: name,
              org_type: payload.org_type,
              branch_id: branchId,
              branch_name: shopName,
              area,
              role: 'owner',
            },
          ]
          localStorage.setItem(key, JSON.stringify(next))
          storeSelection(session.user.id, { organizationId: orgId, branchId })
        } catch {
          // ignore storage errors
        }
      }

      navigate('/app/overview', { replace: true })
    } catch (failure) {
      setError(failure.detail || failure.message || t('requestError'))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <main className="selection-page">
      <section className="auth-card registration-card">
        <Brand />
        <h1 tabIndex={-1}>{t('registerBusiness')}</h1>
        <p>Add a new company, spare-parts shop, or motorcycle workshop inside Kenya Motorcycle Spare Parts General.</p>
        <form onSubmit={submit}>
          <label>
            Company / Workshop Name
            <input name="name" placeholder="e.g. Mombasa Road Riders Workshop" minLength="2" maxLength="255" required disabled={busy} />
          </label>
          <label>
            Primary Shop / Branch Name
            <input name="branch_name" placeholder="e.g. Main Counter & Service Bay" maxLength="120" disabled={busy} />
          </label>
          <label>
            Town / Location Area
            <input name="area" placeholder="e.g. Nairobi, Nakuru, Kisumu" maxLength="120" disabled={busy} />
          </label>
          <label>
            {t('kraPin')}
            <input name="kra_pin" maxLength="50" disabled={busy} />
          </label>
          <label>
            {t('organizationType')}
            <select name="org_type" disabled={busy}>
              <option value="RETAIL">Retail Spare Parts Shop</option>
              <option value="MECHANIC">Motorcycle Workshop / Garage</option>
              <option value="WHOLESALER">Wholesaler</option>
              <option value="IMPORTER">Importer</option>
              <option value="CUSTOMER">Fleet / Rider Account</option>
            </select>
          </label>
          <label className="check-row">
            <input type="checkbox" name="kra_compliance_enabled" disabled={busy} />
            {t('kraCompliance')}
          </label>
          <label className="check-row">
            <input type="checkbox" name="payroll_compliance_enabled" disabled={busy} />
            {t('payrollCompliance')}
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="actions">
            <button className="primary" type="submit" disabled={busy}>
              {busy ? t('working') : 'Save & Open Shop Workspace'}
            </button>
            <Link className="button-link" to="/app/overview">
              Back to Workspace
            </Link>
          </div>
        </form>
      </section>
    </main>
  )
}
