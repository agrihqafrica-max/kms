import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider.jsx'
import { useAuth } from './auth/context.js'
import TenantProvider from './tenancy/TenantProvider.jsx'
import { useTenant } from './tenancy/context.js'
import { OrgPicker, NoOrganization } from './tenancy/SelectionPages.jsx'
import { ErrorState, Loading } from './components/States.jsx'
import { t } from './i18n/index.js'

const AuthPage = lazy(() => import('./auth/AuthPages.jsx'))
const Shell = lazy(() => import('./components/Shell.jsx'))
const Overview = lazy(() => import('./pages/Overview.jsx'))
const Pos = lazy(() => import('./pages/Pos.jsx'))
const Radar = lazy(() => import('./pages/Radar.jsx'))
const Placeholder = lazy(() => import('./pages/Placeholder.jsx'))
const OrganizationRegistration = lazy(() => import('./pages/OrganizationRegistration.jsx'))
const Inventory = lazy(() => import('./pages/Inventory.jsx'))
const Finance = lazy(() => import('./pages/Finance.jsx'))

function AuthScreen({ mode }) {
  const { session, recovery } = useAuth()
  return <AuthPage key={`${mode}:${session?.user.id ?? ''}:${recovery?.sessionId ?? ''}`} mode={mode} />
}

function AuthGate() {
  const { session, loading, recovery } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/signin" state={{ from: location.pathname }} replace />
  if (recovery) return <Navigate to="/update-password" replace />
  return <TenantProvider key={session.user.id}><TenantGate /></TenantProvider>
}
function TenantGate() {
  const { loading, data, error, reload } = useTenant()
  const { signOut } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (error) return <div className="selection-page"><ErrorState error={error} retry={reload} /><button onClick={() => signOut()}>{t('signOut')}</button></div>
  if (!data?.memberships.length && location.pathname !== '/no-organization') return <Navigate to="/no-organization" replace />
  if (data?.memberships.length && !data.context && location.pathname !== '/select-organization') return <Navigate to="/select-organization" state={location.state} replace />
  if (data?.context && location.pathname === '/no-organization') return <Navigate to="/app/overview" replace />
  return <Outlet />
}
function RegistrationGate() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/signin" state={{ from: location.pathname }} replace />
  return <OrganizationRegistration />
}
function FocusRoute() {
  const { pathname } = useLocation()
  useEffect(() => {
    const focus = () => {
      const heading = document.querySelector('h1[tabindex]')
      if (heading) { heading.focus(); observer.disconnect() }
    }
    const observer = new MutationObserver(focus)
    observer.observe(document.getElementById('root'), { childList: true, subtree: true })
    focus()
    const timeout = setTimeout(() => observer.disconnect(), 1000)
    return () => { observer.disconnect(); clearTimeout(timeout) }
  }, [pathname])
  return null
}
export default function Router() {
  return <BrowserRouter><AuthProvider><FocusRoute /><Suspense fallback={<Loading />}><Routes>
    <Route path="/signin" element={<AuthScreen mode="signin" />} />
    <Route path="/signup" element={<AuthScreen mode="signup" />} />
    <Route path="/reset-password" element={<AuthScreen mode="reset" />} />
    <Route path="/update-password" element={<AuthScreen mode="update" />} />
    <Route path="/register-organization" element={<RegistrationGate />} />
    <Route element={<AuthGate />}>
      <Route path="/select-organization" element={<OrgPicker />} />
      <Route path="/no-organization" element={<NoOrganization />} />
      <Route path="/app" element={<Shell />}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<Overview />} /><Route path="pos" element={<Pos />} /><Route path="radar" element={<Radar />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="finance" element={<Finance />} />
        {['dispatch'].map(page => <Route key={page} path={page} element={<Placeholder page={page} />} />)}
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/app/overview" replace />} />
  </Routes></Suspense></AuthProvider></BrowserRouter>
}
