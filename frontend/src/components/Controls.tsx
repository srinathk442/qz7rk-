export const MONTH_START = '2026-01-01'
export const MONTH_END = '2026-01-31'

interface Props {
  horizon: number
  onHorizonChange: (h: number) => void
  startDay: string
  endDay: string
  onRangeChange: (start: string, end: string) => void
}

export function Controls({ horizon, onHorizonChange, startDay, endDay, onRangeChange }: Props) {
  const isFullMonth = startDay === MONTH_START && endDay === MONTH_END

  return (
    <div className="controls card">
      <label className="control control-horizon">
        <span className="control-label">
          Forecast horizon <strong>{horizon}h</strong>
        </span>
        <input
          type="range"
          min={0}
          max={48}
          step={0.5}
          value={horizon}
          onChange={(e) => onHorizonChange(Number(e.target.value))}
          aria-describedby="horizon-help"
        />
        <span id="horizon-help" className="control-help">
          Uses the latest forecast published at least {horizon}h before each hour, i.e. what you would have known
          then.
        </span>
      </label>

      <div className="control control-range">
        <span className="control-label">Delivery dates</span>
        <div className="range-inputs">
          <input
            type="date"
            aria-label="Start date"
            min={MONTH_START}
            max={endDay}
            value={startDay}
            onChange={(e) => e.target.value && onRangeChange(e.target.value, endDay)}
          />
          <span aria-hidden>→</span>
          <input
            type="date"
            aria-label="End date"
            min={startDay}
            max={MONTH_END}
            value={endDay}
            onChange={(e) => e.target.value && onRangeChange(startDay, e.target.value)}
          />
          <button type="button" disabled={isFullMonth} onClick={() => onRangeChange(MONTH_START, MONTH_END)}>
            Full month
          </button>
        </div>
      </div>
    </div>
  )
}
