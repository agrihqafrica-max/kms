import { createContext, useContext } from 'react'
export const TenantContext = createContext(null)
export const useTenant = () => useContext(TenantContext)
