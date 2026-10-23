import math
from datetime import datetime, timedelta, timezone

import pytest

from app.forecasts import SeriesPoint
from app.metrics import compute_metrics, percentile

T0 = datetime(2026, 1, 10, tzinfo=timezone.utc)


def points(pairs: list[tuple[float | None, float | None]]) -> list[SeriesPoint]:
    return [
        SeriesPoint(start_time=T0 + timedelta(hours=i), actual=a, forecast=f, publish_time=None)
        for i, (f, a) in enumerate(pairs)
    ]


def test_metrics_on_known_errors():
    # errors (forecast - actual): +100, -100, +200, 0
    m = compute_metrics(points([(1100, 1000), (900, 1000), (1200, 1000), (1000, 1000)]))

    assert m.count == 4
    assert m.mae == pytest.approx(100)
    assert m.bias == pytest.approx(50)
    assert m.rmse == pytest.approx(math.sqrt((100**2 + 100**2 + 200**2) / 4))
    assert m.mape == pytest.approx(10)
    assert m.max_abs_error == 200


def test_points_missing_either_value_are_ignored():
    m = compute_metrics(points([(1100, 1000), (None, 1000), (1000, None)]))

    assert m.count == 1
    assert m.mae == pytest.approx(100)


def test_no_comparable_points_returns_none():
    assert compute_metrics(points([(None, 1000)])) is None


def test_mape_is_none_when_all_actuals_are_zero():
    assert compute_metrics(points([(10, 0)])).mape is None


def test_percentile_interpolates():
    values = [0, 10, 20, 30, 40]

    assert percentile(values, 50) == 20
    assert percentile(values, 90) == pytest.approx(36)
    assert percentile([7], 90) == 7
