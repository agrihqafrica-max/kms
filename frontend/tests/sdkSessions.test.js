import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { createApiClient } from '../src/lib/apiClient.js'

const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
function tokenResponse(id, version = 1) {
  const exp = Math.floor(Date.now() / 1000) + 3600
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  return {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: id, exp, session_id: `session-${id}`, version })}.synthetic`,
    refresh_token: `synthetic-refresh-${id}-${version}`, expires_in: 3600, expires_at: exp, token_type: 'bearer',
    user: { id, aud: 'authenticated', role: 'authenticated', email: `${id}@example.test`, app_metadata: {}, user_metadata: {}, created_at: '2026-11-19T00:00:00Z' },
  }
}

test('installed SDK keeps replacement account usable after a superseded refresh', { timeout: 5000 }, async () => {
  let releaseA, startedA
  const gate = new Promise(resolve => { releaseA = resolve })
  const ready = new Promise(resolve => { startedA = resolve })
  const refreshes = []
  const bRotated = tokenResponse('b', 2)
  const sdk = createClient('https://auth.example.test', 'synthetic-public-key', {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: async (url, init) => {
      const body = JSON.parse(init.body ?? '{}')
      if (url.includes('grant_type=password')) return json(200, tokenResponse(body.email.startsWith('a@') ? 'a' : 'b'))
      if (url.includes('grant_type=refresh_token')) {
        refreshes.push(body.refresh_token)
        if (body.refresh_token === 'synthetic-refresh-a-1') { startedA(); await gate; return json(400, { code: 'refresh_token_not_found', msg: 'Synthetic rejection' }) }
        return json(200, bRotated)
      }
      throw new Error('Unexpected synthetic auth request')
    } },
  })
  let expired = 0
  const api = createApiClient({ baseUrl: 'https://api.example.test', auth: sdk.auth,
    fetcher: async (url, init) => init.headers.Authorization === `Bearer ${bRotated.access_token}` ? json(200, { account: 'b' }) : json(401, {}),
  })
  api.setHandlers({ onExpired: () => { expired++ } })
  await sdk.auth.signInWithPassword({ email: 'a@example.test', password: 'synthetic' })
  api.setScope({ userId: 'a' })
  const a = assert.rejects(api.request('/inventory'), { name: 'AbortError' })
  await ready
  await sdk.auth.signInWithPassword({ email: 'b@example.test', password: 'synthetic' })
  api.setScope({ userId: 'b' })
  const b = api.request('/inventory')
  await new Promise(setImmediate)
  releaseA()
  await a
  assert.deepEqual(await b, { account: 'b' })
  assert.deepEqual(refreshes, ['synthetic-refresh-a-1', 'synthetic-refresh-b-1'])
  assert.equal(expired, 0)
  assert.equal((await sdk.auth.getSession()).data.session.user.id, 'b')
})
