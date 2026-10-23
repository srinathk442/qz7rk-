from datetime import datetime, timezone

from app.elexon import parse_actuals, parse_forecasts


def utc(day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 1, day, hour, minute, tzinfo=timezone.utc)


def test_parse_actuals_keeps_latest_revision_and_drops_out_of_period_rows():
    rows = [
        {"startTime": "2026-01-05T10:00:00Z", "publishTime": "2026-01-05T10:30:00Z", "generation": 100},
        {"startTime": "2026-01-05T10:00:00Z", "publishTime": "2026-01-05T11:00:00Z", "generation": 120},
        {"startTime": "2025-12-31T23:30:00Z", "publishTime": "2026-01-01T00:00:00Z", "generation": 999},
    ]

    actuals = parse_actuals(rows)

    assert [(a.start_time, a.generation) for a in actuals] == [(utc(5, 10), 120)]


def test_parse_forecasts_drops_rows_targeting_times_before_publication():
    rows = [
        {"startTime": "2026-01-05T10:00:00Z", "publishTime": "2026-01-05T07:30:00Z", "generation": 100},
        {"startTime": "2026-01-05T06:00:00Z", "publishTime": "2026-01-05T07:30:00Z", "generation": 200},
        {"startTime": "2026-02-01T00:00:00Z", "publishTime": "2026-01-30T07:30:00Z", "generation": 300},
    ]

    forecasts = parse_forecasts(rows)

    assert [(f.start_time, f.publish_time, f.generation) for f in forecasts] == [
        (utc(5, 10), utc(5, 7, 30), 100)
    ]
