import { createContext, useContext } from 'react'

export const BRANCHES = [
  { id: 'branch-cbd', name: 'Nairobi CBD Branch', area: 'Kirinyaga Road, Nairobi' },
  { id: 'branch-ind', name: 'Industrial Area Depot', area: 'Enterprise Road, Industrial Area' },
]

export const WorkspaceContext = createContext(null)

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
