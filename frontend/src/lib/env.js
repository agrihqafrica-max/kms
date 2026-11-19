export function validateConfig(env) {
  const errors = []
  const names = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_API_BASE_URL']
  for (const name of names) {
    const value = env[name]?.trim()
    if (!value) { errors.push(name); continue }
    if (name.endsWith('_URL')) {
      try {
        const url = new URL(value)
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        if (url.username || url.password || url.search || url.hash || !(url.protocol === 'https:' || (url.protocol === 'http:' && local))) errors.push(name)
      } catch { errors.push(name) }
    } else if (value.startsWith('sb_secret_')) errors.push(name)
    else if (value.split('.').length === 3) {
      try {
        const claims = JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        if (claims.role !== 'anon') errors.push(name)
      } catch { errors.push(name) }
    }
  }
  if (errors.length) return { errors }
  return { errors, supabaseUrl: env.VITE_SUPABASE_URL.trim().replace(/\/$/, ''), anonKey: env.VITE_SUPABASE_ANON_KEY.trim(), apiUrl: env.VITE_API_BASE_URL.trim().replace(/\/$/, '') }
}

export const config = validateConfig(import.meta.env ?? {})
