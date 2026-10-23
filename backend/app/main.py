from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache

import httpx
from fastapi import FastAPI, HTTPException, Query

from app.elexon import PERIOD_END, PERIOD_START, load_data
from app.forecasts import SeriesPoint, build_series, latest_run
from app.metrics import ErrorMetrics, compute_metrics

MAX_HORIZON_HOURS = 48

app = FastAPI(title="Wind Forecast Monitor API")


@dataclass(frozen=True)
class Coverage:
    target_hours: int  # hourly target times with an actual in the range
    forecast_hours: int  # of those, how many had a forecast at this horizon


@dataclass(frozen=True)
class Analysis:
    horizon_hours: float
    start: datetime
    end: datetime
    points: list[SeriesPoint]
    metrics: ErrorMetrics | None
    coverage: Coverage


@dataclass(frozen=True)
class HorizonMetrics:
    horizon_hours: int
    metrics: ErrorMetrics | None


@dataclass(frozen=True)
class RunPoint:
    start_time: datetime
    forecast: float
    actual: float | None


@dataclass(frozen=True)
class ForecastRun:
    as_of: datetime
    publish_time: datetime | None
    points: list[RunPoint]


def _as_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _load_data():
    try:
        return load_data()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Elexon API unavailable: {exc}") from exc


@lru_cache(maxsize=None)
def _series(horizon_hours: float) -> list[SeriesPoint]:
    actuals, forecasts = _load_data()
    return build_series(actuals, forecasts, timedelta(hours=horizon_hours))


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/analysis", response_model=Analysis)
def analysis(
    horizon: float = Query(
        4, ge=0, le=MAX_HORIZON_HOURS, multiple_of=0.5, description="Forecast horizon in hours"
    ),
    start: datetime = Query(PERIOD_START, description="Range start (UTC, inclusive)"),
    end: datetime = Query(PERIOD_END, description="Range end (UTC, exclusive)"),
) -> Analysis:
    start, end = _as_utc(start), _as_utc(end)
    if start >= end:
        raise HTTPException(status_code=422, detail="start must be before end")

    points = [p for p in _series(horizon) if start <= p.start_time < end]
    hourly = [p for p in points if p.start_time.minute == 0 and p.actual is not None]

    return Analysis(
        horizon_hours=horizon,
        start=start,
        end=end,
        points=points,
        metrics=compute_metrics(points),
        coverage=Coverage(
            target_hours=len(hourly),
            forecast_hours=sum(1 for p in hourly if p.forecast is not None),
        ),
    )


@app.get("/api/horizon-curve", response_model=list[HorizonMetrics])
def horizon_curve() -> list[HorizonMetrics]:
    return [
        HorizonMetrics(horizon_hours=h, metrics=compute_metrics(_series(h)))
        for h in range(MAX_HORIZON_HOURS + 1)
    ]


@app.get("/api/forecast-run", response_model=ForecastRun)
def forecast_run(
    as_of: datetime = Query(..., description="Decision time (UTC); returns the latest run published by then"),
) -> ForecastRun:
    as_of = _as_utc(as_of)
    actuals, forecasts = _load_data()
    actual_by_time = {a.start_time: a.generation for a in actuals}
    run = latest_run(forecasts, as_of)

    return ForecastRun(
        as_of=as_of,
        publish_time=run[0].publish_time if run else None,
        points=[
            RunPoint(start_time=f.start_time, forecast=f.generation, actual=actual_by_time.get(f.start_time))
            for f in run
        ],
    )
