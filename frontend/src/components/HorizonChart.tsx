import {
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { HorizonMetrics } from '../api'
import { formatCompact, formatHours, formatMW, niceTicks } from '../format'
import { legendProps } from './legend'
import { TooltipRow } from './SeriesChart'

interface Props {
  curve: HorizonMetrics[]
  selectedHorizon: number
}

export function HorizonChart({ curve, selectedHorizon }: Props) {
  const rows = curve
    .filter((r) => r.metrics)
    .map((r) => ({ h: r.horizon_hours, mae: r.metrics!.mae, p90: r.metrics!.p90_abs_error }))
  const lastIndex = rows.length - 1
  const yTicks = niceTicks(Math.max(0, ...rows.map((r) => r.p90)))

  return (
    <>
      <div className="chart" style={{ height: 300 }}>
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 40, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis
              dataKey="h"
              type="number"
              domain={[0, 48]}
              ticks={[0, 6, 12, 18, 24, 30, 36, 42, 48]}
              tickFormatter={formatHours}
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
            <ReferenceLine
              x={selectedHorizon}
              stroke="var(--text-secondary)"
              label={{ value: `${selectedHorizon}h`, position: 'insideTopRight', fill: 'var(--text-secondary)', fontSize: 12 }}
            />
            <Tooltip
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof rows)[number] | undefined
                if (!active || !row) return null
                return (
                  <div className="tooltip">
                    <div className="tooltip-title">{row.h}h ahead</div>
                    <TooltipRow color="var(--series-p90)" label="90% within" value={row.p90} />
                    <TooltipRow color="var(--series-mae)" label="Typical error" value={row.mae} />
                  </div>
                )
              }}
              cursor={{ stroke: 'var(--axis)' }}
            />
            <Legend {...legendProps} />
            <Line
              name="90% of hours within (P90)"
              dataKey="p90"
              stroke="var(--series-p90)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            >
              <LabelList dataKey="p90" content={endLabel(lastIndex)} />
            </Line>
            <Line
              name="Typical error (MAE)"
              dataKey="mae"
              stroke="var(--series-mae)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: 'var(--surface)', strokeWidth: 2 }}
              isAnimationActive={false}
            >
              <LabelList dataKey="mae" content={endLabel(lastIndex)} />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      </div>

      <details className="table-view">
        <summary>Show data table</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Hours ahead</th>
                <th>Typical error (MAE)</th>
                <th>90% within (P90)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.h}>
                  <td>{r.h}h</td>
                  <td>{formatMW(r.mae)}</td>
                  <td>{formatMW(r.p90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}

/** Direct label on the last point of a line only. */
function endLabel(lastIndex: number) {
  return function EndLabel(props: { index?: number; x?: number | string; y?: number | string; value?: unknown }) {
    if (props.index !== lastIndex) return null
    return (
      <text x={Number(props.x) + 6} y={Number(props.y)} dy={4} fill="var(--text-secondary)" fontSize={12}>
        {formatCompact(Math.round(Number(props.value) / 100) * 100)}
      </text>
    )
  }
}
