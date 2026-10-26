import { useState, type FormEvent } from 'react'
import { logIn, register } from '../api'
import { useAuth } from '../auth'

type Mode = 'login' | 'register'

/** Login and registration forms, shown until the user has a session. */
export function AuthPage() {
  const { startSession } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const isRegister = mode === 'register'

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isRegister && password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await (isRegister ? register : logIn)(email, password)
      startSession({ token: res.access_token, user: res.user })
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setPassword('')
    setConfirm('')
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h1>Wind Forecast Monitor</h1>
        <p className="subtitle">GB wind forecast accuracy for day-ahead trading.</p>

        <h2 className="auth-title">{isRegister ? 'Create an account' : 'Log in'}</h2>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="control-label">Email</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="control-label">Password</span>
            <input
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              minLength={isRegister ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {isRegister && <span className="control-help">At least 8 characters</span>}
          </label>
          {isRegister && (
            <label className="field">
              <span className="control-label">Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          )}

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'}
          </button>
        </form>

        <p className="auth-switch">
          {isRegister ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" className="link-button" onClick={() => switchMode(isRegister ? 'login' : 'register')}>
            {isRegister ? 'Log in' : 'Create an account'}
          </button>
        </p>
      </div>
    </div>
  )
}
