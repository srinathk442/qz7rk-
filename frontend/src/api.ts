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
