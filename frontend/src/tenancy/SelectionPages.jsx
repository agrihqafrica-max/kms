import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { useTenant } from './context.js'
import { Brand } from '../components/States.jsx'
import { t } from '../i18n/index.js'

export function OrgPicker() {
  const navigate = useNavigate()
  const { data, choose, pickerOptions, notice } = useTenant()
  const { signOut } = useAuth()
  const memberships = data?.memberships ?? []
  const seen = new Set()
  const options = (pickerOptions ?? memberships).filter(m => {
    if (seen.has(m.organization_id) || !memberships.some(row => row.organization_id === m.organization_id)) return false
    seen.add(m.organization_id)
    return true
  })
  return <main className="selection-page"><section className="auth-card"><Brand /><h1 tabIndex={-1}>{t('selectOrg')}</h1><p>{t('selectOrgBody')}</p>{notice && <p role="status">{notice}</p>}
    <div className="org-options">{options.map(m => <button key={m.organization_id} onClick={() => { choose(m.organization_id); navigate('/app/overview', { replace: true }) }}><strong>{m.organization_name ?? m.name}</strong><span>{t(`role_${m.role}`)}</span></button>)}</div>
    <button onClick={() => signOut()}>{t('signOut')}</button>
  </section></main>
}
export function NoOrganization() {
  const { reload, notice } = useTenant()
  const { signOut } = useAuth()
  return <main className="selection-page"><section className="auth-card"><Brand /><h1 tabIndex={-1}>{t('noOrg')}</h1><p>{t('noOrgBody')}</p>{notice && <p role="status">{notice}</p>}
    <button disabled>{t('registerBusiness')} — {t('comingNext')}</button><div className="actions"><button className="primary" onClick={reload}>{t('checkAgain')}</button><button onClick={() => signOut()}>{t('signOut')}</button></div>
  </section></main>
}

export function BranchSwitcher() {
  const { data, choose } = useTenant()
  const { context, memberships } = data
  const organizations = [...new Map(memberships.map(m => [m.organization_id, m.organization_name])).entries()]
  const rows = memberships.filter(m => m.organization_id === context.organization_id)
  const branches = [...new Set(rows.map(m => m.branch_id).filter(Boolean))]
  return <div className="tenant-switcher" id="tenant-switcher">
    <label>{t('organization')}<select value={context.organization_id} onChange={e => choose(e.target.value)}>{organizations.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    <label>{t('branch')}<select value={context.branch_id ?? ''} onChange={e => choose(context.organization_id, e.target.value || null)}>
      {(rows.some(m => !m.branch_id) || !branches.length) && <option value="">{t('allBranches')}</option>}
      {branches.map(id => <option key={id} value={id}>{t('branchLabel', { suffix: id.slice(-4) })}</option>)}
    </select></label>
  </div>
}
