import { createContext, useContext } from 'react'
import type { AuthUser } from './api'

export interface Session {
  token: string
  user: AuthUser
  /** When the token expires (ms since epoch). Missing on sessions saved by older versions. */
  expiresAt?: number
}

export const SESSION_EXPIRED = 'Your session expired, please log in again.'

export interface AuthState {
  session: Session | null
  /** Why the last session ended, when the user did not log out themselves; shown on the login page. */
  endReason: string | null
  startSession: (session: Session) => void
  endSession: (reason?: string) => void
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
