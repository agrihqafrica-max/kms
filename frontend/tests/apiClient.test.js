import test from 'node:test'
import assert from 'node:assert/strict'
import { createApiClient } from '../src/lib/apiClient.js'

const response = (status, body) => new Response(JSON.stringify(body), { status })
const session = (token = 'test-access', id = 'user-a') => ({ access_token: token, user: { id } })
function setup(fetcher, refresh) {
  let current = session()
  let refreshes = 0
  let expired = 0
  const client = createApiClient({
    baseUrl: 'http://localhost:8000', fetcher,
    auth: {
      getSession: async () => ({ data: { session: current } }),
      refreshSession: async () => {
        refreshes++
        if (refresh) return refresh()
        current = session('rotated')
        return { data: { session: current } }
      },
    },
  })
  client.setScope({ userId: 'user-a', organizationId: 'org-a', branchId: 'branch-a' })
  client.setHandlers({ onExpired: () => { expired++ } })
  return { client, setSession: value => { current = value }, refreshes: () => refreshes, expired: () => expired }
}

test('attaches current credentials and selection; bootstrap omits tenant headers', async () => {
  const requests = []
  const s = setup(async (url, init) => { requests.push({ url, ...init }); return response(200, { ok: true }) })
  assert.deepEqual(await s.client.request('/inventory'), { ok: true })
  s.setSession(session('new-token'))
  await s.client.request('/auth/me', { tenant: false })
  assert.equal(requests[0].headers.Authorization, 'Bearer test-access')
  assert.equal(requests[0].headers['X-Organization-Id'], 'org-a')
  assert.equal(requests[0].headers['X-Branch-Id'], 'branch-a')
  assert.equal(requests[1].headers.Authorization, 'Bearer new-token')
  assert.equal(requests[1].headers['X-Organization-Id'], undefined)
})

test('concurrent and delayed old-token 401s share a single rotation', async () => {
  let release
  let started
  const start = new Promise(resolve => { started = resolve })
  const gate = new Promise(resolve => { release = resolve })
  let calls = 0
  const s = setup(async (url, { headers }) => {
    calls++
    if (headers.Authorization === 'Bearer rotated') return response(200, { ok: true })
    if (url.endsWith('/slow')) { started(); await gate }
    return response(401, { detail: 'expired' })
  })
  const slow = s.client.request('/slow')
  await start
  assert.deepEqual(await s.client.request('/fast'), { ok: true })
  release()
  assert.deepEqual(await slow, { ok: true })
  assert.equal(s.refreshes(), 1)
  assert.equal(calls, 4)
})

test('failed refresh expires once and never retries the protected request', async () => {
  let calls = 0
  const s = setup(async () => { calls++; return response(401, {}) }, async () => ({ error: new Error('revoked'), data: { session: null } }))
  await assert.rejects(s.client.request('/inventory'), { status: 401 })
  assert.equal(calls, 1)
  assert.equal(s.refreshes(), 1)
  assert.equal(s.expired(), 1)
})

test('second 401 expires the session without another refresh', async () => {
  let calls = 0
  const s = setup(async () => { calls++; return response(401, {}) })
  await assert.rejects(s.client.request('/inventory'), { status: 401 })
  assert.equal(calls, 2)
  assert.equal(s.refreshes(), 1)
  assert.equal(s.expired(), 1)
})

test('403 is readable and is not retried', async () => {
  let calls = 0
  const s = setup(async () => { calls++; return response(403, { detail: 'Forbidden' }) })
  await assert.rejects(s.client.request('/finance'), { status: 403, message: 'Forbidden' })
  assert.equal(calls, 1)
  assert.equal(s.refreshes(), 0)
})

test('a response from a previous tenant is discarded', async () => {
  let release
  let started
  const ready = new Promise(resolve => { started = resolve })
  const gate = new Promise(resolve => { release = resolve })
  const s = setup(async () => { started(); await gate; return response(200, { private: 'org-a' }) })
  const pending = s.client.request('/inventory')
  await ready
  s.client.setScope({ userId: 'user-a', organizationId: 'org-b' })
  release()
  await assert.rejects(pending, { name: 'AbortError' })
})

test('an account switch during refresh never replays the old request', async () => {
  let calls = 0
  const s = setup(async () => { calls++; return response(401, {}) }, async () => {
    s.setSession(session('different-user', 'user-b'))
    return { data: { session: session('different-user', 'user-b') } }
  })
  await assert.rejects(s.client.request('/inventory'), { name: 'AbortError' })
  assert.equal(calls, 1)
  assert.equal(s.expired(), 0)
})

test('selection 409 waits for an explicit selection then retries once', async () => {
  const selected = []
  let calls = 0
  const s = setup(async (url, { headers }) => {
    calls++
    return headers['X-Organization-Id'] === 'org-b'
      ? response(200, { ok: true })
      : response(409, { detail: { code: 'organization_selection_required', organizations: [{ organization_id: 'org-b', name: 'B', role: 'owner' }] } })
  })
  s.client.setHandlers({ onSelectionRequired: async options => {
    selected.push(...options)
    s.client.setScope({ userId: 'user-a', organizationId: 'org-b' })
  } })
  assert.deepEqual(await s.client.request('/radar/requests'), { ok: true })
  assert.equal(selected[0].organization_id, 'org-b')
  assert.equal(calls, 2)
})

test('500 internals are not displayed and unauthenticated calls never fetch', async () => {
  let calls = 0
  const s = setup(async () => { calls++; return response(500, { detail: 'private SQL password' }) })
  await assert.rejects(s.client.request('/inventory'), e => e.status === 500 && !e.message.includes('private'))
  s.setSession(null)
  await assert.rejects(s.client.request('/inventory'), { status: 401 })
  assert.equal(calls, 1)
})

test('a new account does not join the previous account refresh', async () => {
  let releaseA, releaseB
  let startedA, startedB
  const readyA = new Promise(resolve => { startedA = resolve })
  const readyB = new Promise(resolve => { startedB = resolve })
  let refreshCalls = 0
  const s = setup(async (url, { headers }) => headers.Authorization === 'Bearer b-rotated' ? response(200, { owner: 'B' }) : response(401, {}), () => {
    refreshCalls++
    if (refreshCalls === 1) { startedA(); return new Promise(resolve => { releaseA = resolve }) }
    startedB(); return new Promise(resolve => { releaseB = resolve })
  })
  const a = s.client.request('/a')
  const rejectedA = assert.rejects(a, { name: 'AbortError' })
  await readyA
  s.client.setScope({ userId: 'user-b', organizationId: 'org-b' })
  s.setSession(session('b-token', 'user-b'))
  const b = s.client.request('/b')
  const outcomeB = b.then(data => ({ data }), error => ({ error }))
  await new Promise(setImmediate)
  const countWhileAPending = refreshCalls
  releaseA({ error: true, data: { session: null } })
  await Promise.race([readyB, outcomeB])
  assert.equal(countWhileAPending, 1, 'B must drain the old SDK refresh before starting its own')
  s.setSession(session('b-rotated', 'user-b'))
  releaseB({ data: { session: session('b-rotated', 'user-b') } })
  await rejectedA
  assert.deepEqual(await outcomeB, { data: { owner: 'B' } })
  assert.equal(s.expired(), 0)
})

test('absolute URLs cannot receive bearer credentials', async () => {
  let calls = 0
  const s = setup(async () => { calls++; return response(200, {}) })
  await assert.rejects(s.client.request('https://other.invalid/steal'))
  await assert.rejects(s.client.request('//other.invalid/steal'))
  assert.equal(calls, 0)
})
