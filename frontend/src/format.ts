// All times are UTC, which is also UK local time (GMT) in January.

const dateTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const dayMonth = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })

export const formatDateTime = (iso: string | number) => dateTime.format(new Date(iso))
export const formatDay = (iso: string | number) => dayMonth.format(new Date(iso))

export const formatMW = (mw: number) => `${Math.round(mw).toLocaleString('en-GB')} MW`

export const formatSignedMW = (mw: number) => `${mw > 0 ? '+' : mw < 0 ? '−' : ''}${formatMW(Math.abs(mw))}`

/** Axis ticks: 0 / 5K / 10K. */
export const formatCompact = (mw: number) => (mw === 0 ? '0' : `${mw / 1000}K`)

export const formatHours = (h: number) => `${h}h`

/** Round axis ticks from 0 up to at least `max`, using at most ~6 ticks. */
export function niceTicks(max: number): number[] {
  const step = [500, 1000, 2000, 2500, 5000, 10000].find((s) => max / s <= 5) ?? 10000
  const ticks = []
  for (let t = 0; t < max + step; t += step) ticks.push(t)
  return ticks
}
