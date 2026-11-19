import { createContext, useContext } from 'react'

export const COMPANIES = [
  { id: 'org-kenyamotor', name: 'Kenya Motor', type: 'RETAIL', role: 'owner' },
  { id: 'org-kirinyaga', name: 'Kirinyaga Spares & Workshop', type: 'MECHANIC', role: 'owner' },
  { id: 'org-riftvalley', name: 'Rift Valley Boda Parts', type: 'WHOLESALER', role: 'owner' },
]

export const BRANCHES = [
  { id: 'branch-cbd', organizationId: 'org-kenyamotor', name: 'Kenya Motor — Nairobi CBD Shop', area: 'Kirinyaga Road, Nairobi' },
  { id: 'branch-ind', organizationId: 'org-kenyamotor', name: 'Kenya Motor — Industrial Area Depot', area: 'Enterprise Road, Industrial Area' },
  { id: 'branch-kir-main', organizationId: 'org-kirinyaga', name: 'Kirinyaga Rd Counter & Workshop', area: 'Kirinyaga Road, Nairobi' },
  { id: 'branch-ngara', organizationId: 'org-kirinyaga', name: 'Ngara Boda Service Bay', area: 'Ngara Road, Nairobi' },
  { id: 'branch-nakuru', organizationId: 'org-riftvalley', name: 'Nakuru Main Shop', area: 'Kenyatta Avenue, Nakuru' },
  { id: 'branch-eldoret', organizationId: 'org-riftvalley', name: 'Eldoret Spares Depot', area: 'Uganda Road, Eldoret' },
]

export function getBranchesForOrganization(organizationId, allBranches = BRANCHES) {
  const scoped = allBranches.filter(b => b.organizationId === organizationId)
  return scoped.length ? scoped : allBranches
}

export const WorkspaceContext = createContext(null)

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
