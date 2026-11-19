import { resolveSelection } from './selection.js'

export const isMembershipDenial = error => error.status === 403 && ['No active organization membership', 'Not a member of this organization'].includes(error.detail)

export async function bootstrapTenant(api, userId, stored) {
  api.setScope({ userId })
  let data = await api.request('/auth/me', { tenant: false })
  let selected = resolveSelection(data.memberships, stored)
  let accessChanged = Boolean(stored.organizationId && !data.memberships.some(m => m.organization_id === stored.organizationId))
  api.setScope({ userId, ...selected })
  if (selected.organizationId && (data.context?.organization_id !== selected.organizationId || data.context?.branch_id !== selected.branchId)) {
    try { data = await api.request('/auth/me') }
    catch (error) {
      if (!isMembershipDenial(error)) throw error
      accessChanged = true
      api.setScope({ userId })
      data = await api.request('/auth/me', { tenant: false })
      selected = data.context ? { organizationId: data.context.organization_id, branchId: data.context.branch_id } : { organizationId: null, branchId: null }
      api.setScope({ userId, ...selected })
    }
  }
  return { data, selected, accessChanged }
}
