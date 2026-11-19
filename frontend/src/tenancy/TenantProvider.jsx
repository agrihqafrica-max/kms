import { useCallback, useEffect, useState } from 'react'
import { TenantContext } from './context.js'
import { api } from '../lib/supabase.js'
import { useAuth } from '../auth/context.js'
import { readSelection, resolveSelection, storeSelection } from './selection.js'
import { BRANCHES, COMPANIES } from '../lib/workspaceContext.js'

const CUSTOM_ORGS_PREFIX = 'kms.customOrgs.'

function readCustomOrgs(userId) {
  try {
    const raw = localStorage.getItem(`${CUSTOM_ORGS_PREFIX}${userId}`)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeCustomOrgs(userId, rows) {
  try {
    localStorage.setItem(`${CUSTOM_ORGS_PREFIX}${userId}`, JSON.stringify(rows))
  } catch {
    // ignore storage errors
  }
}

function buildMemberships(userId) {
  const rows = []
  for (const company of COMPANIES) {
    const companyBranches = BRANCHES.filter(b => b.organizationId === company.id)
    for (const branch of companyBranches) {
      rows.push({
        organization_id: company.id,
        organization_name: company.name,
        org_type: company.type,
        branch_id: branch.id,
        branch_name: branch.name,
        area: branch.area,
        role: company.role,
      })
    }
  }
  const custom = readCustomOrgs(userId)
  for (const item of custom) {
    rows.push(item)
  }
  return rows
}

export default function TenantProvider({ children }) {
  const { session } = useAuth()
  const userId = session.user.id
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState(() => {
    const memberships = buildMemberships(userId)
    const saved = readSelection(userId)
    const selected = resolveSelection(memberships, saved.organizationId ? saved : { organizationId: 'org-kenyamotor', branchId: 'branch-cbd' })
    const match =
      memberships.find(
        m => m.organization_id === selected.organizationId && (!selected.branchId || m.branch_id === selected.branchId),
      ) || memberships[0]
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
    const memberships = buildMemberships(userId)
    const saved = readSelection(userId)
    const selected = resolveSelection(memberships, saved.organizationId ? saved : { organizationId: 'org-kenyamotor', branchId: 'branch-cbd' })
    const match =
      memberships.find(
        m => m.organization_id === selected.organizationId && (!selected.branchId || m.branch_id === selected.branchId),
      ) || memberships[0]
    storeSelection(userId, { organizationId: match.organization_id, branchId: match.branch_id })
    api.setScope({ userId, organizationId: match.organization_id, branchId: match.branch_id })
  }, [userId])

  const choose = useCallback(
    (organizationId, branchId = null) => {
      const memberships = buildMemberships(userId)
      const resolved = resolveSelection(memberships, { organizationId, branchId })
      const match =
        memberships.find(
          m => m.organization_id === resolved.organizationId && (!resolved.branchId || m.branch_id === resolved.branchId),
        ) || memberships[0]
      storeSelection(userId, { organizationId: match.organization_id, branchId: match.branch_id })
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
    [userId],
  )

  const addOrganization = useCallback(
    ({ organizationId, organizationName, orgType = 'RETAIL', branchId, branchName, area = 'Kenya' }) => {
      const custom = readCustomOrgs(userId)
      const newRow = {
        organization_id: organizationId,
        organization_name: organizationName,
        org_type: orgType,
        branch_id: branchId,
        branch_name: branchName,
        area,
        role: 'owner',
      }
      const nextCustom = [...custom.filter(r => r.organization_id !== organizationId), newRow]
      writeCustomOrgs(userId, nextCustom)
      choose(organizationId, branchId)
    },
    [userId, choose],
  )

  return (
    <TenantContext.Provider value={{ ...state, choose, addOrganization, reload: () => setRevision(r => r + 1), revision }}>
      {children}
    </TenantContext.Provider>
  )
}
