import { createClient } from '@supabase/supabase-js'
import { config } from './env.js'
import { createApiClient } from './apiClient.js'

export const supabase = config.errors.length ? null : createClient(config.supabaseUrl, config.anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
export const api = supabase ? createApiClient({ baseUrl: config.apiUrl, auth: supabase.auth }) : null
