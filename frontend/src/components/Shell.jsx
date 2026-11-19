import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { useTenant } from '../tenancy/context.js'
import { useWorkspace } from '../lib/workspaceContext.js'
import { BranchSwitcher } from '../tenancy/SelectionPages.jsx'
import { Brand } from './States.jsx'
import { t } from '../i18n/index.js'

function SyncIndicator() {
  const { isFirebaseSession, offlineMode, outbox } = useWorkspace()
  return (
    <span className={`sync-state ${offlineMode ? 'healthOffline' : 'healthOk'}`} role="status">
      {offlineMode
        ? 'Offline outbox'
        : isFirebaseSession
          ? 'Synced'
          : 'Local preview'}
      {outbox.length > 0 ? ` · ${outbox.length} queued` : ''}
    </span>
  )
}

export default function Shell() {
  const { session, signOut } = useAuth()
  const { data: { context }, revision, notice } = useTenant()
  const {
    branches,
    activeBranchId,
    notifications = [],
    markNotificationRead,
    markAllNotificationsRead,
  } = useWorkspace()
  const [inboxOpen, setInboxOpen] = useState(false)
  const location = useLocation()
  const pages = ['overview', 'pos', 'inventory', 'dispatch', 'radar', 'assistant', 'finance', 'network'].filter(
    page => page !== 'finance' || ['owner', 'manager', 'accountant'].includes(context.role),
  )
  const current = location.pathname.split('/').pop()
  const activeBranch = branches.find(b => b.id === activeBranchId) || branches[0]
  const unreadCount = notifications.filter(n => n.status === 'Unread').length

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
            <span>{t(`role_${context.role}`)} · {activeBranch?.area || 'Nairobi'}</span>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="topbar-left">
            <div className="breadcrumb-trail" aria-label="Breadcrumb">
              <span>{context.organization_name}</span>
              <span aria-hidden="true">/</span>
              <span>{activeBranch?.name || 'Active Branch'}</span>
            </div>
            <h1 tabIndex={-1}>{t(current)}</h1>
          </div>
          <div className="topbar-right">
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
        <div className="workspace-content" key={revision}>
          <Outlet />
        </div>
      </main>
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
