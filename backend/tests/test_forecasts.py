from datetime import datetime, timedelta, timezone

from app.elexon import Actual, Forecast
from app.forecasts import build_series, select_forecasts

T = datetime(2026, 1, 10, 12, tzinfo=timezone.utc)  # a target time
H = timedelta(hours=1)


def fc(start: datetime, hours_before: float, generation: float) -> Forecast:
    return Forecast(
        start_time=start,
        publish_time=start - timedelta(hours=hours_before),
        generation=generation,
    )


def test_picks_latest_forecast_old_enough_for_horizon():
    forecasts = [fc(T, 30, 100), fc(T, 6, 200), fc(T, 2, 300)]

    assert select_forecasts(forecasts, 4 * H)[T].generation == 200
    assert select_forecasts(forecasts, 24 * H)[T].generation == 100
    assert select_forecasts(forecasts, 0 * H)[T].generation == 300


def test_forecast_published_exactly_at_horizon_is_allowed():
    forecasts = [fc(T, 4, 100)]

    assert select_forecasts(forecasts, 4 * H)[T].generation == 100


def test_target_without_old_enough_forecast_is_omitted():
    forecasts = [fc(T, 2, 100)]

    assert select_forecasts(forecasts, 4 * H) == {}


def test_selection_does_not_depend_on_input_order():
    forecasts = [fc(T, 2, 300), fc(T, 6, 200), fc(T, 30, 100)]

    assert select_forecasts(forecasts, 4 * H)[T].generation == 200


def test_build_series_aligns_half_hourly_actuals_with_hourly_forecasts():
    half_past = T + timedelta(minutes=30)
    actuals = [Actual(T, 1000), Actual(half_past, 1100)]
    forecasts = [fc(T, 6, 900)]

    series = build_series(actuals, forecasts, 4 * H)

    assert [(p.start_time, p.actual, p.forecast) for p in series] == [
        (T, 1000, 900),
        (half_past, 1100, None),
    ]
    assert series[0].publish_time == T - 6 * H
