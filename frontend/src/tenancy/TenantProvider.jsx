import { useCallback, useEffect, useState } from 'react'
import { TenantContext } from './context.js'
import { api } from '../lib/supabase.js'
import { useAuth } from '../auth/context.js'
import { readSelection, resolveSelection, storeSelection } from './selection.js'

const ORG_ID = 'org-kenyamoto'

function buildMemberships() {
  return [
    {
      organization_id: ORG_ID,
      organization_name: 'KenyaMoto Nairobi Hub',
      branch_id: 'branch-cbd',
      branch_name: 'Nairobi CBD Branch',
      role: 'owner',
    },
    {
      organization_id: ORG_ID,
      organization_name: 'KenyaMoto Nairobi Hub',
      branch_id: 'branch-ind',
      branch_name: 'Industrial Area Depot',
      role: 'owner',
    },
  ]
}

export default function TenantProvider({ children }) {
  const { session } = useAuth()
  const userId = session.user.id
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState(() => {
    const memberships = buildMemberships()
    const saved = readSelection(userId)
    const selected = resolveSelection(memberships, saved)
    const match = memberships.find(m => m.branch_id === selected.branchId) || memberships[0]
    api.setScope({ userId, organizationId: match.organization_id, branchId: match.branch_id })
    return {
      loading: false,
      data: {
        memberships,
        context: {
          organization_id: match.organization_id,
          organization_name: match.organization_name,
          branch_id: match.branch_id,
          role: match.role,
          org_wide: false,
          staff_user_id: userId,
        },
      },
      error: null,
      notice: '',
      pickerOptions: null,
    }
  })

  useEffect(() => {
    const memberships = buildMemberships()
    const saved = readSelection(userId)
    const selected = resolveSelection(memberships, saved)
    const match = memberships.find(m => m.branch_id === selected.branchId) || memberships[0]
    storeSelection(userId, { organizationId: match.organization_id, branchId: match.branch_id })
    api.setScope({ userId, organizationId: match.organization_id, branchId: match.branch_id })
  }, [userId])

  const choose = useCallback(
    (organizationId, branchId = null) => {
      const memberships = state.data?.memberships ?? buildMemberships()
      const resolved = resolveSelection(memberships, { organizationId, branchId })
      const match =
        memberships.find(
          m => m.organization_id === resolved.organizationId && (!resolved.branchId || m.branch_id === resolved.branchId),
        ) || memberships[0]
      storeSelection(userId, resolved)
      api.setScope({ userId, organizationId: match.organization_id, branchId: match.branch_id })
      setRevision(r => r + 1)
      setState(prev => ({
        ...prev,
        data: {
          memberships,
          context: {
            organization_id: match.organization_id,
            organization_name: match.organization_name,
            branch_id: match.branch_id,
            role: match.role,
            org_wide: !match.branch_id,
            staff_user_id: userId,
          },
        },
      }))
    },
    [state.data?.memberships, userId],
  )

  return (
    <TenantContext.Provider value={{ ...state, choose, reload: () => setRevision(r => r + 1), revision }}>
      {children}
    </TenantContext.Provider>
  )
}
