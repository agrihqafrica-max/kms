import { t } from '../i18n/index.js'

export class ApiError extends Error {
  constructor(status, message, detail) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

const cancelled = () => new DOMException('Request context changed', 'AbortError')

export function createApiClient({ baseUrl, auth, fetcher = fetch }) {
  let scope = { revision: 0 }
  let handlers = {}
  let refreshFlight = null
  let authGeneration = 0
  let expired = false

  function setScope(next) {
    if (next.userId !== scope.userId) { expired = false; authGeneration++ }
    scope = { ...next, revision: scope.revision + 1 }
  }

  function expire() {
    if (!expired) {
      expired = true
      handlers.onExpired?.()
    }
    throw new ApiError(401, t('sessionExpired'))
  }

  async function request(path, { tenant = true, signal } = {}) {
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
      throw new Error('API path must be relative')
    }
    let snapshot = scope
    const check = () => {
      if (signal?.aborted || snapshot.revision !== scope.revision) throw cancelled()
    }
    let { data: { session } } = await auth.getSession()
    check()
    if (!session || expired) return expire()
    const userId = session.user.id
    const checkIdentity = current => {
      check()
      if (current && current.user.id !== userId) throw cancelled()
      if (scope.userId && scope.userId !== userId) throw cancelled()
    }
    checkIdentity(session)
    let refreshed = false
    let selected = false

    for (;;) {
      checkIdentity(session)
      const headers = { Authorization: `Bearer ${session.access_token}`, Accept: 'application/json' }
      if (tenant && snapshot.organizationId) headers['X-Organization-Id'] = snapshot.organizationId
      if (tenant && snapshot.branchId) headers['X-Branch-Id'] = snapshot.branchId
      let response
      try {
        response = await fetcher(`${baseUrl.replace(/\/$/, '')}${path}`, { headers, signal, redirect: 'error' })
      } catch (error) {
        check()
        if (error.name === 'AbortError') throw error
        handlers.onNetworkError?.()
        throw new ApiError(0, t('networkError'))
      }
      check()
      const body = await response.json().catch(() => null)
      check()
      if (response.ok) return body
      if (response.status === 401) {
        if (refreshed) return expire()
        refreshed = true
        const current = (await auth.getSession()).data.session
        checkIdentity(current)
        if (!current) return expire()
        if (current.access_token !== session.access_token) {
          session = current
          continue
        }
        if (refreshFlight && refreshFlight.generation !== authGeneration) {
          await refreshFlight.promise
          const latest = (await auth.getSession()).data.session
          checkIdentity(latest)
          if (!latest) return expire()
          if (latest.access_token !== session.access_token) { session = latest; continue }
        }
        if (!refreshFlight) {
          const flight = { generation: authGeneration }
          flight.promise = auth.refreshSession().catch(() => ({ error: true, data: { session: null } }))
            .finally(() => { if (refreshFlight === flight) refreshFlight = null })
          refreshFlight = flight
        }
        const result = await refreshFlight.promise
        checkIdentity(result.data?.session)
        if (result.error || !result.data?.session) {
          const latest = (await auth.getSession()).data.session
          checkIdentity(latest)
          if (!latest || latest.access_token === session.access_token) return expire()
          session = latest
        } else session = result.data.session
        continue
      }
      const detail = body?.detail
      if (response.status === 409 && detail?.code === 'organization_selection_required' && !selected && handlers.onSelectionRequired) {
        selected = true
        await handlers.onSelectionRequired(detail.organizations)
        if (scope.userId !== userId || signal?.aborted) throw cancelled()
        snapshot = scope
        session = (await auth.getSession()).data.session
        checkIdentity(session)
        if (!session) return expire()
        continue
      }
      if (response.status === 403 && ['No active organization membership', 'Not a member of this organization'].includes(detail)) {
        handlers.onMembershipChanged?.()
      }
      if (response.status === 404 && detail === 'Branch not found in this organization') handlers.onBranchMissing?.()
      const message = response.status >= 500 ? t('serverError')
        : typeof detail === 'string' ? detail.slice(0, 240) : t('requestError')
      throw new ApiError(response.status, message, response.status < 500 ? detail : undefined)
    }
  }
  return { request, setScope, getScope: () => scope, setHandlers: next => { handlers = { ...handlers, ...next } } }
}
