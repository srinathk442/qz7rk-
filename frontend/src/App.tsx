import { useState } from 'react'
import { analysisUrl, HORIZON_CURVE_URL, type Analysis, type HorizonMetrics } from './api'
import { useAuth, type Session } from './auth'
import { AuthPage } from './components/AuthPage'
import { Controls, MONTH_END, MONTH_START } from './components/Controls'
import { DecisionView } from './components/DecisionView'
import { ErrorHistogram } from './components/ErrorHistogram'
import { HorizonChart } from './components/HorizonChart'
import { SeriesChart } from './components/SeriesChart'
import { StatTiles } from './components/StatTiles'
import { useDebounced, useFetch } from './hooks'

const DAY_MS = 24 * 3600 * 1000

export default function App() {
  const { session, endSession } = useAuth()
  return session ? <Dashboard session={session} onLogOut={() => endSession()} /> : <AuthPage />
}

function Dashboard({ session, onLogOut }: { session: Session; onLogOut: () => void }) {
  const [horizon, setHorizon] = useState(24)
  const [range, setRange] = useState({ start: MONTH_START, end: MONTH_END })

  // Wait for the slider to settle before refetching.
  const debouncedHorizon = useDebounced(horizon, 250)
  const endExclusive = new Date(Date.parse(range.end) + DAY_MS).toISOString()
  const analysis = useFetch<Analysis>(analysisUrl(debouncedHorizon, `${range.start}T00:00:00Z`, endExclusive))
  const curve = useFetch<HorizonMetrics[]>(HORIZON_CURVE_URL)

  return (
    <div className="page">
      <header className="header">
        <div className="header-top">
          <h1>Wind Forecast Monitor</h1>
          <div className="account">
            <span className="account-email" title={session.user.email}>
              {session.user.email}
            </span>
            <button type="button" onClick={onLogOut}>
              Log out
            </button>
          </div>
        </div>
        <p className="subtitle">
          GB national wind generation: forecast vs actual, January 2026. Source: Elexon BMRS (WINDFOR, FUELHH). Times in
          UK time (GMT).
        </p>
      </header>

      <section className="section">
        <h2>1. What did the latest forecast say at decision time?</h2>
        <p className="section-intro">
          Pick when you make your day-ahead purchase. You see the newest wind forecast that existed at that moment,
          with an uncertainty range based on how wrong forecasts were in January.
        </p>
        <div className="card">{curve.data && <DecisionView curve={curve.data} />}</div>
      </section>

      <section className="section">
        <h2>2. How accurate are the forecasts?</h2>
        <Controls
          horizon={horizon}
          onHorizonChange={setHorizon}
          startDay={range.start}
          endDay={range.end}
          onRangeChange={(start, end) => setRange({ start, end })}
        />

        {analysis.error && <p className="error">Could not load data: {analysis.error}</p>}
        {!analysis.data && analysis.loading && <p className="empty">Loading data from Elexon…</p>}

        {analysis.data && (
          <div className={analysis.loading ? 'is-loading' : undefined}>
            <StatTiles analysis={analysis.data} />

            <div className="card">
              <h3>Actual vs forecast ({analysis.data.horizon_hours}h ahead)</h3>
              <p className="chart-intro">Wind generation, MW</p>
              <SeriesChart points={analysis.data.points} />
            </div>

            <div className="grid-2">
              <div className="card">
                <h3>Forecasts get worse the further ahead they look</h3>
                <p className="chart-intro">Error in MW across all of January, by hours ahead</p>
                {curve.data && <HorizonChart curve={curve.data} selectedHorizon={horizon} />}
              </div>
              <div className="card">
                <h3>Distribution of errors ({analysis.data.horizon_hours}h ahead)</h3>
                <p className="chart-intro">Number of hours by size of miss (forecast − actual)</p>
                <ErrorHistogram points={analysis.data.points} />
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
