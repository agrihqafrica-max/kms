function sessionIdentity(session) {
  if (!session) return null
  try {
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload)).session_id ?? session.access_token
  } catch { return session.access_token }
}

export async function updateRecoveryPassword(auth, recovery, password, config, fetcher = fetch) {
  const { data, error } = await auth.getSession()
  if (error || !recoveryMatches(recovery, data.session)) throw new DOMException('Recovery session changed', 'AbortError')
  // Bind the mutation to this token rather than the SDK's mutable current session.
  const response = await fetcher(`${config.supabaseUrl}/auth/v1/user`, {
    method: 'PUT', redirect: 'error',
    headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: config.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return { error: response.ok ? null : { status: response.status } }
}

export function recoveryMatches(recovery, session) {
  return Boolean(recovery && session && recovery.userId === session.user.id && recovery.sessionId === sessionIdentity(session))
}

export function authStateFromEvent(previous, session, event) {
  const recovery = event === 'PASSWORD_RECOVERY' && session
    ? { userId: session.user.id, sessionId: sessionIdentity(session) }
    : recoveryMatches(previous.recovery, session) ? previous.recovery : null
  return { ...previous, session, loading: false, recovery }
}
