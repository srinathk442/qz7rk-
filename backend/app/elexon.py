"""Client for the Elexon BMRS Insights API (wind actuals and forecasts).

January 2026 is history, so the app normally reads a snapshot committed to the
repo (fast, works offline). Set DATA_SOURCE=live to fetch from Elexon instead.
Refresh the snapshot with:  python -m app.elexon
"""

import json
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

import httpx

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
TIMEOUT = httpx.Timeout(30.0)
SNAPSHOT_PATH = Path(__file__).resolve().parent.parent / "data" / "elexon_jan2026.json"

# Analysis window: target times in January 2026 (UTC).
PERIOD_START = datetime(2026, 1, 1, tzinfo=timezone.utc)
PERIOD_END = datetime(2026, 2, 1, tzinfo=timezone.utc)

# A WINDFOR run covers ~3 days ahead, so forecasts for early January
# were published in late December.
FORECAST_LOOKBACK = timedelta(days=3)

# The only fields we use; everything else is dropped from the snapshot.
ROW_FIELDS = ("startTime", "publishTime", "generation")


@dataclass(frozen=True)
class Actual:
    start_time: datetime
    generation: float  # MW


@dataclass(frozen=True)
class Forecast:
    start_time: datetime
    publish_time: datetime
    generation: float  # MW


def _parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _get(path: str, params: dict) -> list[dict]:
    response = httpx.get(f"{BASE_URL}/{path}", params=params, timeout=TIMEOUT)
    response.raise_for_status()
    return [{k: row[k] for k in ROW_FIELDS} for row in response.json()]


def fetch_actual_rows() -> list[dict]:
    return _get(
        "FUELHH/stream",
        {
            "settlementDateFrom": PERIOD_START.date().isoformat(),
            "settlementDateTo": (PERIOD_END - timedelta(days=1)).date().isoformat(),
            "fuelType": "WIND",
        },
    )


def fetch_forecast_rows() -> list[dict]:
    return _get(
        "WINDFOR/stream",
        {
            "publishDateTimeFrom": _iso(PERIOD_START - FORECAST_LOOKBACK),
            "publishDateTimeTo": _iso(PERIOD_END),
        },
    )


def parse_actuals(rows: list[dict]) -> tuple[Actual, ...]:
    """Half-hourly outturn wind generation for the analysis period."""
    # Keep the most recently published value for each half-hour.
    latest: dict[datetime, dict] = {}
    for row in rows:
        start = _parse_time(row["startTime"])
        if not PERIOD_START <= start < PERIOD_END:
            continue
        if start not in latest or row["publishTime"] > latest[start]["publishTime"]:
            latest[start] = row

    return tuple(
        Actual(start_time=start, generation=float(row["generation"]))
        for start, row in sorted(latest.items())
    )


def parse_forecasts(rows: list[dict]) -> tuple[Forecast, ...]:
    """Every hourly wind forecast that targets the analysis period."""
    forecasts = []
    for row in rows:
        start = _parse_time(row["startTime"])
        publish = _parse_time(row["publishTime"])
        # A row targeting a time before it was published is not a forecast.
        if publish > start or not PERIOD_START <= start < PERIOD_END:
            continue
        forecasts.append(
            Forecast(start_time=start, publish_time=publish, generation=float(row["generation"]))
        )

    forecasts.sort(key=lambda f: (f.start_time, f.publish_time))
    return tuple(forecasts)


@lru_cache(maxsize=1)
def load_data() -> tuple[tuple[Actual, ...], tuple[Forecast, ...]]:
    """Actuals and forecasts, from the snapshot unless DATA_SOURCE=live."""
    if os.environ.get("DATA_SOURCE", "snapshot") != "live" and SNAPSHOT_PATH.exists():
        raw = json.loads(SNAPSHOT_PATH.read_text())
        actual_rows, forecast_rows = raw["actuals"], raw["forecasts"]
    else:
        actual_rows, forecast_rows = fetch_actual_rows(), fetch_forecast_rows()
    return parse_actuals(actual_rows), parse_forecasts(forecast_rows)


def save_snapshot(path: Path = SNAPSHOT_PATH) -> None:
    snapshot = {
        "source": BASE_URL,
        "fetched_at": _iso(datetime.now(timezone.utc)),
        "actuals": fetch_actual_rows(),
        "forecasts": fetch_forecast_rows(),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(snapshot, separators=(",", ":")))
    print(f"Saved {len(snapshot['actuals'])} actual and {len(snapshot['forecasts'])} forecast rows to {path}")


if __name__ == "__main__":
    save_snapshot()
