import { useMemo, useState } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { forecastRunUrl, type ForecastRun, type HorizonMetrics } from '../api'
import { formatCompact, formatDateTime, formatDay, formatMW, formatSignedMW, niceTicks } from '../format'
import { useFetch } from '../hooks'
import { legendProps } from './legend'
import { TooltipRow } from './SeriesChart'
import { Tile } from './StatTiles'

const HOUR_MS = 3600 * 1000
const DAY_MS = 24 * HOUR_MS

interface Row {
  t: number
  forecast: number
  actual: number | null
  band: [number, number]
  hoursAhead: number
}

export function DecisionView({ curve }: { curve: HorizonMetrics[] }) {
  // A datetime-local value has no zone; we treat it as UTC (= UK time in January).
  const [decisionLocal, setDecisionLocal] = useState('2026-01-14T09:00')
  const asOf = `${decisionLocal}:00Z`
  const { data: run, error, loading } = useFetch<ForecastRun>(forecastRunUrl(asOf))

  const p90ByHorizon = useMemo(() => new Map(curve.map((c) => [c.horizon_hours, c.metrics])), [curve])

  const deliveryStart = Math.floor(Date.parse(asOf) / DAY_MS) * DAY_MS + DAY_MS
  const deliveryEnd = deliveryStart + DAY_MS

  const rows = useMemo<Row[]>(() => {
    if (!run?.publish_time) return []
    const published = Date.parse(run.publish_time)
    return run.points.map((p) => {
      const t = Date.parse(p.start_time)
      const hoursAhead = (t - published) / HOUR_MS
      const p90 = p90ByHorizon.get(Math.min(48, Math.round(hoursAhead)))?.p90_abs_error ?? 0
      return { t, forecast: p.forecast, actual: p.actual, band: [p.forecast - p90, p.forecast + p90], hoursAhead }
    })
  }, [run, p90ByHorizon])

  const yTicks = niceTicks(Math.max(0, ...rows.map((r) => Math.max(r.band[1], r.actual ?? 0))))
  const delivery = rows.filter((r) => r.t >= deliveryStart && r.t < deliveryEnd)
  const typicalHorizon = delivery.length ? Math.round(delivery[Math.floor(delivery.length / 2)].hoursAhead) : null
  const bias = typicalHorizon !== null ? p90ByHorizon.get(Math.min(48, typicalHorizon))?.bias : undefined

  return (
    <div className={loading ? 'is-loading' : undefined}>
      <div className="decision-controls">
        <label className="control">
          <span className="control-label">Decision time (UK)</span>
          <input
            type="datetime-local"
            min="2025-12-31T00:00"
            max="2026-01-30T23:30"
            step={1800}
            value={decisionLocal}
            onChange={(e) => e.target.value && setDecisionLocal(e.target.value)}
          />
        </label>
        {run?.publish_time && (
          <p className="decision-run">
            Latest forecast available: published <strong>{formatDateTime(run.publish_time)}</strong> (
            {((Date.parse(asOf) - Date.parse(run.publish_time)) / HOUR_MS).toFixed(1)}h before decision)
          </p>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      {delivery.length > 0 && (
        <div className="tiles">
          <Tile
            small
            label={`Forecast for ${formatDay(deliveryStart)}, average`}
            value={formatMW(avg(delivery.map((r) => r.forecast)))}
          />
          <Tile
            small
            label="Forecast range"
            value={`${formatMW(Math.min(...delivery.map((r) => r.forecast)))} – ${formatMW(Math.max(...delivery.map((r) => r.forecast)))}`}
          />
          <Tile
            small
            label="Uncertainty (90% of hours)"
            value={`± ${formatMW(avg(delivery.map((r) => (r.band[1] - r.band[0]) / 2)))}`}
          />
          {bias !== undefined && (
            <Tile
              small
              label={`January bias at ~${typicalHorizon}h ahead`}
              value={formatSignedMW(bias)}
              note={bias > 0 ? 'Forecasts ran high: consider buying extra cover' : 'Forecasts ran low'}
            />
          )}
        </div>
      )}

      {rows.length > 0 ? (
        <div className="chart" style={{ height: 320 }}>
          <ResponsiveContainer>
            <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--grid)" />
              <ReferenceArea
                x1={deliveryStart}
                x2={deliveryEnd - HOUR_MS}
                fill="var(--hover-wash)"
                label={{ value: 'Delivery day', position: 'insideTop', fill: 'var(--text-secondary)', fontSize: 12 }}
              />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                ticks={rows.filter((r) => r.t % (DAY_MS / 2) === 0).map((r) => r.t)}
                tickFormatter={formatDateTime}
                stroke="var(--axis)"
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
              />
              <YAxis
                domain={[0, yTicks[yTicks.length - 1]]}
                ticks={yTicks}
                tickFormatter={formatCompact}
                stroke="var(--axis)"
                tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                width={44}
              />
              <Tooltip
                cursor={{ stroke: 'var(--axis)' }}
                content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as Row | undefined
                  if (!active || !row) return null
                  return (
                    <div className="tooltip">
                      <div className="tooltip-title">{formatDateTime(row.t)}</div>
                      <TooltipRow color="var(--series-forecast)" label="Forecast" value={row.forecast} />
                      <div className="tooltip-note">
                        90% range {formatMW(row.band[0])} – {formatMW(row.band[1])} ({row.hoursAhead.toFixed(1)}h ahead)
                      </div>
                      <TooltipRow color="var(--series-actual)" label="Actual (hindsight)" value={row.actual} />
                    </div>
                  )
                }}
              />
              <Legend {...legendProps} />
              <Area
                name="90% uncertainty range"
                dataKey="band"
                stroke="none"
                fill="var(--series-forecast)"
                fillOpacity={0.12}
                isAnimationActive={false}
              />
              <Line
                name="Forecast"
                dataKey="forecast"
                stroke="var(--series-forecast)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
              <Line
                name="Actual (hindsight)"
                dataKey="actual"
                stroke="var(--series-actual)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        !loading && <p className="empty">No forecast had been published by this time.</p>
      )}
      <p className="footnote">
        Uncertainty range = forecast ± the P90 error observed at the same horizon across January 2026 (in-sample).
        Actuals are shown for hindsight only; they were not known at decision time.
      </p>
    </div>
  )
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
