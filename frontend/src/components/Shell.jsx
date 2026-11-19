import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import { useTenant } from '../tenancy/context.js'
import { BranchSwitcher } from '../tenancy/SelectionPages.jsx'
import { Brand } from './States.jsx'
import { config } from '../lib/env.js'
import { t } from '../i18n/index.js'

function Connectivity() {
  const [status, setStatus] = useState('healthChecking')
  const [offline, setOffline] = useState(!navigator.onLine)
  const wasUnavailable = useRef(false)
  useEffect(() => {
    let active = true
    let controller
    async function check() {
      controller?.abort()
      controller = new AbortController()
      const current = controller
      const timer = setTimeout(() => current.abort(), 10000)
      try {
        const response = await fetch(`${config.apiUrl}/health/db`, { signal: current.signal, redirect: 'error' })
        const data = await response.json()
        if (!active || current.signal.aborted) return
        const ok = response.ok && data.status === 'ok' && data.database === 'connected'
        setStatus(ok ? 'healthOk' : 'healthDegraded')
        setOffline(!ok || !navigator.onLine)
        if (ok && wasUnavailable.current) window.dispatchEvent(new Event('kms:reconnect'))
        if (!ok) window.dispatchEvent(new Event('kms:unavailable'))
        wasUnavailable.current = !ok
      } catch {
        if (active && controller === current) { setStatus('healthOffline'); setOffline(true); wasUnavailable.current = true; window.dispatchEvent(new Event('kms:unavailable')) }
      } finally { clearTimeout(timer) }
    }
    const failed = () => { setOffline(true); setStatus('healthOffline'); wasUnavailable.current = true; window.dispatchEvent(new Event('kms:unavailable')) }
    void check()
    const timer = setInterval(check, 30000)
    window.addEventListener('online', check)
    window.addEventListener('offline', failed)
    window.addEventListener('kms:network-error', failed)
    return () => { active = false; clearInterval(timer); controller?.abort(); window.removeEventListener('online', check); window.removeEventListener('offline', failed); window.removeEventListener('kms:network-error', failed) }
  }, [])
  return <><p className={`connection ${status}`} role="status">{t(status)}</p>{offline && <p className="notice offline-banner" role="alert">{t('offline')}</p>}</>
}

export default function Shell() {
  const { session, signOut } = useAuth()
  const { data: { context }, revision, notice } = useTenant()
  const [dismissed, setDismissed] = useState(false)
  const location = useLocation()
  const pages = ['overview', 'pos', 'inventory', 'radar', 'finance', 'dispatch'].filter(page => page !== 'finance' || ['owner', 'manager', 'accountant'].includes(context.role))
  const current = location.pathname.split('/').pop()
  return <div className="app-shell">
    <aside className="sidebar"><Brand /><nav aria-label={t('navigation')}>{pages.map(page => <NavLink className="nav-item" to={`/app/${page}`} key={page}>{t(page)}</NavLink>)}</nav><div className="sidebar-footer"><span>{t('workspace')}</span></div></aside>
    <main>
      <header className="topbar"><div><p className="eyebrow">{context.organization_name}</p><h1 tabIndex={-1}>{t(current)}</h1></div><div className="account"><span>{session.user.email}</span><span>{t(`role_${context.role}`)}</span><button onClick={() => signOut()}>{t('signOut')}</button></div></header>
      <BranchSwitcher /><Connectivity />
      {notice && <p className="notice" role="status">{notice}</p>}
      {!context.staff_user_id && !dismissed && <div className="notice staff-notice"><p>{t('staffUnlinked')}</p><button onClick={() => setDismissed(true)}>{t('dismiss')}</button></div>}
      <div key={revision}><Outlet /></div>
    </main>
    <nav className="mobile-nav" aria-label={t('navigation')}>{pages.map(page => <NavLink to={`/app/${page}`} key={page}>{t(page)}</NavLink>)}</nav>
  </div>
}
