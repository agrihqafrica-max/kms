import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider.jsx'
import { useAuth } from './auth/context.js'
import TenantProvider from './tenancy/TenantProvider.jsx'
import { useTenant } from './tenancy/context.js'
import { WorkspaceProvider } from './lib/firestoreStore.jsx'
import { OrgPicker, NoOrganization } from './tenancy/SelectionPages.jsx'
import { ErrorState, Loading } from './components/States.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { t } from './i18n/index.js'

const AuthPage = lazy(() => import('./auth/AuthPages.jsx'))
const Shell = lazy(() => import('./components/Shell.jsx'))
const Overview = lazy(() => import('./pages/Overview.jsx'))
const Pos = lazy(() => import('./pages/Pos.jsx'))
const Radar = lazy(() => import('./pages/Radar.jsx'))
const Inventory = lazy(() => import('./pages/Inventory.jsx'))
const Finance = lazy(() => import('./pages/Finance.jsx'))
const Dispatch = lazy(() => import('./pages/Dispatch.jsx'))
const Assistant = lazy(() => import('./pages/Assistant.jsx'))
const Network = lazy(() => import('./pages/Network.jsx'))
const OrganizationRegistration = lazy(() => import('./pages/OrganizationRegistration.jsx'))

function AuthScreen() {
  const { session } = useAuth()
  return <AuthPage key={session?.user.id ?? 'anon'} />
}

function AuthGate() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/signin" state={{ from: location.pathname }} replace />
  return (
    <TenantProvider key={session.user.id}>
      <WorkspaceProvider>
        <TenantGate />
      </WorkspaceProvider>
    </TenantProvider>
  )
}

function TenantGate() {
  const { loading, data, error, reload } = useTenant()
  const { signOut } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (error) {
    return (
      <div className="selection-page">
        <ErrorState error={error} retry={reload} />
        <button onClick={() => void signOut()}>{t('signOut')}</button>
      </div>
    )
  }
  if (!data?.memberships.length && location.pathname !== '/no-organization') return <Navigate to="/no-organization" replace />
  if (data?.memberships.length && !data.context && location.pathname !== '/select-organization') {
    return <Navigate to="/select-organization" state={location.state} replace />
  }
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
      if (heading) {
        heading.focus()
        observer.disconnect()
      }
    }
    const observer = new MutationObserver(focus)
    observer.observe(document.getElementById('root'), { childList: true, subtree: true })
    focus()
    const timeout = setTimeout(() => observer.disconnect(), 1000)
    return () => {
      observer.disconnect()
      clearTimeout(timeout)
    }
  }, [pathname])
  return null
}

export default function Router() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <FocusRoute />
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/signin" element={<AuthScreen />} />
              <Route path="/signup" element={<Navigate to="/signin" replace />} />
              <Route path="/register-organization" element={<RegistrationGate />} />
              <Route element={<AuthGate />}>
                <Route path="/select-organization" element={<OrgPicker />} />
                <Route path="/no-organization" element={<NoOrganization />} />
                <Route path="/app" element={<Shell />}>
                  <Route index element={<Navigate to="overview" replace />} />
                  <Route path="overview" element={<Overview />} />
                  <Route path="pos" element={<Pos />} />
                  <Route path="inventory" element={<Inventory />} />
                  <Route path="dispatch" element={<Dispatch />} />
                  <Route path="radar" element={<Radar />} />
                  <Route path="assistant" element={<Assistant />} />
                  <Route path="finance" element={<Finance />} />
                  <Route path="network" element={<Network />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/app/overview" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
