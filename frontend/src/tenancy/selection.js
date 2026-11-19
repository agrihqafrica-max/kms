const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function resolveSelection(memberships, stored = {}) {
  const organizations = [...new Set(memberships.map(m => m.organization_id))]
  const organizationId = uuid.test(stored.organizationId) && organizations.includes(stored.organizationId)
    ? stored.organizationId : organizations.length === 1 ? organizations[0] : null
  const rows = memberships.filter(m => m.organization_id === organizationId)
  const branchId = uuid.test(stored.branchId) && rows.some(m => m.branch_id === stored.branchId)
    ? stored.branchId : rows.some(m => m.branch_id === null) ? null : rows[0]?.branch_id ?? null
  return { organizationId, branchId }
}

export function readSelection(userId) {
  try {
    return { organizationId: localStorage.getItem(`kms.${userId}.organizationId`), branchId: localStorage.getItem(`kms.${userId}.branchId`) }
  } catch { return {} }
}

export function storeSelection(userId, selection) {
  try {
    for (const key of ['organizationId', 'branchId']) {
      const name = `kms.${userId}.${key}`
      if (selection[key]) localStorage.setItem(name, selection[key])
      else localStorage.removeItem(name)
    }
  } catch { /* Selection remains usable in memory when browser storage is blocked. */ }
}
