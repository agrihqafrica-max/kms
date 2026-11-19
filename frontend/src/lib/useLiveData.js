import { useEffect, useState } from 'react'
import { api } from './supabase.js'
import { ApiError } from './apiClient.js'
import { t } from '../i18n/index.js'
import { useTenant } from '../tenancy/context.js'

export function useLiveData(path) {
  const { revision } = useTenant()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({})
  const key = `${revision}:${path}:${attempt}`
  useEffect(() => {
    const reload = () => setAttempt(n => n + 1)
    window.addEventListener('online', reload)
    window.addEventListener('offline', reload)
    window.addEventListener('kms:reconnect', reload)
    return () => {
      window.removeEventListener('online', reload)
      window.removeEventListener('offline', reload)
      window.removeEventListener('kms:reconnect', reload)
    }
  }, [])
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    const unavailable = () => {
      controller.abort()
      setState({ key, error: new ApiError(0, t('networkError')) })
    }
    window.addEventListener('kms:unavailable', unavailable)
    api.request(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setState({ key, data })
    }).catch(error => {
      if (error.name !== 'AbortError' && !controller.signal.aborted) setState({ key, error })
    })
    return () => { controller.abort(); window.removeEventListener('kms:unavailable', unavailable) }
  }, [path, key])
  return { ...(state.key === key ? state : { loading: true }), retry: () => setAttempt(n => n + 1) }
}
