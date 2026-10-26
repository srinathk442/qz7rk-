import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type Session } from '../auth'

const STORAGE_KEY = 'wind-forecast-monitor.session'

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(loadSession)

  // Logging in or out in one tab applies to the others.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSession(loadSession())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const startSession = useCallback((next: Session) => {
    saveSession(next)
    setSession(next)
  }, [])

  const endSession = useCallback(() => {
    saveSession(null)
    setSession(null)
  }, [])

  const value = useMemo(() => ({ session, startSession, endSession }), [session, startSession, endSession])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
