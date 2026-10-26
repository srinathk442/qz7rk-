// Types mirror the dataclasses returned by backend/app/main.py.

export interface ErrorMetrics {
  count: number
  mae: number
  rmse: number
  bias: number
  mape: number | null
  p50_abs_error: number
  p90_abs_error: number
  max_abs_error: number
}

export interface SeriesPoint {
  start_time: string
  actual: number | null
  forecast: number | null
  publish_time: string | null
}

export interface Analysis {
  horizon_hours: number
  start: string
  end: string
  points: SeriesPoint[]
  metrics: ErrorMetrics | null
  coverage: { target_hours: number; forecast_hours: number }
}

export interface HorizonMetrics {
  horizon_hours: number
  metrics: ErrorMetrics | null
}

export interface ForecastRun {
  as_of: string
  publish_time: string | null
  points: { start_time: string; forecast: number; actual: number | null }[]
}

export function analysisUrl(horizon: number, start: string, end: string): string {
  const params = new URLSearchParams({ horizon: String(horizon), start, end })
  return `/api/analysis?${params}`
}

export const HORIZON_CURVE_URL = '/api/horizon-curve'

export function forecastRunUrl(asOf: string): string {
  return `/api/forecast-run?${new URLSearchParams({ as_of: asOf })}`
}

// Auth: types mirror backend/app/auth.py.

export interface AuthUser {
  id: number
  email: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  user: AuthUser
}

/** A readable message from a FastAPI error response. Validation errors (422) carry a list. */
export async function errorMessage(res: Response): Promise<string> {
  const detail = (await res.json().catch(() => null))?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length > 0) {
    return detail.map((d: { loc: string[]; msg: string }) => `${d.loc[d.loc.length - 1]}: ${d.msg}`).join('; ')
  }
  return `Request failed (${res.status})`
}

async function postCredentials<T>(url: string, email: string, password: string): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  return res.json()
}

export const logIn = (email: string, password: string) =>
  postCredentials<TokenResponse>('/api/auth/login', email, password)

/** Creates the account only; the user then logs in. */
export const register = (email: string, password: string) =>
  postCredentials<AuthUser>('/api/auth/register', email, password)
