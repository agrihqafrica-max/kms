import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { useTenant } from './context.js'
import { useWorkspace } from '../lib/workspaceContext.js'
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
  return (
    <main className="selection-page">
      <section className="auth-card">
        <Brand />
        <h1 tabIndex={-1}>{t('selectOrg')}</h1>
        <p>{t('selectOrgBody')}</p>
        {notice && <p role="status">{notice}</p>}
        <div className="org-options">
          {options.map(m => (
            <button
              key={m.organization_id}
              onClick={() => {
                choose(m.organization_id, m.branch_id)
                navigate('/app/overview', { replace: true })
              }}
            >
              <strong>{m.organization_name ?? m.name}</strong>
              <span>{t(`role_${m.role}`)} · {m.branch_name || 'Main Shop'}</span>
            </button>
          ))}
        </div>
        <div className="actions">
          <Link className="button-link primary" to="/register-organization">
            + Register Shop / Workshop
          </Link>
          <button onClick={() => signOut()}>{t('signOut')}</button>
        </div>
      </section>
    </main>
  )
}

export function NoOrganization() {
  const navigate = useNavigate()
  const { reload, notice } = useTenant()
  const { signOut } = useAuth()
  return (
    <main className="selection-page">
      <section className="auth-card">
        <Brand />
        <h1 tabIndex={-1}>{t('noOrg')}</h1>
        <p>{t('noOrgBody')}</p>
        {notice && <p role="status">{notice}</p>}
        <button className="primary" onClick={() => navigate('/register-organization')}>
          {t('registerBusiness')}
        </button>
        <div className="actions">
          <button className="primary" onClick={reload}>
            {t('checkAgain')}
          </button>
          <button onClick={() => signOut()}>{t('signOut')}</button>
        </div>
      </section>
    </main>
  )
}

export function BranchSwitcher({ compact = false }) {
  const { data, choose } = useTenant()
  const { activeBranchId, setActiveBranch, branches } = useWorkspace()
  const { context, memberships } = data
  const organizations = [...new Map(memberships.map(m => [m.organization_id, m.organization_name])).entries()]

  const orgBranchesFromMemberships = memberships
    .filter(m => m.organization_id === context.organization_id && m.branch_id)
    .map(m => ({ id: m.branch_id, name: m.branch_name || m.branch_id, area: m.area || 'Kenya' }))
  const visibleBranches = orgBranchesFromMemberships.length
    ? orgBranchesFromMemberships
    : branches.filter(b => !b.organizationId || b.organizationId === context.organization_id)
  const effectiveBranches = visibleBranches.length ? visibleBranches : branches
  const currentBranch = effectiveBranches.some(b => b.id === activeBranchId)
    ? activeBranchId
    : effectiveBranches.some(b => b.id === context.branch_id)
      ? context.branch_id
      : effectiveBranches[0]?.id || 'branch-cbd'

  return (
    <div className={compact ? 'tenant-switcher compact' : 'tenant-switcher'} id="tenant-switcher">
      <label>
        <span className={compact ? 'sr-label' : ''}>{t('organization')}</span>
        <select
          aria-label={t('organization')}
          value={context.organization_id}
          onChange={e => {
            const nextOrg = e.target.value
            const firstBranch = memberships.find(m => m.organization_id === nextOrg)?.branch_id || null
            choose(nextOrg, firstBranch)
            if (firstBranch) void setActiveBranch(firstBranch, nextOrg)
          }}
        >
          {organizations.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={compact ? 'sr-label' : ''}>{t('branch')}</span>
        <select
          aria-label={t('branch')}
          value={currentBranch}
          onChange={e => {
            const nextBranch = e.target.value
            choose(context.organization_id, nextBranch)
            void setActiveBranch(nextBranch, context.organization_id)
          }}
        >
          {effectiveBranches.map(b => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <Link className="btn-quiet button-link" to="/register-organization" title="Add or retain another shop or workshop">
        + Shop
      </Link>
    </div>
  )
}
