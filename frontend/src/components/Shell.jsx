import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { useTenant } from '../tenancy/context.js'
import { useWorkspace } from '../lib/workspaceContext.js'
import { BranchSwitcher } from '../tenancy/SelectionPages.jsx'
import { Brand } from './States.jsx'
import { getLanguage, setLanguage, t } from '../i18n/index.js'
import { formatMoney } from '../lib/format.js'

const NAV_SECTIONS = [
  {
    groupKey: 'navGroupOps',
    items: [
      { id: 'overview', to: '/app/overview', basePath: '/app/overview', tab: null, labelKey: 'overview', icon: 'overview' },
      { id: 'pos', to: '/app/pos', basePath: '/app/pos', tab: 'register', isDefaultTab: true, labelKey: 'pos', icon: 'pos' },
      { id: 'pos_returns', to: '/app/pos?tab=returns', basePath: '/app/pos', tab: 'returns', labelKey: 'posReturns', icon: 'returns' },
      { id: 'pos_shifts', to: '/app/pos?tab=shifts', basePath: '/app/pos', tab: 'shifts', labelKey: 'posShifts', icon: 'shifts' },
      { id: 'pos_customers', to: '/app/pos?tab=customers', basePath: '/app/pos', tab: 'customers', labelKey: 'posCustomers', icon: 'customers' },
      { id: 'dispatch', to: '/app/dispatch', basePath: '/app/dispatch', tab: null, labelKey: 'dispatch', icon: 'dispatch' },
    ],
  },
  {
    groupKey: 'navGroupSupply',
    items: [
      { id: 'inventory', to: '/app/inventory', basePath: '/app/inventory', tab: 'catalogue', isDefaultTab: true, labelKey: 'inventory', icon: 'inventory' },
      { id: 'inventory_locations', to: '/app/inventory?tab=locations', basePath: '/app/inventory', tab: 'locations', labelKey: 'inventoryLocations', icon: 'locations' },
      { id: 'inventory_reorder', to: '/app/inventory?tab=reorder', basePath: '/app/inventory', tab: 'reorder', labelKey: 'inventoryReorder', icon: 'reorder' },
      { id: 'inventory_procurement', to: '/app/inventory?tab=procurement', basePath: '/app/inventory', tab: 'procurement', labelKey: 'inventoryProcurement', icon: 'procurement' },
      { id: 'inventory_counts', to: '/app/inventory?tab=counts', basePath: '/app/inventory', tab: 'counts', labelKey: 'inventoryCounts', icon: 'counts' },
      { id: 'radar', to: '/app/radar', basePath: '/app/radar', tab: null, labelKey: 'radar', icon: 'radar' },
    ],
  },
  {
    groupKey: 'navGroupFinance',
    items: [
      { id: 'finance', to: '/app/finance', basePath: '/app/finance', tab: 'eod', isDefaultTab: true, labelKey: 'finance', icon: 'finance', requiresFinanceRole: true },
      { id: 'finance_ledger', to: '/app/finance?tab=ledger', basePath: '/app/finance', tab: 'ledger', labelKey: 'financeLedger', icon: 'ledger', requiresFinanceRole: true },
      { id: 'finance_reports', to: '/app/finance?tab=reports', basePath: '/app/finance', tab: 'reports', labelKey: 'financeReports', icon: 'reports', requiresFinanceRole: true },
      { id: 'assistant', to: '/app/assistant', basePath: '/app/assistant', tab: null, labelKey: 'assistant', icon: 'assistant' },
    ],
  },
  {
    groupKey: 'navGroupAdmin',
    items: [
      { id: 'network', to: '/app/network', basePath: '/app/network', tab: 'governance', isDefaultTab: true, labelKey: 'network', icon: 'network' },
      { id: 'network_health', to: '/app/network?tab=health', basePath: '/app/network', tab: 'health', labelKey: 'networkHealth', icon: 'health' },
      { id: 'network_support', to: '/app/network?tab=support', basePath: '/app/network', tab: 'support', labelKey: 'networkSupport', icon: 'support' },
    ],
  },
]

function isNavItemActive(item, pathname, search) {
  if (pathname !== item.basePath) return false
  const currentTab = new URLSearchParams(search || '').get('tab')
  if (!item.tab) return true
  if (!currentTab) return Boolean(item.isDefaultTab)
  return currentTab === item.tab
}

function NavIcon({ name }) {
  const props = {
    className: 'nav-icon',
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
  }
  switch (name) {
    case 'overview':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      )
    case 'pos':
      return (
        <svg {...props}>
          <rect x="2" y="4" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
          <path d="M6 14h4" />
        </svg>
      )
    case 'returns':
      return (
        <svg {...props}>
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      )
    case 'shifts':
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 13h18" />
          <path d="M10 16h4" />
        </svg>
      )
    case 'customers':
      return (
        <svg {...props}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'dispatch':
      return (
        <svg {...props}>
          <path d="M10 17h4V5H2v12h3" />
          <path d="M14 9h4l4 4v4h-3" />
          <circle cx="7.5" cy="17.5" r="2.5" />
          <circle cx="17.5" cy="17.5" r="2.5" />
        </svg>
      )
    case 'inventory':
      return (
        <svg {...props}>
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      )
    case 'locations':
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10a8 8 0 1 0-16 0c0 6 8 10 8 10Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'reorder':
      return (
        <svg {...props}>
          <path d="m21 16-4 4-4-4" />
          <path d="M17 20V4" />
          <path d="m3 8 4-4 4 4" />
          <path d="M7 4v16" />
        </svg>
      )
    case 'procurement':
      return (
        <svg {...props}>
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <path d="M9 12h6" />
          <path d="M9 16h6" />
        </svg>
      )
    case 'counts':
      return (
        <svg {...props}>
          <path d="m9 11 3 3L22 4" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      )
    case 'radar':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="2" />
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
          <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
        </svg>
      )
    case 'finance':
      return (
        <svg {...props}>
          <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />
          <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
        </svg>
      )
    case 'ledger':
      return (
        <svg {...props}>
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      )
    case 'reports':
      return (
        <svg {...props}>
          <path d="M18 20V10" />
          <path d="M12 20V4" />
          <path d="M6 20v-6" />
        </svg>
      )
    case 'assistant':
      return (
        <svg {...props}>
          <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z" />
        </svg>
      )
    case 'network':
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      )
    case 'health':
      return (
        <svg {...props}>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      )
    case 'support':
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <path d="m4.93 4.93 4.24 4.24" />
          <path d="m14.83 14.83 4.24 4.24" />
          <path d="m14.83 9.17 4.24-4.24" />
          <path d="m4.93 19.07 4.24-4.24" />
        </svg>
      )
  }
}

function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false
    return (
      window.matchMedia?.('(display-mode: standalone)')?.matches ||
      window.navigator?.standalone === true
    )
  })
  const [isIOS] = useState(() => {
    if (typeof window === 'undefined') return false
    return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase())
  })
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    const onPrompt = event => {
      event.preventDefault()
      setDeferredPrompt(event)
    }
    const onInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (isInstalled) return null

  if (deferredPrompt) {
    return (
      <button
        type="button"
        className="btn-sm primary"
        onClick={async () => {
          await deferredPrompt.prompt()
          const choice = await deferredPrompt.userChoice
          if (choice?.outcome === 'accepted') {
            setIsInstalled(true)
            setDeferredPrompt(null)
          }
        }}
      >
        Install App
      </button>
    )
  }

  if (isIOS) {
    return (
      <>
        <button type="button" className="btn-sm" onClick={() => setShowIOSGuide(true)}>
          Install iOS App
        </button>
        {showIOSGuide && (
          <div className="pwa-modal-backdrop" role="dialog" aria-modal="true" aria-label="Install iOS App">
            <div className="pwa-modal">
              <h3>Install Kenya Motorcycle Spare Parts General</h3>
              <p className="muted">
                1. Tap the <strong>Share</strong> icon in Safari.<br />
                2. Tap <strong>Add to Home Screen</strong> for offline POS access.
              </p>
              <button type="button" className="primary" onClick={() => setShowIOSGuide(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </>
    )
  }

  return null
}

function SyncIndicator() {
  const { session } = useAuth()
  const { isFirebaseSession, offlineMode, outbox = [], outboxConflicts = [] } = useWorkspace()
  const unverifiedFirebase = session?.provider === 'firebase' && session?.user?.emailVerified === false
  let label = 'Local Workspace'
  if (offlineMode) {
    label = 'Offline outbox'
  } else if (isFirebaseSession) {
    label = 'Cloud Firestore Synced'
  } else if (session?.provider === 'supabase') {
    label = 'Supabase Auth Connected'
  } else if (unverifiedFirebase) {
    label = 'Verify Email for Cloud Sync'
  }
  return (
    <span className={`sync-state ${offlineMode || outboxConflicts.length ? 'healthOffline' : 'healthOk'}`} role="status">
      {label}
      {outbox.length > 0 ? ` · ${outbox.length} queued` : ''}
      {outboxConflicts.length > 0 ? ` · ${outboxConflicts.length} conflict(s)` : ''}
    </span>
  )
}

function FloatingUtilityDock() {
  const navigate = useNavigate()
  const {
    offlineMode,
    outbox = [],
    outboxConflicts = [],
    syncOutbox,
    resolveOutboxConflict,
    recordDailyExpense,
  } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [costKes, setCostKes] = useState('1450')
  const [sellKes, setSellKes] = useState('2200')
  const [expCat, setExpCat] = useState('Boda Courier')
  const [expAmt, setExpAmt] = useState('')
  const [dockMsg, setDockMsg] = useState('')

  const cost = Math.max(0, Number(costKes || 0))
  const sell = Math.max(0, Number(sellKes || 0))
  const profit = sell - cost
  const marginPct = sell > 0 ? Math.round((profit / sell) * 1000) / 10 : 0
  const vatAmount = Math.round(sell * 0.16 * 100) / 100
  const incVat = Math.round((sell + vatAmount) * 100) / 100

  async function handleQuickExpense(event) {
    event.preventDefault()
    if (!Number(expAmt)) return
    try {
      await recordDailyExpense({ category: expCat, amount: Number(expAmt), description: 'Captured via Floating Utility Dock' })
      setExpAmt('')
      setDockMsg(`Recorded KES ${expAmt} expense & balanced JE.`)
    } catch (err) {
      setDockMsg(err?.message || 'Could not save expense.')
    }
  }

  return (
    <div className="floating-dock no-print">
      {open && (
        <section className="dock-panel" aria-label="Floating Utility Dock">
          <div className="card-head">
            <strong>Quick Utility Dock (UX-004)</strong>
            <button type="button" className="btn-sm" onClick={() => setOpen(false)}>Close</button>
          </div>

          <div className="actions-inline">
            <button type="button" className="btn-sm" onClick={() => { navigate('/app/radar'); setOpen(false) }}>
              Parts Radar
            </button>
            <button type="button" className="btn-sm" onClick={() => { navigate('/app/assistant'); setOpen(false) }}>
              AI Co-Pilot
            </button>
            <button type="button" className="btn-sm" onClick={() => { navigate('/app/pos'); setOpen(false) }}>
              Fast POS
            </button>
          </div>

          <div className="sub-card">
            <strong>KES Margin &amp; eTIMS VAT Calculator</strong>
            <div className="dock-calc-grid">
              <label>
                Cost (KES)
                <input type="number" min="0" value={costKes} onChange={e => setCostKes(e.target.value)} />
              </label>
              <label>
                Ex-VAT Price
                <input type="number" min="0" value={sellKes} onChange={e => setSellKes(e.target.value)} />
              </label>
            </div>
            <div className="dock-calc-result">
              <span>Profit: <strong>{formatMoney(profit)}</strong> ({marginPct}%)</span>
              <span>16% eTIMS VAT: <strong>{formatMoney(vatAmount)}</strong> · Inc VAT: <strong>{formatMoney(incVat)}</strong></span>
            </div>
          </div>

          <form className="sub-card" onSubmit={handleQuickExpense}>
            <strong>Quick Petty Cash Expense</strong>
            <div className="dock-calc-grid">
              <label>
                Category
                <input value={expCat} onChange={e => setExpCat(e.target.value)} required />
              </label>
              <label>
                Amount (KES)
                <input type="number" min="1" value={expAmt} onChange={e => setExpAmt(e.target.value)} placeholder="350" required />
              </label>
            </div>
            <button type="submit" className="primary btn-sm">Save Expense &amp; Post JE</button>
          </form>

          {(outbox.length > 0 || outboxConflicts.length > 0) && (
            <div className="sub-card">
              <strong>Sync &amp; Conflict Queue</strong>
              <p className="muted">{outbox.length} queued · {outboxConflicts.length} conflict(s)</p>
              {outbox.length > 0 && !offlineMode && (
                <button type="button" className="btn-sm primary" onClick={() => void syncOutbox()}>
                  Sync {outbox.length} Now
                </button>
              )}
              {outboxConflicts.slice(0, 2).map(conf => (
                <div key={conf.idempotencyKey} className="mt-xs">
                  <small className="form-error">{conf.conflictReasons?.[0] || 'Outbox sync conflict'}</small>
                  <div className="actions-inline mt-xs">
                    <button type="button" className="btn-sm primary" onClick={() => void resolveOutboxConflict(conf.idempotencyKey, 'accept_current')}>
                      Re-price &amp; Sync
                    </button>
                    <button type="button" className="btn-sm" onClick={() => void resolveOutboxConflict(conf.idempotencyKey, 'discard')}>
                      Discard
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {dockMsg && <p className="notice" role="status">{dockMsg}</p>}
        </section>
      )}
      <button
        type="button"
        className="dock-toggle"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        {open ? 'Hide Dock' : `Quick Dock${outboxConflicts.length ? ` (${outboxConflicts.length}!)` : ''}`}
      </button>
    </div>
  )
}

export default function Shell() {
  const { session, signOut, resendVerification, refreshVerification } = useAuth()
  const { data: { context, memberships = [] }, revision, notice } = useTenant()
  const {
    branches,
    activeBranchId,
    notifications = [],
    markNotificationRead,
    markAllNotificationsRead,
    trainingMode,
    setTrainingMode,
  } = useWorkspace()
  const [inboxOpen, setInboxOpen] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState('')
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [lang, setLang] = useState(() => getLanguage())
  const location = useLocation()
  const hasFinanceAccess = ['owner', 'manager', 'accountant'].includes(context.role)
  const visibleSections = NAV_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item => !item.requiresFinanceRole || hasFinanceAccess),
  })).filter(section => section.items.length > 0)
  const visibleItems = visibleSections.flatMap(s => s.items)
  const activeItem = visibleItems.find(item => isNavItemActive(item, location.pathname, location.search))
  const current = location.pathname.split('/').pop()
  const mobileItems = visibleItems.filter(item => item.isDefaultTab || !item.tab)
  const targetBranchId = context.branch_id || activeBranchId
  const membershipMatch = memberships.find(
    m => m.organization_id === context.organization_id && (!targetBranchId || m.branch_id === targetBranchId),
  )
  const activeBranch =
    branches.find(b => b.id === targetBranchId) ||
    (membershipMatch
      ? { id: membershipMatch.branch_id, name: membershipMatch.branch_name || 'Main Shop', area: membershipMatch.area || 'Kenya' }
      : branches[0])
  const unreadCount = notifications.filter(n => n.status === 'Unread').length
  const needsEmailVerification = session?.provider === 'firebase' && session?.user?.emailVerified === false

  function switchLanguage(nextLang) {
    setLanguage(nextLang)
    setLang(nextLang)
  }

  async function handleResend() {
    setVerifyBusy(true)
    setVerifyMsg('')
    try {
      await resendVerification()
      setVerifyMsg(`Verification email sent to ${session.user.email}. Check your inbox and spam folder.`)
    } catch (err) {
      setVerifyMsg(err?.message || 'Could not send verification email right now.')
    } finally {
      setVerifyBusy(false)
    }
  }

  async function handleRefresh() {
    setVerifyBusy(true)
    setVerifyMsg('')
    try {
      const ok = await refreshVerification()
      setVerifyMsg(ok ? 'Email verified! Cloud Firestore sync is now active.' : 'Email is not verified yet. Open the verification link in your inbox first.')
    } catch (err) {
      setVerifyMsg(err?.message || 'Could not refresh verification status.')
    } finally {
      setVerifyBusy(false)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <nav aria-label={t('navigation')}>
          {visibleSections.map(section => (
            <div className="nav-group" key={section.groupKey}>
              <div className="nav-group-label">{t(section.groupKey)}</div>
              {section.items.map(item => {
                const active = isNavItemActive(item, location.pathname, location.search)
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    className={`nav-item${active ? ' active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                  >
                    <NavIcon name={item.icon} />
                    <span>{t(item.labelKey)}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div>
            <strong>{session.user.displayName || 'Workspace User'}</strong>
            <span>{t(`role_${context.role}`)} · {activeBranch?.area || 'Kenya'}</span>
            <div className="lang-toggle mt-sm" role="group" aria-label="Language toggle">
              <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => switchLanguage('en')}>EN</button>
              <button type="button" className={lang === 'sw' ? 'active' : ''} onClick={() => switchLanguage('sw')}>SW</button>
            </div>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="topbar-left">
            <div className="breadcrumb-trail" aria-label="Breadcrumb">
              <span>{context.organization_name}</span>
              <span aria-hidden="true">/</span>
              <span>{activeBranch?.name || 'Active Shop'}</span>
            </div>
            <h1 tabIndex={-1}>{activeItem ? t(activeItem.labelKey) : t(current)}</h1>
          </div>
          <div className="topbar-right">
            <PWAInstallButton />
            <BranchSwitcher compact />
            <div className="account">
              <SyncIndicator />
              <div className="notif-wrap">
                <button
                  type="button"
                  className="btn-sm"
                  aria-expanded={inboxOpen}
                  aria-label="Open workspace notifications"
                  onClick={() => setInboxOpen(v => !v)}
                >
                  Alerts ({unreadCount})
                </button>
              </div>
              <span aria-hidden="true" className="meta-sep">·</span>
              <span className="account-email">{session.user.email}</span>
              <button type="button" className="btn-quiet" onClick={() => void signOut()}>
                {t('signOut')}
              </button>
            </div>
          </div>
        </header>

        {trainingMode && (
          <section className="sandbox-banner" role="status">
            <div>
              <strong>Training / Sandbox Mode Active (ADM-005)</strong> — Counter sales stay local and do not queue live eTIMS VAT or Firestore production writes.
            </div>
            <button type="button" className="btn-sm" onClick={() => setTrainingMode(false)}>
              Exit Sandbox
            </button>
          </section>
        )}

        {needsEmailVerification && (
          <section className="verify-banner" role="status">
            <div>
              <strong>Verify your email ({session.user.email})</strong>
              <p className="muted">
                {verifyMsg || 'You are working in local workspace mode. Verify your email address to enable live Cloud Firestore sync.'}
              </p>
            </div>
            <div className="inline-controls">
              <button type="button" className="btn-sm" onClick={() => void handleResend()} disabled={verifyBusy}>
                Resend verification email
              </button>
              <button type="button" className="btn-sm primary" onClick={() => void handleRefresh()} disabled={verifyBusy}>
                I verified — Refresh
              </button>
            </div>
          </section>
        )}

        {inboxOpen && (
          <section className="notif-popover" aria-label="Notification Center">
            <div className="card-head">
              <strong>Notification Center</strong>
              <div className="inline-controls">
                {unreadCount > 0 && (
                  <button type="button" className="btn-sm" onClick={() => void markAllNotificationsRead()}>
                    Mark all read
                  </button>
                )}
                <button type="button" className="btn-sm" onClick={() => setInboxOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            {!notifications.length ? (
              <p className="muted">No alerts recorded yet.</p>
            ) : (
              notifications.slice(0, 12).map(n => (
                <article className="notif-item" key={n.id}>
                  <div className="notif-item-head">
                    <strong>{n.title}</strong>
                    <span
                      className={
                        n.status === 'Unread'
                          ? 'status-tag warn'
                          : n.status === 'Suppressed'
                            ? 'status-tag danger'
                            : 'status-tag muted'
                      }
                    >
                      {n.channel} · {n.status}
                    </span>
                  </div>
                  <p className="muted">{n.body}</p>
                  {n.status === 'Unread' && (
                    <div>
                      <button type="button" className="btn-sm" onClick={() => void markNotificationRead(n.id)}>
                        Mark read
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </section>
        )}

        {notice && <p className="notice" role="status">{notice}</p>}
        <div className="workspace-content" key={`${revision}-${lang}`}>
          <Outlet />
        </div>
      </main>
      <FloatingUtilityDock />
      <nav className="mobile-nav" aria-label={t('navigation')}>
        {mobileItems.map(item => (
          <NavLink to={item.basePath} key={item.id}>
            <NavIcon name={item.icon} />
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
