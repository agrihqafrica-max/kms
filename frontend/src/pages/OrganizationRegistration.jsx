import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/supabase.js'
import { Brand } from '../components/States.jsx'
import { t } from '../i18n/index.js'

export default function OrganizationRegistration() {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)

  async function submit(event) {
    event.preventDefault()
    if (submitting.current) return
    const form = new FormData(event.currentTarget)
    const payload = {
      name: String(form.get('name') ?? '').trim(),
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
      await api.request('/organizations/register', { tenant: false, method: 'POST', body: payload })
      navigate('/app/overview', { replace: true })
    } catch (failure) {
      setError(failure.detail || failure.message || t('requestError'))
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return <main className="selection-page"><section className="auth-card registration-card"><Brand /><h1 tabIndex={-1}>{t('registerBusiness')}</h1>
    <p>{t('registerBusinessBody')}</p>
    <form onSubmit={submit}>
      <label>{t('businessName')}<input name="name" minLength="2" maxLength="255" required disabled={busy} /></label>
      <label>{t('kraPin')}<input name="kra_pin" maxLength="50" disabled={busy} /></label>
      <label>{t('organizationType')}<select name="org_type" disabled={busy}><option value="RETAIL">Retail</option><option value="WHOLESALER">Wholesaler</option><option value="IMPORTER">Importer</option><option value="MECHANIC">Mechanic</option><option value="CUSTOMER">Customer</option></select></label>
      <label className="check-row"><input type="checkbox" name="kra_compliance_enabled" disabled={busy} />{t('kraCompliance')}</label>
      <label className="check-row"><input type="checkbox" name="payroll_compliance_enabled" disabled={busy} />{t('payrollCompliance')}</label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={busy}>{busy ? t('working') : t('registerBusiness')}</button>
    </form>
  </section></main>
}
