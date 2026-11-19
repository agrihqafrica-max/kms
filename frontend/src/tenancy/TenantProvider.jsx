import { useCallback, useEffect, useRef, useState } from 'react'
import { TenantContext } from './context.js'
import { api } from '../lib/supabase.js'
import { useAuth } from '../auth/context.js'
import { readSelection, resolveSelection, storeSelection } from './selection.js'
import { t } from '../i18n/index.js'
import { bootstrapTenant } from './bootstrap.js'

export default function TenantProvider({ children }) {
  const { session } = useAuth()
  const userId = session.user.id
  const [state, setState] = useState({ loading: true, data: null, error: null, notice: '', pickerOptions: null })
  const generation = useRef(0)
  const loading = useRef(false)
  const pendingSelection = useRef(null)

  const load = useCallback(async (selection = readSelection(userId), notice = '') => {
    const run = ++generation.current
    loading.current = true
    try {
      const { data, selected, accessChanged } = await bootstrapTenant(api, userId, selection)
      if (run !== generation.current) return
      storeSelection(userId, selected)
      const next = { loading: false, data, error: null, notice: accessChanged ? t('accessChanged') : notice, pickerOptions: null }
      return { run, state: next }
    } catch (error) {
      if (run !== generation.current || error.name === 'AbortError') return
      return { run, state: { loading: false, data: null, error, notice, pickerOptions: null } }
    } finally {
      if (run === generation.current) loading.current = false
    }
  }, [userId])

  const commit = useCallback(result => {
    if (!result || result.run !== generation.current) return
    setState(result.state)
    if (result.state.error) pendingSelection.current?.reject(result.state.error)
    else pendingSelection.current?.resolve()
    pendingSelection.current = null
  }, [])

  const beginLoad = useCallback((selection, notice = '') => {
    setState({ loading: true, data: null, error: null, notice, pickerOptions: null })
    return load(selection, notice).then(commit)
  }, [load, commit])

  useEffect(() => {
    void load().then(commit)
    api.setHandlers({
      onMembershipChanged: () => {
        storeSelection(userId, {})
        if (loading.current) return
        void beginLoad({}, t('accessChanged'))
      },
      onBranchMissing: () => {
        if (!loading.current) void beginLoad({ organizationId: api.getScope().organizationId })
      },
      onSelectionRequired: options => {
        if (pendingSelection.current) return pendingSelection.current.promise
        let resolve, reject
        const promise = new Promise((yes, no) => { resolve = yes; reject = no })
        pendingSelection.current = { promise, resolve, reject }
        setState(previous => ({ ...previous, pickerOptions: options, data: previous.data ? { ...previous.data, context: null } : null }))
        return promise
      },
    })
    const invalidate = () => { generation.current++ }
    return () => {
      invalidate()
      pendingSelection.current?.reject(new DOMException('Selection cancelled', 'AbortError'))
      pendingSelection.current = null
      api.setHandlers({ onMembershipChanged: null, onBranchMissing: null, onSelectionRequired: null })
    }
  }, [load, beginLoad, commit, userId])

  const choose = (organizationId, branchId = null) => {
    const memberships = state.data?.memberships ?? []
    if (!memberships.some(m => m.organization_id === organizationId)) return
    void beginLoad(resolveSelection(memberships, { organizationId, branchId }))
  }
  return <TenantContext.Provider value={{ ...state, choose, reload: () => beginLoad(), revision: api.getScope().revision }}>{children}</TenantContext.Provider>
}
