import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { useTenant } from '../tenancy/context.js'
import { useWorkspace } from '../lib/workspaceContext.js'
import { BranchSwitcher } from '../tenancy/SelectionPages.jsx'
import { Brand } from './States.jsx'
import { getLanguage, setLanguage, t } from '../i18n/index.js'
import { formatMoney } from '../lib/format.js'

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
  const pages = ['overview', 'pos', 'inventory', 'dispatch', 'radar', 'assistant', 'finance', 'network'].filter(
    page => page !== 'finance' || ['owner', 'manager', 'accountant'].includes(context.role),
  )
  const current = location.pathname.split('/').pop()
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
          {pages.map(page => (
            <NavLink className="nav-item" to={`/app/${page}`} key={page}>
              {t(page)}
            </NavLink>
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
            <h1 tabIndex={-1}>{t(current)}</h1>
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
        {pages.map(page => (
          <NavLink to={`/app/${page}`} key={page}>
            {t(page)}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
