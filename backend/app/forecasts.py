"""Pick the forecast a trader would actually have had at decision time."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable

from app.elexon import Actual, Forecast


@dataclass(frozen=True)
class SeriesPoint:
    start_time: datetime
    actual: float | None
    forecast: float | None
    publish_time: datetime | None  # when the selected forecast was published


def select_forecasts(
    forecasts: Iterable[Forecast], horizon: timedelta
) -> dict[datetime, Forecast]:
    """For each target time, the latest forecast published at least `horizon` before it.

    Target times with no forecast old enough are left out.
    """
    selected: dict[datetime, Forecast] = {}
    for forecast in forecasts:
        if forecast.publish_time > forecast.start_time - horizon:
            continue
        current = selected.get(forecast.start_time)
        if current is None or forecast.publish_time > current.publish_time:
            selected[forecast.start_time] = forecast
    return selected


def latest_run(forecasts: Iterable[Forecast], as_of: datetime) -> list[Forecast]:
    """The most recent forecast run published at or before `as_of`."""
    published = [f for f in forecasts if f.publish_time <= as_of]
    if not published:
        return []
    latest = max(f.publish_time for f in published)
    return sorted(
        (f for f in published if f.publish_time == latest), key=lambda f: f.start_time
    )


def build_series(
    actuals: Iterable[Actual], forecasts: Iterable[Forecast], horizon: timedelta
) -> list[SeriesPoint]:
    """Merge actuals and horizon-selected forecasts onto one time axis."""
    actual_by_time = {a.start_time: a.generation for a in actuals}
    selected = select_forecasts(forecasts, horizon)

    return [
        SeriesPoint(
            start_time=t,
            actual=actual_by_time.get(t),
            forecast=selected[t].generation if t in selected else None,
            publish_time=selected[t].publish_time if t in selected else None,
        )
        for t in sorted(actual_by_time.keys() | selected.keys())
    ]
