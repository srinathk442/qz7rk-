import { createContext, useContext } from 'react'
import type { AuthUser } from './api'

export interface Session {
  token: string
  user: AuthUser
}

export interface AuthState {
  session: Session | null
  startSession: (session: Session) => void
  endSession: () => void
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const auth = useContext(AuthContext)
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>')
  return auth
}
