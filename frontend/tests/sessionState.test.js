import test from 'node:test'
import assert from 'node:assert/strict'
import { authStateFromEvent, recoveryMatches } from '../src/auth/sessionState.js'
import * as recoveryActions from '../src/auth/sessionState.js'
import { bootstrapTenant } from '../src/tenancy/bootstrap.js'

const session = (id, sid) => ({ user: { id }, access_token: `e30.${Buffer.from(JSON.stringify({ session_id: sid })).toString('base64url')}.signature` })
test('recovery authority is cleared when a different account signs in', () => {
  const recovering = authStateFromEvent({}, session('a', 'session-a'), 'PASSWORD_RECOVERY')
  assert.equal(recoveryMatches(recovering.recovery, session('a', 'session-a')), true)
  const switched = authStateFromEvent(recovering, session('b', 'session-b'), 'SIGNED_IN')
  assert.equal(switched.recovery, null)
  assert.equal(recoveryMatches(recovering.recovery, session('b', 'session-b')), false)
})
test('recovery survives token rotation only within its original session', () => {
  const recovering = authStateFromEvent({}, session('a', 'session-a'), 'PASSWORD_RECOVERY')
  assert.ok(authStateFromEvent(recovering, session('a', 'session-a'), 'TOKEN_REFRESHED').recovery)
  assert.equal(authStateFromEvent(recovering, session('a', 'new-session'), 'SIGNED_IN').recovery, null)
  assert.equal(authStateFromEvent(recovering, null, 'SIGNED_OUT').recovery, null)
})
test('password recovery never sends a password with a replacement account token', async () => {
  const a = session('a', 'session-a')
  const b = session('b', 'session-b')
  const recovery = authStateFromEvent({}, a, 'PASSWORD_RECOVERY').recovery
  let current = a
  let call
  const auth = { getSession: async () => ({ data: { session: current } }) }
  const config = { supabaseUrl: 'https://auth.example.test', anonKey: 'test-public-key' }
  const fetcher = async (url, init) => {
    current = b
    call = { url, init }
    return new Response('{}', { status: 200 })
  }
  await recoveryActions.updateRecoveryPassword(auth, recovery, 'synthetic-password', config, fetcher)
  assert.equal(call.url, 'https://auth.example.test/auth/v1/user')
  assert.equal(call.init.headers.Authorization, `Bearer ${a.access_token}`)
  assert.equal(call.init.method, 'PUT')
  assert.equal(call.init.redirect, 'error')
  assert.deepEqual(JSON.parse(call.init.body), { password: 'synthetic-password' })
  call = null
  await assert.rejects(recoveryActions.updateRecoveryPassword(auth, recovery, 'synthetic-password', config, fetcher), { name: 'AbortError' })
  assert.equal(call, null)
})
test('membership revoked during selected bootstrap clears selection and reloads once', async () => {
  const org = '10000000-0000-4000-8000-000000000001'
  const calls = []
  const api = {
    setScope: () => {},
    request: async (path, options) => {
      calls.push(options)
      if (calls.length === 1) return { memberships: [{ organization_id: org, branch_id: null }], context: null }
      if (calls.length === 2) throw { status: 403, detail: 'Not a member of this organization' }
      return { memberships: [], context: null }
    },
  }
  const result = await bootstrapTenant(api, 'a', { organizationId: org })
  assert.equal(calls.length, 3)
  assert.deepEqual(calls[2], { tenant: false })
  assert.deepEqual(result.selected, { organizationId: null, branchId: null })
  assert.equal(result.accessChanged, true)
})
