import { useMemo } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SeriesPoint } from '../api'
import { formatCompact, formatDateTime, formatDay, formatMW, formatSignedMW, niceTicks } from '../format'
import { legendProps } from './legend'

interface Row {
  t: number
  actual: number | null
  forecast: number | null
  publishTime: string | null
}

const DAY_MS = 24 * 3600 * 1000

export function SeriesChart({ points }: { points: SeriesPoint[] }) {
  const rows = useMemo<Row[]>(
    () =>
      points.map((p) => ({
        t: Date.parse(p.start_time),
        actual: p.actual,
        forecast: p.forecast,
        publishTime: p.publish_time,
      })),
    [points],
  )

  const { ticks, format } = useMemo(() => timeTicks(rows), [rows])
  const yTicks = useMemo(() => niceTicks(Math.max(0, ...rows.map((r) => Math.max(r.actual ?? 0, r.forecast ?? 0)))), [rows])

  return (
    <>
      <div className="chart" style={{ height: 340 }}>
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={['dataMin', 'dataMax']}
              ticks={ticks}
              tickFormatter={format}
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
              content={({ active, payload }) => (
                <SeriesTooltip active={active} row={payload?.[0]?.payload as Row | undefined} />
              )}
              cursor={{ stroke: 'var(--axis)' }}
            />
            <Legend {...legendProps} />
            <Line
              name="Actual generation"
              dataKey="actual"
              stroke="var(--series-actual)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              name="Forecast"
              dataKey="forecast"
              stroke="var(--series-forecast)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="table-view">
        <summary>Show data table</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Actual</th>
                <th>Forecast</th>
                <th>Error</th>
                <th>Forecast published</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => r.forecast !== null)
                .map((r) => (
                  <tr key={r.t}>
                    <td>{formatDateTime(r.t)}</td>
                    <td>{r.actual !== null ? formatMW(r.actual) : '—'}</td>
                    <td>{formatMW(r.forecast!)}</td>
                    <td>{r.actual !== null ? formatSignedMW(r.forecast! - r.actual) : '—'}</td>
                    <td>{r.publishTime ? formatDateTime(r.publishTime) : '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}

function SeriesTooltip({ active, row }: { active?: boolean; row?: Row }) {
  if (!active || !row) return null
  const error = row.actual !== null && row.forecast !== null ? row.forecast - row.actual : null

  return (
    <div className="tooltip">
      <div className="tooltip-title">{formatDateTime(row.t)}</div>
      <TooltipRow color="var(--series-actual)" label="Actual" value={row.actual} />
      <TooltipRow color="var(--series-forecast)" label="Forecast" value={row.forecast} />
      {error !== null && (
        <div className="tooltip-row">
          <span className="tooltip-key" />
          <span>Error</span>
          <strong>{formatSignedMW(error)}</strong>
        </div>
      )}
      {row.publishTime && <div className="tooltip-note">Forecast published {formatDateTime(row.publishTime)}</div>}
      {row.forecast === null && <div className="tooltip-note">Forecasts are hourly; no forecast for :30</div>}
    </div>
  )
}

export function TooltipRow({ color, label, value }: { color: string; label: string; value: number | null }) {
  return (
    <div className="tooltip-row">
      <span className="tooltip-key" style={{ background: color }} />
      <span>{label}</span>
      <strong>{value !== null ? formatMW(value) : '—'}</strong>
    </div>
  )
}

/** Daily ticks (thinned for long ranges), or 6-hourly ticks for ranges of two days or less. */
function timeTicks(rows: Row[]): { ticks: number[]; format: (t: number) => string } {
  if (rows.length === 0) return { ticks: [], format: formatDay }
  const first = rows[0].t
  const last = rows[rows.length - 1].t
  const days = (last - first) / DAY_MS

  const stepMs = days <= 2 ? DAY_MS / 4 : (days > 14 ? 3 : days > 7 ? 2 : 1) * DAY_MS
  const ticks = []
  for (let t = Math.ceil(first / stepMs) * stepMs; t <= last; t += stepMs) ticks.push(t)
  return { ticks, format: days <= 2 ? formatDateTime : formatDay }
}
