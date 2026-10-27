import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, SESSION_EXPIRED, type Session } from '../auth'

const STORAGE_KEY = 'wind-forecast-monitor.session'
// setTimeout cannot wait longer than this (~24.8 days); longer sessions rely on the server's 401.
const MAX_TIMER_MS = 2 ** 31 - 1

interface State {
  session: Session | null
  endReason: string | null
}

function isExpired(session: Session): boolean {
  return session.expiresAt !== undefined && session.expiresAt <= Date.now()
}

// Storage can be unavailable (private windows, blocked site data); the app then
// still works, but the session lasts only until the page is reloaded.
function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // See loadSession.
  }
}

function initialState(): State {
  const session = loadSession()
  if (session && isExpired(session)) {
    saveSession(null)
    return { session: null, endReason: SESSION_EXPIRED }
  }
  return { session, endReason: null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [{ session, endReason }, setState] = useState(initialState)

  const startSession = useCallback((next: Session) => {
    saveSession(next)
    setState({ session: next, endReason: null })
  }, [])

  const endSession = useCallback((reason?: string) => {
    saveSession(null)
    setState({ session: null, endReason: reason ?? null })
  }, [])

  // Logging in or out in one tab applies to the others.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setState({ session: loadSession(), endReason: null })
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // End the session when the token expires, rather than on the next failed request.
  useEffect(() => {
    if (session?.expiresAt === undefined) return
    const ms = session.expiresAt - Date.now()
    if (ms > MAX_TIMER_MS) return
    const id = setTimeout(() => endSession(SESSION_EXPIRED), Math.max(ms, 0))
    return () => clearTimeout(id)
  }, [session, endSession])

  const value = useMemo(
    () => ({ session, endReason, startSession, endSession }),
    [session, endReason, startSession, endSession],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
