import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SeriesPoint } from '../api'
import { formatCompact, formatSignedMW } from '../format'

const BIN_MW = 1000

interface Bin {
  center: number
  from: number
  to: number
  hours: number
}

/** How often the forecast missed by how much: forecast − actual, in 1 GW bins. */
export function ErrorHistogram({ points }: { points: SeriesPoint[] }) {
  const bins = useMemo(() => binErrors(points), [points])
  const total = bins.reduce((sum, b) => sum + b.hours, 0)

  return (
    <div className="chart" style={{ height: 260 }}>
      <ResponsiveContainer>
        <BarChart data={bins} margin={{ top: 8, right: 16, bottom: 16, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis
            dataKey="center"
            tickFormatter={(v: number) => (v > 0 ? `+${formatCompact(v)}` : formatCompact(v).replace('-', '−'))}
            stroke="var(--axis)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            label={{
              value: '← forecast too low   ·   forecast too high →  (MW)',
              position: 'insideBottom',
              dy: 16,
              fill: 'var(--text-muted)',
              fontSize: 12,
            }}
          />
          <YAxis
            allowDecimals={false}
            stroke="var(--axis)"
            tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
            width={44}
          />
          <ReferenceLine x={0} stroke="var(--text-secondary)" />
          <Tooltip
            cursor={{ fill: 'var(--hover-wash)' }}
            content={({ active, payload }) => {
              const bin = payload?.[0]?.payload as Bin | undefined
              if (!active || !bin) return null
              return (
                <div className="tooltip">
                  <div className="tooltip-title">
                    Error {formatSignedMW(bin.from)} to {formatSignedMW(bin.to)}
                  </div>
                  <div>
                    <strong>{bin.hours}</strong> hours ({((100 * bin.hours) / total).toFixed(1)}%)
                  </div>
                </div>
              )
            }}
          />
          <Bar dataKey="hours" fill="var(--series-mae)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function binErrors(points: SeriesPoint[]): Bin[] {
  const errors = points
    .filter((p) => p.actual !== null && p.forecast !== null)
    .map((p) => p.forecast! - p.actual!)
  if (errors.length === 0) return []

  const index = (e: number) => Math.round(e / BIN_MW)
  const lo = Math.min(0, ...errors.map(index))
  const hi = Math.max(0, ...errors.map(index))

  const counts = new Map<number, number>()
  for (const e of errors) counts.set(index(e), (counts.get(index(e)) ?? 0) + 1)

  const bins: Bin[] = []
  for (let i = lo; i <= hi; i++) {
    bins.push({ center: i * BIN_MW, from: (i - 0.5) * BIN_MW, to: (i + 0.5) * BIN_MW, hours: counts.get(i) ?? 0 })
  }
  return bins
}
