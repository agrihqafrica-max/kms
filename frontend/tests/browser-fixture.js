export function installFixture() {
  const originalFetch = window.fetch.bind(window)
  const userId = '30000000-0000-4000-8000-000000000001'
  const orgA = '10000000-0000-4000-8000-000000000001'
  const orgB = '10000000-0000-4000-8000-000000000002'
  const branchA = '20000000-0000-4000-8000-000000000001'
  const branchB = '20000000-0000-4000-8000-000000000002'
  let user = { id: userId, email: 'browser-qa@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-11-19T00:00:00Z' }
  const token = () => {
    const encode = value => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, session_id: qa.sessionId, exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000), aud: 'authenticated', role: 'authenticated' })}.synthetic-signature`
  }
  const qa = { requests: [], scenario: 'single', failure: null, delay: 0, orgA, orgB, branchA, branchB, sessionId: 'synthetic-session-a' }
  qa.setAccount = (id, sessionId) => { user = { ...user, id }; qa.sessionId = sessionId }
  window.__qa = qa
  const respond = (status, data) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }))
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    if (!url.pathname.startsWith('/auth/v1') && url.port !== '8000') return originalFetch(input, init)
    const headers = new Headers(init.headers)
    qa.requests.push({ path: url.pathname, query: url.search, method: init.method ?? 'GET', authenticated: Boolean(headers.get('Authorization')), org: headers.get('X-Organization-Id'), branch: headers.get('X-Branch-Id') })
    if (qa.failure === 'offline' || (qa.failure === 'backend-offline' && url.port === '8000')) throw new TypeError('Synthetic offline')
    if (url.pathname.startsWith('/auth/v1')) {
      if (url.pathname.endsWith('/token') || url.pathname.endsWith('/verify')) {
        if (qa.signInGate && url.searchParams.get('grant_type') === 'password') { qa.onSignInStarted?.(); await qa.signInGate }
        if (qa.scenario === 'invalid') return respond(400, { code: 'invalid_credentials', msg: 'Invalid login credentials' })
        return respond(200, { access_token: token(), refresh_token: 'synthetic-refresh', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user })
      }
      if (url.pathname.endsWith('/logout') && qa.logoutGate) await qa.logoutGate
      if (url.pathname.endsWith('/user')) return respond(200, user)
      if (url.pathname.endsWith('/signup')) return respond(200, { ...user, identities: [] })
      return respond(200, {})
    }
    if (qa.delay) await new Promise(resolve => setTimeout(resolve, qa.delay))
    if (url.pathname === '/health/db') return respond(200, { status: 'ok', database: 'connected', server_time: '2026-11-19T09:00:00Z' })
    const role = qa.scenario === 'cashier' ? 'cashier' : 'manager'
    const memberships = qa.scenario === 'zero' ? [] : [{ organization_id: orgA, organization_name: 'QA Shop A', branch_id: qa.scenario === 'wide' ? null : branchA, role }]
    if (qa.scenario === 'multi') memberships.push({ organization_id: orgB, organization_name: 'QA Shop B', branch_id: branchB, role: 'manager' })
    const chosen = headers.get('X-Organization-Id')
    const row = chosen ? memberships.find(m => m.organization_id === chosen) : memberships.length === 1 ? memberships[0] : null
    if (url.pathname === '/auth/me') return respond(200, { user_id: user.id, email: user.email, memberships, context: row ? { ...row, org_wide: row.branch_id === null, staff_user_id: null } : null })
    if (qa.failure === 'server') return respond(500, { detail: 'private SQL text must not be displayed' })
    if (qa.failure === 'denied' || (url.pathname === '/finance/dashboard' && role === 'cashier')) return respond(403, { detail: 'Forbidden' })
    if (url.pathname === '/finance/dashboard') return respond(200, { sales_count: 2, net_sales: chosen === orgB ? '120.00' : '7850.00', expense_total: '0.00', low_stock_count: 0, inventory_items_count: 1 })
    if (url.pathname.startsWith('/inventory/branches/')) return respond(200, url.searchParams.get('search') === 'empty' ? [] : [{ id: '40000000-0000-4000-8000-000000000001', part_name: chosen === orgB ? 'QA Part B' : 'QA Part A', part_number: 'QA-ONLY', category: 'Testing', retail_price: '7850.00', stock_quantity: 3, reorder_level: 1 }])
    if (url.pathname === '/radar/requests') return respond(200, [])
    return respond(404, { detail: 'Not found' })
  }
  return { installed: true }
}
