"""Refresh the snow stations' precipitation for the water year (ADR-122).

The same reviewed inventory and the same Conservation Service request as the
snow refresh, asking for the gauge's accumulated precipitation (`PREC`)
instead of snow water. A separate script and a separate file, so a failure
here costs this file and never the snow payload; the fetch, the retry one
station at a time and the missing-station tolerance are the snow refresh's
own, imported rather than written twice.

Nothing is normalised against a median here. The page compares a drainage
area with its own history, built from a fixed set of stations by
`tools/build_precipitation_history.py`; this file carries only what each
station has measured since 1 October.
"""

import argparse
import json
import time
from datetime import date, datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from refresh_snowpack import (
    DATA_URL,
    LATE_AFTER_DAYS,
    MISSING_SITE_TOLERANCE,
    RETRIES,
    TIMEOUT,
    USER_AGENT,
    _number,
    fetch_all,
    water_year_start,
    write_atomic,
)

ROOT = Path(__file__).resolve().parent
INVENTORY_PATH = ROOT / "snow_sites.json"
OUTPUT_PATH = ROOT / "precipitation.json"
SCHEMA_VERSION = 1


def _request_precipitation(session, station_ids: list[str], begin: date,
                           end: date) -> list[dict]:
    params = {
        "stationTriplets": ",".join(station_ids),
        "elements": "PREC",
        "duration": "DAILY",
        "beginDate": begin.isoformat(),
        "endDate": end.isoformat(),
        "returnFlags": "true",
    }
    last_error = None
    for attempt in range(RETRIES):
        try:
            response = session.get(DATA_URL, params=params, timeout=TIMEOUT,
                                   headers={"User-Agent": USER_AGENT})
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, list):
                raise ValueError("precipitation response is not a list")
            return payload
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            if attempt + 1 < RETRIES:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"precipitation request failed: {last_error}")


def station_readings(station: str, record: dict) -> dict[str, float] | None:
    """One station's accumulated precipitation by date, or None if it has none."""
    candidates = [
        series for series in record.get("data", [])
        if series.get("stationElement", {}).get("elementCode") == "PREC"
        and series.get("stationElement", {}).get("durationName") == "DAILY"
    ]
    if len(candidates) > 1:
        raise ValueError(f"{station} has {len(candidates)} daily precipitation series")
    if not candidates:
        return None
    unit = candidates[0].get("stationElement", {}).get("storedUnitCode")
    if unit != "in":
        raise ValueError(f"{station} uses unexpected unit {unit}")
    readings = {}
    for raw in candidates[0].get("values", []):
        value = _number(raw.get("value"))
        if value is not None:
            readings[str(raw.get("date"))[:10]] = round(value, 2)
    return readings or None


def build_payload(inventory: dict, records: list[dict], as_of: date,
                  generated_at: datetime | None = None) -> dict:
    roster = [site["station"] for site in inventory["sites"]]
    if len(set(roster)) != len(roster):
        raise ValueError("snow site inventory stations are not unique")
    by_station = {}
    for record in records:
        station = record.get("stationTriplet")
        if station not in set(roster):
            raise ValueError(f"precipitation covers a station not in the inventory: {station}")
        readings = station_readings(station, record)
        if readings is not None:
            by_station[station] = readings

    missing = sorted(set(roster) - set(by_station))
    if len(missing) > int(len(roster) * MISSING_SITE_TOLERANCE):
        raise ValueError(
            f"precipitation is missing {len(missing)} of {len(roster)} inventory "
            "stations: " + ", ".join(missing[:10]) + (" ..." if len(missing) > 10 else ""))
    if missing:
        print(f"  {len(missing)} station(s) reported no precipitation and are left "
              f"out of today's file: {', '.join(missing)}")

    # One copy of the water-year calendar, and each station's positions in it,
    # the way the snow payload writes its own (ADR-052).
    dates = sorted({day for readings in by_station.values() for day in readings})
    position = {day: index for index, day in enumerate(dates)}
    sites = []
    for station in roster:
        readings = by_station.get(station)
        if readings is None:
            continue
        days = sorted(readings)
        latest = date.fromisoformat(days[-1])
        sites.append({
            "station": station,
            "latest_date": days[-1],
            "late": (as_of - latest).days > LATE_AFTER_DAYS,
            "series_days": [position[day] for day in days],
            "series_values": [readings[day] for day in days],
        })

    stamp = (generated_at or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "as_of": as_of.isoformat(),
        "water_year": as_of.year + 1 if as_of.month >= 10 else as_of.year,
        "element": "PREC",
        "units": "inches, accumulated since 1 October",
        "source": DATA_URL,
        "series_dates": dates,
        "site_count": len(sites),
        "late_site_count": sum(1 for site in sites if site["late"]),
        "missing_site_count": len(missing),
        "sites": sites,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_PATH)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--as-of", type=date.fromisoformat)
    args = parser.parse_args()

    inventory = json.loads(args.inventory.read_text(encoding="utf-8"))
    today = args.as_of or datetime.now(ZoneInfo("America/Denver")).date()
    station_ids = [site["station"] for site in inventory["sites"]]
    records = fetch_all(requests.Session(), station_ids, water_year_start(today),
                        today, request=_request_precipitation)
    payload = build_payload(inventory, records, today)
    changed = write_atomic(args.output, payload)
    print(f"{payload['site_count']} stations' precipitation refreshed; "
          f"{payload['late_site_count']} reporting late; "
          f"{args.output} {'written' if changed else 'unchanged'}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
