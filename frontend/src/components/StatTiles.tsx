import type { Analysis } from '../api'
import { formatMW, formatSignedMW } from '../format'

export function StatTiles({ analysis }: { analysis: Analysis }) {
  const { metrics, coverage, horizon_hours } = analysis

  if (!metrics) {
    return <p className="empty">No forecasts were published {horizon_hours}h ahead for this period.</p>
  }

  const overForecast = metrics.bias > 0

  return (
    <div className="tiles">
      <Tile
        label="Typical error (MAE)"
        value={formatMW(metrics.mae)}
        note={metrics.mape !== null ? `${metrics.mape.toFixed(1)}% of actual generation` : undefined}
      />
      <Tile
        label="90% of hours within"
        value={`± ${formatMW(metrics.p90_abs_error)}`}
        note={`Worst hour ${formatMW(metrics.max_abs_error)}`}
      />
      <Tile
        label="Average bias"
        value={formatSignedMW(metrics.bias)}
        note={
          overForecast
            ? 'Forecast too high: wind under-delivered, so more power had to be bought'
            : 'Forecast too low: wind over-delivered'
        }
      />
      <Tile
        label="Hours compared"
        value={`${coverage.forecast_hours} / ${coverage.target_hours}`}
        note={
          coverage.forecast_hours < coverage.target_hours
            ? 'Some hours had no forecast this far ahead'
            : 'Every hour had a forecast'
        }
      />
    </div>
  )
}

export function Tile({ label, value, note, small }: { label: string; value: string; note?: string; small?: boolean }) {
  return (
    <div className="tile card">
      <div className="tile-label">{label}</div>
      <div className={small ? 'tile-value tile-value-sm' : 'tile-value'}>{value}</div>
      {note && <div className="tile-note">{note}</div>}
    </div>
  )
}
