import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { useTenant } from '../tenancy/context.js'
import { getBranchesForOrganization, useWorkspace } from '../lib/workspaceContext.js'
import { formatMoney } from '../lib/format.js'
import { blindStockProjection, classifyStockVelocity } from '../lib/kmsDomain.js'
import {
  PLAN_ENTITLEMENTS,
  ROLE_APPROVAL_LIMITS,
  ROLE_TEAM_DESCRIPTIONS,
  canAccessNavItem,
  evaluateOnboardingChecklist,
  evaluateOpsAlertRules,
} from '../lib/platformGovernance.js'
import { packageEncryptedBackup } from '../lib/offlineVault.js'
import { buildPlatformHealthReport } from '../lib/reportingEngine.js'

const VALID_NETWORK_TABS = ['governance', 'email', 'health', 'marketplace', 'support']

export default function Network() {
  const { session } = useAuth()
  const { data: { context, memberships = [] } } = useTenant()
  const {
    inventory = [],
    sales = [],
    drawerShifts = [],
    locations = [],
    auditLogs = [],
    branches = [],
    addOrUpdateBranch,
    staffMembers = [],
    addOrUpdateStaffMember,
    devices = [],
    enrollDevice,
    revokeDevice,
    tenantSettings = {},
    updateTenantSettings,
    apiKeys = [],
    createApiKey,
    revokeApiKey,
    trainingMode,
    setTrainingMode,
    supportTickets = [],
    createSupportTicket,
    resolveSupportTicket,
    exportWorkspaceBackup,
    verifyBackupPayload,
    runBackupRestoreDrill,
    postOpeningCutoverJournal,
    activeBranchId,
    outbox = [],
    outboxConflicts = [],
    etimsInvoices = [],
    notifications = [],
    journalEntries = [],
    featureFlags = {},
    toggleFeatureFlag,
    notificationPrefs = {},
    toggleNotificationPref,
    appendAuditLog,
  } = useWorkspace()

  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const defaultTab = canAccessNavItem(context.role, 'network') ? 'governance' : 'support'
  const tab = VALID_NETWORK_TABS.includes(rawTab) ? rawTab : defaultTab
  const setTab = nextTab => {
    setSearchParams(nextTab === 'governance' ? {} : { tab: nextTab }, { replace: true })
  }
  const [govNotice, setGovNotice] = useState('')
  const [govError, setGovError] = useState('')
  const [emailStatus, setEmailStatus] = useState({ configured: false, provider: 'none' })
  const [serverMetrics, setServerMetrics] = useState(null)
  const [integrationRegistry, setIntegrationRegistry] = useState([])
  const [serverStaffAccounts, setServerStaffAccounts] = useState([])
  const [staffRoleChoice, setStaffRoleChoice] = useState('cashier')
  const [staffBusy, setStaffBusy] = useState(false)
  const [backupCheckResult, setBackupCheckResult] = useState(null)
  const [restoreDrillResult, setRestoreDrillResult] = useState(null)
  const [backupPassphrase, setBackupPassphrase] = useState('')
  const [toEmail, setToEmail] = useState(() => session?.user?.email || '')
  const [emailSubject, setEmailSubject] = useState(
    () => `${context.organization_name || 'Kenya Motor'} — Daily Spare Parts & Operations Summary`,
  )
  const [emailBody, setEmailBody] = useState(
    () =>
      `Hello,\n\nThis is a dispatch summary from ${context.organization_name || 'Kenya Motor'} inside Kenya Motorcycle Spare Parts Ecosystem.\n\nActive branch: ${context.branch_id || activeBranchId}\nTotal catalogue SKUs tracked: ${inventory.length}\n\nRegards,\n${session?.user?.displayName || 'Workspace Operator'}`,
  )
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailFeedback, setEmailFeedback] = useState('')
  const [emailError, setEmailError] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/email/status')
      .then(res => res.json())
      .then(data => {
        if (active && data) setEmailStatus(data)
      })
      .catch(() => {})
    fetch('/api/observability/metrics')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (active && data) setServerMetrics(data)
      })
      .catch(() => {})
    fetch('/api/integrations/registry')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (active && Array.isArray(data?.integrations)) setIntegrationRegistry(data.integrations)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    const orgQuery = context.organization_id ? `?organizationId=${encodeURIComponent(context.organization_id)}` : ''
    fetch(`/api/staff/accounts${orgQuery}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (active && Array.isArray(data?.staff)) {
          setServerStaffAccounts(data.staff)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [context.organization_id])

  const companyBranches = getBranchesForOrganization(context.organization_id, branches)
  const branchLookup = new Map(branches.map(b => [b.id, b]))
  const mergedCompanyStaff = [
    ...serverStaffAccounts,
    ...staffMembers.filter(
      st =>
        (!st.organizationId || st.organizationId === context.organization_id) &&
        !serverStaffAccounts.some(srv => srv.email.toLowerCase() === String(st.email || '').toLowerCase()),
    ),
  ]

  const targetBranchId = context.branch_id || activeBranchId
  const membershipMatch = memberships.find(
    m => m.organization_id === context.organization_id && (!targetBranchId || m.branch_id === targetBranchId),
  )
  const activeBranch =
    branches.find(b => b.id === targetBranchId) ||
    (membershipMatch
      ? { id: membershipMatch.branch_id, name: membershipMatch.branch_name, area: membershipMatch.area || 'Kenya' }
      : branches[0])

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

  const activeOpsAlerts = evaluateOpsAlertRules({
    outbox,
    outboxConflicts,
    etimsInvoices,
    serverMetrics,
  })

  const onboardingStatus = evaluateOnboardingChecklist({
    tenantSettings,
    branches,
    locations,
    devices,
    staffMembers,
    inventory,
    sales,
    drawerShifts,
  })
  const activePlanTier = PLAN_ENTITLEMENTS[tenantSettings.planTier] || PLAN_ENTITLEMENTS.Growth

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
    a.download = 'kenya-motorcycle-spares-demand-forecast.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleSendEmail(event) {
    event.preventDefault()
    setEmailBusy(true)
    setEmailFeedback('')
    setEmailError('')
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toEmail.trim(),
          subject: emailSubject.trim(),
          text: emailBody,
          companyName: context.organization_name || 'Kenya Motorcycle Spare Parts General',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.detail || 'Could not deliver email.')
      }
      setEmailFeedback(`Email delivered to ${data.to} via ${data.provider}${data.messageId ? ` (ID: ${data.messageId})` : ''}.`)
      void appendAuditLog?.('EMAIL_DISPATCH', 'Mail Delivery', `Sent email "${emailSubject.trim()}" to ${data.to}`)
    } catch (err) {
      setEmailError(err?.message || 'Email delivery failed.')
    } finally {
      setEmailBusy(false)
    }
  }

  function handleSaveTenantSettings(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    updateTenantSettings({
      businessName: form.get('businessName'),
      phone: form.get('phone'),
      locationArea: form.get('locationArea'),
      receiptPrefix: form.get('receiptPrefix'),
      fiscalYearStart: form.get('fiscalYearStart'),
      operatingHours: form.get('operatingHours'),
      offlineSaleCapKes: Number(form.get('offlineSaleCapKes') || 50000),
      planTier: form.get('planTier') || 'Growth',
      tenantStatus: form.get('tenantStatus'),
    })
    setGovNotice('Workspace & business settings saved and audited.')
  }

  function handleSaveBranch(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const saved = addOrUpdateBranch({
      name: form.get('name'),
      area: form.get('area'),
      status: form.get('status'),
    })
    event.currentTarget.reset()
    setGovNotice(`Saved branch ${saved.name} (${saved.status}).`)
  }

  async function handleSaveStaff(event) {
    event.preventDefault()
    setGovError('')
    setGovNotice('')
    const formEl = event.currentTarget
    const form = new FormData(formEl)
    const name = String(form.get('name') || '').trim()
    const username = String(form.get('username') || '').trim().toLowerCase()
    const email = String(form.get('email') || '').trim().toLowerCase()
    const password = String(form.get('password') || '')
    const role = String(form.get('role') || 'cashier')
    const branchId = String(form.get('branchId') || activeBranchId)
    const branchObj = branchLookup.get(branchId) || companyBranches[0]

    if (password.length < 6) {
      setGovError('Staff password must be at least 6 characters.')
      return
    }

    setStaffBusy(true)
    try {
      const res = await fetch('/api/staff/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          username,
          email,
          password,
          role,
          organizationId: context.organization_id,
          organizationName: context.organization_name,
          branchId: branchObj?.id || branchId,
          branchName: branchObj?.name || 'Main Shop',
          area: branchObj?.area || 'Kenya',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.detail || 'Could not provision staff account.')
      }

      const created = data.staff
      setServerStaffAccounts(prev => [created, ...prev.filter(s => s.email !== created.email)])
      addOrUpdateStaffMember({
        id: created.id,
        name: created.name,
        email: created.email,
        role: created.role,
        branchId: created.branchId,
        status: 'Active',
      })
      void appendAuditLog?.(
        'STAFF_ACCOUNT_CREATED',
        'Governance',
        `Owner created ${created.role} login (${created.email} / @${created.username}) for ${context.organization_name}`,
      )
      formEl.reset()
      setStaffRoleChoice('cashier')
      setGovNotice(
        `Created ${created.role.toUpperCase()} credentials for ${created.name} inside ${context.organization_name}. They can sign in with ${created.email} or username "${created.username}".`,
      )
    } catch (err) {
      setGovError(err?.message || 'Could not create staff login credentials.')
    } finally {
      setStaffBusy(false)
    }
  }

  async function handleToggleStaffStatus(staffRow) {
    const nextStatus = staffRow.status === 'Active' ? 'Deactivated' : 'Active'
    setGovError('')
    setGovNotice('')
    try {
      const hasServerCredential = serverStaffAccounts.some(s => s.email === staffRow.email)
      if (hasServerCredential && staffRow.email) {
        const res = await fetch(`/api/staff/accounts/${encodeURIComponent(staffRow.email)}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.detail || 'Could not update staff login status.')
        }
        setServerStaffAccounts(prev => prev.map(s => (s.email === staffRow.email ? data.staff : s)))
      }
      addOrUpdateStaffMember({
        ...staffRow,
        status: nextStatus,
      })
      setGovNotice(`${staffRow.name} (${staffRow.email}) is now ${nextStatus}.`)
    } catch (err) {
      setGovError(err?.message || 'Failed to update staff status.')
    }
  }

  async function handleEnrollDevice(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const dev = await enrollDevice({
      deviceName: form.get('deviceName'),
      capabilities: form.get('capabilities'),
      branchId: form.get('branchId') || activeBranchId,
    })
    event.currentTarget.reset()
    setGovNotice(`Enrolled POS terminal ${dev?.deviceName || 'Device'}.`)
  }

  function handleIssueApiKey(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const issued = createApiKey(form.get('label'), form.get('scope'))
    event.currentTarget.reset()
    setGovNotice(`Issued Partner API key ${issued.maskedPrefix} (${issued.scope}).`)
  }

  function handleDownloadAndVerifyBackup() {
    setGovError('')
    const { snapshot, counts } = exportWorkspaceBackup()
    const check = verifyBackupPayload(snapshot)
    setBackupCheckResult({ ...check, counts })
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kmsp-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleDownloadEncryptedBackup() {
    setGovError('')
    if (backupPassphrase.trim().length < 4) {
      setGovError('Enter a backup passphrase of at least 4 characters to encrypt (.kmsbak).')
      return
    }
    try {
      const { snapshot } = exportWorkspaceBackup()
      const envelope = await packageEncryptedBackup(snapshot, backupPassphrase.trim())
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kmsp-encrypted-backup-${new Date().toISOString().slice(0, 10)}.kmsbak`
      a.click()
      URL.revokeObjectURL(url)
      setGovNotice(`Downloaded AES-256-GCM encrypted backup (SHA-256 ${envelope.sha256.slice(0, 12)}…).`)
    } catch (err) {
      setGovError(err?.message || 'Failed to package encrypted backup.')
    }
  }

  function handleRunRestoreDrill() {
    setGovError('')
    const drill = runBackupRestoreDrill()
    setRestoreDrillResult(drill)
    setGovNotice(
      drill.valid
        ? `Non-destructive restore drill passed: ${drill.balancedJournals}/${drill.totalJournals} balanced journals, 0 orphan movements.`
        : `Restore drill completed with ${drill.errors.length} warning(s).`,
    )
  }

  async function handlePostOpeningCutover(event) {
    event.preventDefault()
    setGovError('')
    setGovNotice('')
    const form = new FormData(event.currentTarget)
    try {
      const je = await postOpeningCutoverJournal({
        openingCashKes: form.get('openingCashKes'),
        openingInventoryValueKes: form.get('openingInventoryValueKes'),
        openingArKes: form.get('openingArKes'),
        openingApKes: form.get('openingApKes'),
      })
      event.currentTarget.reset()
      setGovNotice(`Posted balanced opening cutover journal ${je?.entryNumber || ''} (${formatMoney(je?.totalDebit || 0)}).`)
    } catch (err) {
      setGovError(err?.message || 'Opening balance cutover failed.')
    }
  }

  async function handleCreateTicket(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    await createSupportTicket({
      subject: form.get('subject'),
      category: form.get('category'),
      priority: form.get('priority'),
      description: form.get('description'),
    })
    event.currentTarget.reset()
    setGovNotice('Support ticket logged to workspace queue.')
  }

  return (
    <div className="stacked-pages">
      <section className="card">
        <div className="card-head wrap-head">
          <div>
            <p className="eyebrow">Tenant Governance, Staff &amp; Devices, Mail, Observability &amp; Support</p>
            <h2>Network &amp; Platform Governance</h2>
          </div>
          <div className="tab-strip" role="tablist" aria-label="Network and governance tabs">
            {[
              ...(canAccessNavItem(context.role, 'network')
                ? [
                    ['governance', 'Tenant, Staff & Devices'],
                    ['email', 'Email & Mail Delivery'],
                    ['marketplace', `Blind Catalogue & Forecast (${blindCatalogue.length})`],
                  ]
                : []),
              ...(canAccessNavItem(context.role, 'network_health')
                ? [['health', `Observability, Keys & Backups (${auditLogs.length})`]]
                : []),
              ...(canAccessNavItem(context.role, 'network_support')
                ? [['support', `Support & Sandbox (${supportTickets.filter(t => t.status === 'Open').length})`]]
                : []),
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
        {govNotice && <p className="notice mt-md" role="status">{govNotice}</p>}
        {govError && <p className="form-error mt-md" role="alert">{govError}</p>}
      </section>

      {tab === 'governance' && (
        <div className="stacked-pages">
          <div className="dashboard-grid">
            <section className="card">
              <h2>Tenant Profile &amp; Workspace Settings (PLT-002 / IDN-011)</h2>
              <p className="muted">Configure legal shop profile, receipt prefix, fiscal year start, offline cap, and tenant status.</p>
              <form className="auth-form mt-md" onSubmit={handleSaveTenantSettings}>
                <div className="form-grid">
                  <label>
                    Business Name
                    <input name="businessName" defaultValue={tenantSettings.businessName || context.organization_name || 'Kenya Motor'} required />
                  </label>
                  <label>
                    Support Phone
                    <input name="phone" defaultValue={tenantSettings.phone || '+254 712 340 500'} />
                  </label>
                  <label>
                    Primary Hub / Area
                    <input name="locationArea" defaultValue={tenantSettings.locationArea || 'Kirinyaga Road, Nairobi CBD'} />
                  </label>
                  <label>
                    Receipt Prefix
                    <input name="receiptPrefix" defaultValue={tenantSettings.receiptPrefix || 'KMSP'} />
                  </label>
                  <label>
                    Fiscal Year Start (MM-DD)
                    <input name="fiscalYearStart" defaultValue={tenantSettings.fiscalYearStart || '07-01'} />
                  </label>
                  <label>
                    Operating Hours
                    <input name="operatingHours" defaultValue={tenantSettings.operatingHours || 'Mon-Sat 08:00-18:30 EAT'} />
                  </label>
                  <label>
                    Offline Sale Cap (KES)
                    <input name="offlineSaleCapKes" type="number" min="1000" defaultValue={tenantSettings.offlineSaleCapKes || 50000} />
                  </label>
                  <label>
                    Subscription Plan Tier (PLT-005 / PLT-006)
                    <select name="planTier" defaultValue={tenantSettings.planTier || 'Growth'}>
                      <option value="Starter">Starter (1 Branch · 2 Devices)</option>
                      <option value="Growth">Growth (5 Branches · 12 Devices)</option>
                      <option value="Enterprise">Enterprise (50 Branches · Unlimited Modules)</option>
                    </select>
                  </label>
                  <label>
                    Tenant Lifecycle Status (ADM-001)
                    <select name="tenantStatus" defaultValue={tenantSettings.tenantStatus || 'Active'}>
                      <option value="Active">Active</option>
                      <option value="Suspended">Suspended (Read-Only Guard)</option>
                    </select>
                  </label>
                </div>
                <button className="primary" type="submit">Save Workspace Settings</button>
              </form>
            </section>

            <section className="card">
              <h2>Tenant Feature Flags (PLT-007) &amp; Notifications (NTF-008)</h2>
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

              <h3 className="section-subheading">Notification Channel Preferences</h3>
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
          </div>

          <div className="dashboard-grid">
            <section className="card">
              <h2>Branches &amp; Godowns (PLT-003)</h2>
              <div className="saas-table-wrap">
                <table className="saas-table">
                  <thead>
                    <tr>
                      <th>Branch Name</th>
                      <th>Area</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branches.map(b => (
                      <tr key={b.id}>
                        <td className="cell-title">{b.name}</td>
                        <td>{b.area}</td>
                        <td><span className="status-tag ok">{b.status || 'Active'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form className="inventory-form" onSubmit={handleSaveBranch}>
                <h3>Add Branch / Godown</h3>
                <div className="form-grid">
                  <label>Branch Name<input name="name" required placeholder="Gikomba Wholesale Annex" /></label>
                  <label>Area / Road<input name="area" required placeholder="Kamukunji, Nairobi" /></label>
                  <label>
                    Status
                    <select name="status" defaultValue="Active">
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </label>
                </div>
                <button className="primary" type="submit">Add Branch</button>
              </form>
            </section>

            <section className="card">
              <div className="card-head wrap-head">
                <div>
                  <h2>Staff Credentials &amp; Role Access ({context.organization_name})</h2>
                  <p className="muted">
                    Create staff login credentials locked to <strong>{context.organization_name}</strong> and their team role.
                  </p>
                </div>
                <span className="status-tag ok">{mergedCompanyStaff.length} Staff</span>
              </div>

              <div className="saas-table-wrap">
                <table className="saas-table">
                  <thead>
                    <tr>
                      <th>Staff &amp; Username</th>
                      <th>Team Role</th>
                      <th>Branch</th>
                      <th>Login Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mergedCompanyStaff.map(st => {
                      const bName = branchLookup.get(st.branchId)?.name || st.branchId
                      return (
                        <tr key={st.id || st.email}>
                          <td>
                            <span className="cell-title">{st.name}</span>
                            <span className="cell-sub">{st.email}{st.username ? ` · @${st.username}` : ''}</span>
                          </td>
                          <td>{String(st.role).toUpperCase()}</td>
                          <td>{bName}</td>
                          <td>
                            <button
                              type="button"
                              className={st.status === 'Active' ? 'status-tag ok' : 'status-tag danger'}
                              onClick={() => void handleToggleStaffStatus(st)}
                            >
                              {st.status || 'Active'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <form className="inventory-form" onSubmit={e => void handleSaveStaff(e)}>
                <h3>Create Staff Account &amp; Credentials</h3>
                <div className="form-grid">
                  <label>Full Name<input name="name" required placeholder="Mercy Wanjiku" disabled={staffBusy} /></label>
                  <label>Username<input name="username" required minLength={2} placeholder="mercy.cbd" disabled={staffBusy} /></label>
                  <label>Email<input name="email" type="email" required placeholder="mercy@kenyamoto.co.ke" disabled={staffBusy} /></label>
                  <label>Login Password<input name="password" type="password" required minLength={6} placeholder="Min 6 characters" disabled={staffBusy} /></label>
                  <label>
                    Team Role
                    <select
                      name="role"
                      value={staffRoleChoice}
                      onChange={e => setStaffRoleChoice(e.target.value)}
                      disabled={staffBusy}
                    >
                      <option value="cashier">Cashier · Counter Sales Team</option>
                      <option value="storekeeper">Storekeeper · Stock &amp; Supply Team</option>
                      <option value="accountant">Accountant · Finance &amp; Audit Team</option>
                      <option value="manager">Branch Manager · Operations Team</option>
                      <option value="owner">Co-Owner · Full Company Control</option>
                    </select>
                  </label>
                  <label>
                    Assigned Branch ({context.organization_name})
                    <select name="branchId" defaultValue={companyBranches[0]?.id || activeBranchId} disabled={staffBusy}>
                      {companyBranches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="notice" role="note">
                  {ROLE_TEAM_DESCRIPTIONS[staffRoleChoice] || ROLE_TEAM_DESCRIPTIONS.cashier}
                </p>
                <button className="primary" type="submit" disabled={staffBusy}>
                  {staffBusy ? 'Creating Staff Login…' : 'Create Staff Account & Credentials'}
                </button>
              </form>
            </section>
          </div>

          <div className="dashboard-grid">
            <section className="card">
              <h2>Trusted POS Devices &amp; Remote Wipe (IDN-005 / IDN-006)</h2>
              <p className="muted">Revoking a terminal blocks POS checkout and forces outbox conflict inspection on next sync.</p>
              <div className="saas-table-wrap">
                <table className="saas-table">
                  <thead>
                    <tr>
                      <th>Device &amp; ID</th>
                      <th>Capabilities</th>
                      <th>Status</th>
                      <th className="num">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map(dev => (
                      <tr key={dev.id}>
                        <td>
                          <span className="cell-title">{dev.deviceName}</span>
                          <span className="cell-sub mono">{dev.id} · {dev.branchId}</span>
                        </td>
                        <td>{dev.capabilities}</td>
                        <td>
                          <span className={dev.status === 'Active' ? 'status-tag ok' : 'status-tag danger'}>
                            {dev.status}{dev.wipePending ? ' (Wipe Pending)' : ''}
                          </span>
                        </td>
                        <td className="num">
                          {dev.status === 'Active' ? (
                            <button type="button" className="btn-sm" onClick={() => void revokeDevice(dev.id)}>
                              Revoke &amp; Wipe
                            </button>
                          ) : (
                            <span className="muted">Revoked</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <form className="inventory-form" onSubmit={e => void handleEnrollDevice(e)}>
                <h3>Enroll Counter Terminal</h3>
                <div className="form-grid">
                  <label>Device Name<input name="deviceName" required placeholder="Counter Tablet #2" /></label>
                  <label>Capabilities<input name="capabilities" defaultValue="Barcode Scanner, 80mm Thermal Printer, Offline POS" /></label>
                </div>
                <button className="primary" type="submit">Enroll POS Device</button>
              </form>
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

          <div className="dashboard-grid">
            <section className="card">
              <h2>Plan Entitlements &amp; Quota Usage (PLT-005 / PLT-006)</h2>
              <p className="muted">
                Active tier: <strong>{activePlanTier.tier}</strong> (Billing provider webhook unprovisioned; workspace quota preview active).
              </p>
              <div className="stats-grid mt-md">
                <div className="stat-card">
                  <p>Branches Used</p>
                  <h3>{branches.length} / {activePlanTier.maxBranches}</h3>
                </div>
                <div className="stat-card">
                  <p>Enrolled Devices</p>
                  <h3>{devices.filter(d => d.status === 'Active').length} / {activePlanTier.maxDevices}</h3>
                </div>
              </div>
              <p className="muted mt-sm">
                Entitled modules: <span className="mono">{activePlanTier.modules.join(', ')}</span>
              </p>
            </section>

            <section className="card">
              <h2>Opening Balance GL Cutover Importer (PLT-010)</h2>
              <p className="muted">
                Post balanced opening Cash, Inventory Asset, AR, and AP balances to Account 3000 Opening Equity during shop onboarding.
              </p>
              <form className="auth-form mt-md" onSubmit={e => void handlePostOpeningCutover(e)}>
                <div className="form-grid">
                  <label>Opening Cash &amp; Till (KES)<input name="openingCashKes" type="number" min="0" step="0.01" defaultValue="25000" /></label>
                  <label>Opening Inventory Value (KES)<input name="openingInventoryValueKes" type="number" min="0" step="0.01" defaultValue="150000" /></label>
                  <label>Opening Accounts Receivable (KES)<input name="openingArKes" type="number" min="0" step="0.01" defaultValue="0" /></label>
                  <label>Opening Accounts Payable (KES)<input name="openingApKes" type="number" min="0" step="0.01" defaultValue="0" /></label>
                </div>
                <button className="primary" type="submit">Post Balanced Cutover Journal</button>
              </form>
            </section>
          </div>
        </div>
      )}

      {tab === 'email' && (
        <section className="card">
          <div className="card-head wrap-head">
            <div>
              <h2>Direct Email &amp; Receipt Dispatch</h2>
              <p className="muted">
                Send operational summaries, purchase order confirmations, or verification tests straight to your mailbox.
              </p>
            </div>
            <span className={emailStatus.configured ? 'status-tag ok' : 'status-tag warn'}>
              {emailStatus.configured ? `Mailer Active (${emailStatus.provider.toUpperCase()})` : 'Mailer Secrets Required'}
            </span>
          </div>

          {!emailStatus.configured && (
            <p className="notice" role="status">
              To deliver real emails to your inbox, configure either Gmail/SMTP secrets (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) or `RESEND_API_KEY` in Settings &gt; Secrets. Firebase and Supabase verification/reset emails also use their built-in project mailers automatically.
            </p>
          )}

          {emailFeedback && <p className="notice" role="status">{emailFeedback}</p>}
          {emailError && <p className="form-error" role="alert">{emailError}</p>}

          <form onSubmit={handleSendEmail} className="auth-form">
            <div className="form-grid">
              <label>
                Recipient Email
                <input
                  type="email"
                  value={toEmail}
                  onChange={e => setToEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  required
                  disabled={emailBusy}
                />
              </label>
              <label>
                Subject
                <input
                  type="text"
                  value={emailSubject}
                  onChange={e => setEmailSubject(e.target.value)}
                  required
                  disabled={emailBusy}
                />
              </label>
            </div>
            <label>
              Message Body
              <textarea
                rows={5}
                value={emailBody}
                onChange={e => setEmailBody(e.target.value)}
                required
                disabled={emailBusy}
              />
            </label>
            <div className="actions-inline">
              <button type="submit" className="primary" disabled={emailBusy}>
                {emailBusy ? 'Sending Email…' : 'Send Email to Inbox'}
              </button>
            </div>
          </form>
        </section>
      )}

      {tab === 'health' && (
        <div className="stacked-pages">
          <section className="card">
            <h2>Platform Observability &amp; Alert Rules (OPS-001 – OPS-004 / RPT-014)</h2>
            <div className="stats-grid">
              <div className="stat-card"><p>Balanced Journals</p><h3>{health.balancedJournalRatio}</h3></div>
              <div className="stat-card"><p>Outbox / Conflicts</p><h3>{health.offlineOutboxPending} / {outboxConflicts.length}</h3></div>
              <div className="stat-card"><p>API p95 Latency</p><h3>{serverMetrics ? `${serverMetrics.p95LatencyMs} ms` : '—'}</h3></div>
              <div className="stat-card">
                <p>HTTP 4xx / 5xx / 429</p>
                <h3>{serverMetrics ? `${serverMetrics.errors4xx} / ${serverMetrics.errors5xx} / ${serverMetrics.rateLimited429}` : '—'}</h3>
              </div>
            </div>

            {activeOpsAlerts.length === 0 ? (
              <p className="notice mt-md">All observability thresholds healthy (outbox backlog &lt; 5, 0 conflicts, 5xx &le; 1%, p95 &le; 2000ms).</p>
            ) : (
              <div className="po-list mt-md">
                {activeOpsAlerts.map(al => (
                  <div className="sub-card" key={al.id}>
                    <strong>{al.rule}</strong>
                    <p className="form-error">{al.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="dashboard-grid">
            <section className="card">
              <h2>Partner API Keys &amp; Scopes (INT-013)</h2>
              <div className="saas-table-wrap">
                <table className="saas-table">
                  <thead>
                    <tr>
                      <th>Label &amp; Prefix</th>
                      <th>Scope</th>
                      <th>Status</th>
                      <th className="num">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiKeys.map(k => (
                      <tr key={k.id}>
                        <td>
                          <span className="cell-title">{k.label}</span>
                          <span className="cell-sub mono">{k.maskedPrefix}</span>
                        </td>
                        <td className="mono">{k.scope}</td>
                        <td><span className={k.status === 'Active' ? 'status-tag ok' : 'status-tag danger'}>{k.status}</span></td>
                        <td className="num">
                          {k.status === 'Active' && (
                            <button type="button" className="btn-sm" onClick={() => revokeApiKey(k.id)}>Revoke</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <form className="inventory-form" onSubmit={handleIssueApiKey}>
                <h3>Issue Partner API Key</h3>
                <div className="form-grid">
                  <label>Key Label<input name="label" required placeholder="KRA Integrator / Wholesale Feed" /></label>
                  <label>
                    Scope
                    <select name="scope" defaultValue="inventory:read">
                      <option value="inventory:read">inventory:read</option>
                      <option value="orders:write">orders:write</option>
                      <option value="reports:read">reports:read</option>
                    </select>
                  </label>
                </div>
                <button className="primary" type="submit">Generate Masked Key</button>
              </form>
            </section>

            <section className="card">
              <h2>Workspace Backup Export &amp; Restore Drill (PLT-014)</h2>
              <p className="muted">
                Export plaintext JSON or AES-256-GCM encrypted `.kmsbak` snapshots and run non-destructive ledger + SKU integrity drills.
              </p>
              <div className="form-grid mt-sm">
                <label>
                  Encryption Passphrase (for .kmsbak)
                  <input
                    type="password"
                    value={backupPassphrase}
                    onChange={e => setBackupPassphrase(e.target.value)}
                    placeholder="Min 4 chars for AES-256-GCM"
                  />
                </label>
              </div>
              <div className="inline-controls mt-md">
                <button type="button" className="primary" onClick={handleDownloadAndVerifyBackup}>
                  Export &amp; Verify JSON
                </button>
                <button type="button" onClick={() => void handleDownloadEncryptedBackup()}>
                  Export Encrypted (.kmsbak)
                </button>
                <button type="button" onClick={handleRunRestoreDrill}>
                  Run Non-Destructive Restore Drill
                </button>
              </div>
              {backupCheckResult && (
                <div className="sub-card mt-md">
                  <strong>{backupCheckResult.valid ? 'Backup Integrity Verified' : 'Integrity Warning'}</strong>
                  <p className="muted">
                    Balanced Journals: {backupCheckResult.balancedJournals}/{backupCheckResult.totalJournals} ·
                    SKUs: {backupCheckResult.skuCount} · Movements: {backupCheckResult.movementCount}
                  </p>
                </div>
              )}
              {restoreDrillResult && (
                <div className="sub-card mt-sm">
                  <strong>{restoreDrillResult.valid ? 'Restore Drill PASSED' : 'Restore Drill Flagged Warnings'}</strong>
                  <p className="muted">
                    Balanced Journals: {restoreDrillResult.balancedJournals}/{restoreDrillResult.totalJournals} ·
                    Orphan Movements: {restoreDrillResult.orphanMovementCount} · Valuation:{' '}
                    {formatMoney(restoreDrillResult.stockValuationKes)}
                  </p>
                </div>
              )}
            </section>
          </div>

          <section className="card">
            <div className="card-head wrap-head">
              <div>
                <h2>Server Integration Registry (INT-001)</h2>
                <p className="muted">Live readiness inspection across AI, email, WhatsApp, SMS, storage buckets, and Postgres endpoints.</p>
              </div>
              <span className="status-tag muted">
                {integrationRegistry.filter(i => i.configured).length}/{integrationRegistry.length || 7} Configured
              </span>
            </div>
            <div className="saas-table-wrap mt-sm">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th>Integration</th>
                    <th>Category</th>
                    <th>Endpoint / Target</th>
                    <th>Required Env Secrets</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {integrationRegistry.map(item => (
                    <tr key={item.id}>
                      <td className="cell-title">{item.name}</td>
                      <td>{item.category}</td>
                      <td className="mono">{item.endpoint}</td>
                      <td className="mono">{(item.requiredSecrets || []).join(', ')}</td>
                      <td>
                        <span className={item.configured ? 'status-tag ok' : 'status-tag warn'}>
                          {item.configured ? 'Configured' : 'Secrets Missing'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

      {tab === 'support' && (
        <div className="stacked-pages">
          <div className="dashboard-grid">
            <section className="card">
              <h2>Training / Sandbox Mode &amp; Onboarding (ADM-004 / ADM-005)</h2>
              <p className="muted">Enable Sandbox Mode before staff training so practice actions are flagged cleanly in the workspace header.</p>
              <div className="switch-row mt-md">
                <span>Training / Sandbox Environment</span>
                <button
                  type="button"
                  className={trainingMode ? 'status-tag warn' : 'status-tag ok'}
                  onClick={() => {
                    setTrainingMode(!trainingMode)
                    void appendAuditLog('TRAINING_MODE_TOGGLED', 'Admin', `Sandbox mode -> ${!trainingMode ? 'ENABLED' : 'PRODUCTION'}`)
                  }}
                >
                  {trainingMode ? 'SANDBOX ON' : 'PRODUCTION'}
                </button>
              </div>

              <div className="card-head wrap-head mt-md">
                <h3 className="section-subheading">Live Branch Onboarding Checklist</h3>
                <span className={onboardingStatus.readinessPct === 100 ? 'status-tag ok' : 'status-tag warn'}>
                  {onboardingStatus.completedCount}/{onboardingStatus.totalCount} Ready ({onboardingStatus.readinessPct}%)
                </span>
              </div>
              <ul className="draft-list mt-sm">
                {onboardingStatus.steps.map(step => (
                  <li key={step.id}>
                    <span>{step.label}</span>
                    {step.completed ? (
                      <span className="status-tag ok">Done</span>
                    ) : (
                      <Link className="status-tag warn" to={step.route}>Complete Step →</Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="card">
              <h2>In-App Help &amp; Operator FAQ (ADM-003)</h2>
              <div className="po-list mt-sm">
                <div className="sub-card">
                  <strong>How does Offline POS Outbox work?</strong>
                  <p className="muted">Sales queued while offline record a unique idempotencyKey and device sequence. When online, stock shortages, revoked devices, or price drifts move automatically to the POS Conflict Queue.</p>
                </div>
                <div className="sub-card">
                  <strong>Why are Journals &amp; Stock Movements read-only?</strong>
                  <p className="muted">Every sale, expense, return, and GRN auto-posts balanced double-entry accounting entries (Debit == Credit). Corrections use reversing entries only for KRA audit safety.</p>
                </div>
                <div className="sub-card">
                  <strong>How is Separation of Duties enforced?</strong>
                  <p className="muted">Staff who stage customer returns or request discount overrides cannot self-approve them unless signed in as the Account Owner (BR-002).</p>
                </div>
              </div>
            </section>
          </div>

          <section className="card">
            <h2>Support Ticketing &amp; Issue Tracker (ADM-002)</h2>
            <div className="po-list">
              {supportTickets.map(tkt => (
                <article className="sub-card" key={tkt.id}>
                  <div className="card-head wrap-head">
                    <div>
                      <strong>{tkt.subject}</strong>
                      <p className="muted">{tkt.category} · Priority: {tkt.priority} · {tkt.description}</p>
                    </div>
                    <div className="inline-controls">
                      <span className={tkt.status === 'Resolved' ? 'status-tag ok' : 'status-tag warn'}>{tkt.status}</span>
                      {tkt.status === 'Open' && (
                        <button type="button" className="btn-sm" onClick={() => void resolveSupportTicket(tkt.id, 'Resolved')}>
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <form className="inventory-form" onSubmit={e => void handleCreateTicket(e)}>
              <h3>Log New Support Ticket</h3>
              <div className="form-grid">
                <label>Subject<input name="subject" required placeholder="Thermal printer paper calibration or eTIMS CUIN check" /></label>
                <label>
                  Category
                  <select name="category" defaultValue="Operations">
                    <option value="Operations">Counter Operations</option>
                    <option value="Accounting">Ledger &amp; eTIMS</option>
                    <option value="Hardware">Scanner &amp; Thermal Printer</option>
                    <option value="Sync">Offline Sync</option>
                  </select>
                </label>
                <label>
                  Priority
                  <select name="priority" defaultValue="Normal">
                    <option value="Low">Low</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                  </select>
                </label>
                <label>Description<input name="description" required placeholder="Describe branch device or workflow issue" /></label>
              </div>
              <button className="primary" type="submit">Submit Support Ticket</button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}


