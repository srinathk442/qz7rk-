"""Forecast error statistics."""

import math
from dataclasses import dataclass
from typing import Iterable

from app.forecasts import SeriesPoint


@dataclass(frozen=True)
class ErrorMetrics:
    count: int
    mae: float  # mean absolute error, MW
    rmse: float  # root mean squared error, MW
    bias: float  # mean (forecast - actual); positive = over-forecast, MW
    mape: float | None  # mean absolute percentage error, % (None if no non-zero actuals)
    p50_abs_error: float  # median absolute error, MW
    p90_abs_error: float  # 90% of hours were within this error, MW
    max_abs_error: float  # MW


def percentile(values: list[float], pct: float) -> float:
    """Linear-interpolated percentile of a non-empty list (pct in 0..100)."""
    ordered = sorted(values)
    rank = (len(ordered) - 1) * pct / 100
    low, high = math.floor(rank), math.ceil(rank)
    return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)


def compute_metrics(points: Iterable[SeriesPoint]) -> ErrorMetrics | None:
    """Error metrics over points that have both an actual and a forecast."""
    pairs = [
        (p.forecast, p.actual)
        for p in points
        if p.forecast is not None and p.actual is not None
    ]
    if not pairs:
        return None

    errors = [f - a for f, a in pairs]
    abs_errors = [abs(e) for e in errors]
    n = len(errors)
    pct_errors = [abs(f - a) / a for f, a in pairs if a > 0]

    return ErrorMetrics(
        count=n,
        mae=sum(abs_errors) / n,
        rmse=math.sqrt(sum(e * e for e in errors) / n),
        bias=sum(errors) / n,
        mape=100 * sum(pct_errors) / len(pct_errors) if pct_errors else None,
        p50_abs_error=percentile(abs_errors, 50),
        p90_abs_error=percentile(abs_errors, 90),
        max_abs_error=max(abs_errors),
    )
