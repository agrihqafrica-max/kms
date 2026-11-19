import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveSelection } from '../src/tenancy/selection.js'
import { validateConfig } from '../src/lib/env.js'
import { formatMoney, nairobiDay } from '../src/lib/format.js'
const orgA = '10000000-0000-4000-8000-000000000001'
const orgB = '10000000-0000-4000-8000-000000000002'
const branchA = '20000000-0000-4000-8000-000000000001'
const branchB = '20000000-0000-4000-8000-000000000002'
const rows = [{ organization_id: orgA, branch_id: branchA }, { organization_id: orgB, branch_id: branchB }]

test('multi-org users are not silently assigned a tenant', () => {
  assert.deepEqual(resolveSelection(rows, {}), { organizationId: null, branchId: null })
})
test('stale and cross-tenant persisted branches are discarded', () => {
  assert.deepEqual(resolveSelection(rows, { organizationId: orgA, branchId: branchB }), { organizationId: orgA, branchId: branchA })
  assert.deepEqual(resolveSelection(rows, { organizationId: 'unknown', branchId: branchB }), { organizationId: null, branchId: null })
})
test('valid persisted membership survives; org-wide membership invents no branches', () => {
  assert.deepEqual(resolveSelection(rows, { organizationId: orgB, branchId: branchB }), { organizationId: orgB, branchId: branchB })
  assert.deepEqual(resolveSelection([{ organization_id: orgA, branch_id: null }], {}), { organizationId: orgA, branchId: null })
})
test('configuration rejects missing or unsafe URL values, reporting names only', () => {
  const bad = validateConfig({ VITE_SUPABASE_URL: 'javascript:secret', VITE_SUPABASE_ANON_KEY: 'public', VITE_API_BASE_URL: 'https://user:private@host.invalid' })
  assert.deepEqual(bad.errors, ['VITE_SUPABASE_URL', 'VITE_API_BASE_URL'])
  assert.equal(JSON.stringify(bad).includes('private'), false)
  assert.equal(validateConfig({}).errors.length, 3)
})
test('money keeps decimal precision and dates use Nairobi', () => {
  assert.match(formatMoney('7850.00'), /7,850\.00/)
  assert.match(formatMoney('9007199254740993.25'), /9,007,199,254,740,993\.25/)
  assert.equal(nairobiDay(new Date('2026-11-18T22:00:00Z')), '2026-11-19')
})
