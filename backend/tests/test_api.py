from datetime import datetime, timedelta, timezone

import pytest

from app import main
from app.elexon import Actual, Forecast
from tests.conftest import register

T = datetime(2026, 1, 10, 12, tzinfo=timezone.utc)
H = timedelta(hours=1)

ACTUALS = (Actual(T, 1000), Actual(T + 0.5 * H, 1050), Actual(T + H, 1100))
FORECASTS = (
    Forecast(T, T - 30 * H, 800),
    Forecast(T + H, T - 30 * H, 900),
    Forecast(T, T - 6 * H, 1200),
    Forecast(T + H, T - 6 * H, 1000),
)


@pytest.fixture
def data(monkeypatch):
    """Serve fixed in-memory data instead of Elexon."""
    monkeypatch.setattr(main, "load_data", lambda: (ACTUALS, FORECASTS))
    main._series.cache_clear()
    yield
    main._series.cache_clear()


@pytest.fixture
def client(anon_client, data):
    """Logged-in API client."""
    token = register(anon_client)["access_token"]
    anon_client.headers["Authorization"] = f"Bearer {token}"
    return anon_client


@pytest.mark.parametrize(
    "path", ["/api/analysis", "/api/horizon-curve", "/api/forecast-run?as_of=2026-01-10T07:00:00Z"]
)
def test_data_endpoints_require_login(anon_client, data, path):
    assert anon_client.get(path).status_code == 401


def test_health_does_not_require_login(anon_client):
    assert anon_client.get("/api/health").status_code == 200


def test_analysis_uses_forecasts_for_requested_horizon(client):
    body = client.get("/api/analysis", params={"horizon": 4}).json()

    assert [p["forecast"] for p in body["points"]] == [1200, None, 1000]
    assert body["metrics"]["count"] == 2
    assert body["metrics"]["mae"] == pytest.approx(150)
    assert body["coverage"] == {"target_hours": 2, "forecast_hours": 2}


def test_analysis_filters_by_time_range(client):
    body = client.get(
        "/api/analysis",
        params={"horizon": 24, "start": "2026-01-10T13:00:00Z", "end": "2026-01-11T00:00:00Z"},
    ).json()

    assert [p["start_time"] for p in body["points"]] == ["2026-01-10T13:00:00Z"]
    assert body["metrics"]["bias"] == pytest.approx(-200)


@pytest.mark.parametrize("horizon", [-1, 49, 4.2])
def test_analysis_rejects_invalid_horizon(client, horizon):
    assert client.get("/api/analysis", params={"horizon": horizon}).status_code == 422


def test_analysis_rejects_empty_range(client):
    params = {"start": "2026-01-10T00:00:00Z", "end": "2026-01-09T00:00:00Z"}
    assert client.get("/api/analysis", params=params).status_code == 422


def test_horizon_curve_covers_0_to_48_hours(client):
    body = client.get("/api/horizon-curve").json()

    assert [row["horizon_hours"] for row in body] == list(range(49))
    assert body[0]["metrics"]["mae"] == pytest.approx(150)
    assert body[24]["metrics"]["mae"] == pytest.approx(200)


def test_forecast_run_returns_latest_run_published_by_decision_time(client):
    body = client.get("/api/forecast-run", params={"as_of": "2026-01-10T07:00:00Z"}).json()

    assert body["publish_time"] == "2026-01-10T06:00:00Z"
    assert [(p["forecast"], p["actual"]) for p in body["points"]] == [(1200, 1000), (1000, 1100)]


def test_forecast_run_before_any_publication_is_empty(client):
    body = client.get("/api/forecast-run", params={"as_of": "2025-12-01T00:00:00Z"}).json()

    assert body == {"as_of": "2025-12-01T00:00:00Z", "publish_time": None, "points": []}
