import { createClient } from '@supabase/supabase-js'
import { config } from './env.js'
import { createApiClient } from './apiClient.js'
import { createMockSupabase } from './mockAuth.js'

export function resolveApiBaseUrl(apiUrl, mockMode = config.errors.length > 0) {
  if (mockMode || !apiUrl) return ''
  try {
    const parsed = new URL(apiUrl)
    const isLoopback = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
    if (isLoopback && parsed.port === '8000') return ''
    if (typeof window !== 'undefined' && isLoopback && !['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname)) {
      return ''
    }
  } catch {
    return ''
  }
  return apiUrl
}

export const isMockMode = config.errors.length > 0
export const apiBaseUrl = resolveApiBaseUrl(config.apiUrl, isMockMode)
export const supabase = isMockMode
  ? createMockSupabase()
  : createClient(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
export const api = createApiClient({
  baseUrl: apiBaseUrl,
  auth: supabase.auth,
})
