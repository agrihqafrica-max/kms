const assert = (condition, message) => { if (!condition) throw new Error(message) }
const text = () => document.getElementById('root').textContent
function waitFor(predicate) {
  if (predicate()) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const observer = new MutationObserver(() => { if (predicate()) { clearTimeout(timeout); observer.disconnect(); resolve() } })
    const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Browser expectation timed out')) }, 10000)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  })
}
const button = label => [...document.querySelectorAll('button')].find(el => el.textContent === label)
function visit(path) {
  history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
function fill(name, value) {
  const input = document.querySelector(`[name="${name}"]`)
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
async function signOut() {
  button('Sign out').click()
  await waitFor(() => location.pathname === '/signin' && Boolean(document.querySelector('form')))
}
async function signIn(scenario) {
  window.__qa.scenario = scenario
  fill('email', 'browser-qa@example.test')
  fill('password', 'synthetic-test-password')
  document.querySelector('form').requestSubmit()
}
export async function runBrowserChecks() {
  const results = []
  const qa = window.__qa
  qa.results = results
  await waitFor(() => text().includes('QA Part A'))
  assert(location.pathname === '/app/pos', 'Intended deep link was not restored')
  assert(button('Checkout arrives in a later release')?.disabled, 'Checkout must be disabled')
  assert(qa.requests.filter(r => r.path.startsWith('/inventory')).every(r => r.authenticated && r.org === qa.orgA && r.branch === qa.branchA), 'Missing bearer/tenant headers')
  results.push('sign-in/deep-link/live-inventory fixture/tenant headers/disabled checkout')
  const search = document.querySelector('input[type="search"]')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, 'empty')
  search.dispatchEvent(new Event('input', { bubbles: true }))
  await waitFor(() => text().includes('No items match this search.'))
  assert(qa.requests.some(r => r.query === '?search=empty'), 'Search was not sent to API')
  results.push('debounced search and empty state')
  qa.failure = 'server'
  visit('/app/overview')
  await waitFor(() => text().includes('The service could not complete'))
  assert(!text().includes('private SQL'), 'Server internals leaked')
  qa.failure = null
  button('Try again').click()
  await waitFor(() => text().includes('7,850.00'))
  results.push('500 sanitization and retry')
  qa.failure = 'offline'
  window.dispatchEvent(new Event('offline'))
  await waitFor(() => text().includes('You are offline.') && !text().includes('7,850.00'))
  qa.failure = null
  window.dispatchEvent(new Event('online'))
  await waitFor(() => text().includes('7,850.00') && !text().includes('You are offline.'))
  results.push('offline data clearing and reconnect refetch')
  assert(navigator.onLine, 'Service-only outage test requires browser connectivity')
  qa.failure = 'backend-offline'
  window.dispatchEvent(new Event('online'))
  await waitFor(() => text().includes('You are offline.') && !text().includes('7,850.00'))
  assert(navigator.onLine, 'Browser connectivity unexpectedly changed')
  qa.failure = null
  window.dispatchEvent(new Event('online'))
  await waitFor(() => text().includes('7,850.00') && !text().includes('You are offline.'))
  results.push('backend-only outage clears loaded financial data while browser stays online')
  let releaseLogout
  qa.logoutGate = new Promise(resolve => { releaseLogout = resolve })
  button('Sign out').click()
  await waitFor(() => !text().includes('7,850.00'))
  await new Promise(resolve => setTimeout(resolve, 100))
  assert(!document.querySelector('form'), 'Sign-in was enabled before SDK logout finished')
  releaseLogout()
  qa.logoutGate = null
  await waitFor(() => location.pathname === '/signin' && Boolean(document.querySelector('form')))
  results.push('sign-in gated until SDK session teardown completes')
  assert(!localStorage.getItem('kms.30000000-0000-4000-8000-000000000001.organizationId'), 'Selection survived logout')
  results.push('logout clears tenant selection')
  await signIn('invalid')
  await waitFor(() => text().includes('Invalid email or password.'))
  results.push('invalid login remains usable')
  await signIn('zero')
  await waitFor(() => location.pathname === '/no-organization' && text().includes('Your account is ready.'))
  assert([...document.querySelectorAll('button')].some(b => b.disabled && b.textContent.includes('Register your business')), 'Fake onboarding enabled')
  assert(!qa.requests.some(r => r.path === '/organizations/register'), 'Unexpected registration write')
  results.push('zero-membership first run without provisioning')
  await signOut()
  await signIn('multi')
  await waitFor(() => location.pathname === '/select-organization' && text().includes('QA Shop B'))
  const pick = [...document.querySelectorAll('.org-options button')].find(el => el.textContent.includes('QA Shop B'))
  pick.click()
  await waitFor(() => text().includes('120.00'))
  assert(!text().includes('7,850.00'), 'Old tenant data is visible')
  const switcher = document.querySelector('#tenant-switcher select')
  switcher.value = qa.orgA
  switcher.dispatchEvent(new Event('change', { bubbles: true }))
  await waitFor(() => text().includes('7,850.00'))
  assert(!text().includes('120.00'), 'Previous organization value persisted')
  results.push('multi-organisation picker and cross-tenant data clearing')
  await signOut()
  await signIn('cashier')
  await waitFor(() => text().includes('You don’t have access to this'))
  assert(!document.querySelector('nav a[href="/app/finance"]'), 'Cashier sees Finance navigation')
  assert(!text().includes('7,850.00'), 'Cashier financial figures visible')
  results.push('cashier denial without figures or finance navigation')
  await signOut()
  await signIn('wide')
  await waitFor(() => text().includes('Branch list is not available yet.'))
  results.push('org-wide branch gap is honest')
  await signOut()
  visit('/signup')
  await waitFor(() => Boolean(document.querySelector('[name="confirmation"]')))
  fill('email', 'browser-qa@example.test'); fill('password', 'short'); fill('confirmation', 'short')
  const before = qa.requests.length
  document.querySelector('form').requestSubmit()
  await waitFor(() => text().includes('Use at least 6 characters.'))
  assert(qa.requests.length === before, 'Short password reached provider')
  fill('password', 'long-enough-password'); fill('confirmation', 'different-password')
  document.querySelector('form').requestSubmit()
  await waitFor(() => text().includes('Passwords do not match.'))
  results.push('signup validation before network')
  fill('confirmation', 'long-enough-password')
  document.querySelector('form').requestSubmit()
  await waitFor(() => text().includes('Follow the confirmation link sent to'))
  results.push('confirmation-required sign-up UI (provider intercepted)')
  visit('/reset-password')
  await waitFor(() => Boolean(document.querySelector('form')))
  fill('email', 'browser-qa@example.test'); document.querySelector('form').requestSubmit()
  await waitFor(() => text().includes('If an account exists for this address'))
  visit('/update-password')
  await waitFor(() => text().includes('This recovery link is expired or invalid.'))
  results.push('generic recovery confirmation and invalid-link guard')
  const { supabase } = await import('/src/lib/supabase.js')
  qa.scenario = 'single'
  await supabase.auth.verifyOtp({ token_hash: 'synthetic-recovery', type: 'recovery' })
  await waitFor(() => Boolean(document.querySelector('[name="confirmation"]')))
  fill('password', 'synthetic-recovery-password'); fill('confirmation', 'synthetic-recovery-password')
  qa.setAccount('30000000-0000-4000-8000-000000000002', 'synthetic-session-b')
  await supabase.auth.signInWithPassword({ email: 'browser-qa@example.test', password: 'synthetic-password' })
  await waitFor(() => text().includes('This recovery link is expired or invalid.'))
  assert(!document.querySelector('[name="password"]'), 'Old recovery form survived account replacement')
  assert(!qa.requests.some(r => r.path === '/auth/v1/user' && r.method === 'PUT'), 'Account replacement submitted a password')
  results.push('account replacement removes recovery authority and populated form')
  await supabase.auth.signOut({ scope: 'local' })
  qa.setAccount('30000000-0000-4000-8000-000000000001', 'synthetic-session-c')
  await supabase.auth.verifyOtp({ token_hash: 'synthetic-recovery', type: 'recovery' })
  await waitFor(() => Boolean(document.querySelector('[name="confirmation"]')))
  fill('password', 'synthetic-new-password'); fill('confirmation', 'synthetic-new-password')
  document.querySelector('form').requestSubmit()
  await waitFor(() => location.pathname === '/signin' && Boolean(document.querySelector('form')))
  assert(qa.requests.filter(r => r.path === '/auth/v1/user' && r.method === 'PUT').length === 1, 'Recovery did not submit exactly one password update')
  assert(!(await supabase.auth.getSession()).data.session, 'Recovery completion retained the session')
  results.push('valid recovery updates once and completes local sign-out (provider intercepted)')
  let releaseSignIn
  qa.signInGate = new Promise(resolve => { releaseSignIn = resolve })
  const started = new Promise(resolve => { qa.onSignInStarted = resolve })
  await signIn('single')
  await started
  visit('/signup')
  await waitFor(() => Boolean(document.querySelector('[name="confirmation"]')))
  assert(document.querySelector('button[type="submit"]').disabled, 'Route change enabled a second SDK authentication operation')
  visit('/signin')
  await waitFor(() => !document.querySelector('[name="confirmation"]'))
  assert(document.querySelector('button[type="submit"]').disabled, 'Returning to sign-in lost provider-level authentication lock')
  releaseSignIn()
  qa.signInGate = null
  await waitFor(() => text().includes('7,850.00'))
  await signOut()
  results.push('pending sign-in remains coordinated across route changes and later sign-out')
  return { results, count: results.length, mode: 'Real browser and SDK, intercepted auth/API responses; no live acceptance claims' }
}
