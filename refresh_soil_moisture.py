"""Refresh the week's change in soil moisture at the snow stations (ADR-142).

The same reviewed inventory and the same Conservation Service service as the
snow and precipitation refreshes, asking for soil moisture (`SMS`, percent of
the soil's volume) and soil temperature (`STO`) at the sensor depths. A
separate script and a separate file, so a failure here costs this file and
never the snow or precipitation payloads; the fetch, the retry one station at
a time and the missing-station tolerance are the snow refresh's own.

A volumetric percent is not comparable between two soils, so the published
figure is the change at the same sensors over seven days, in percentage
points. No median is used and none is published here.

- A station's value for a day is the mean of its shallow (2 in, or 4 in
  where it has no 2 in sensor), 8 in and 20 in readings. A station without
  all three depths has no value (decision R4).
- A depth's reading is not used on a day its soil temperature is at or below
  freezing, or has no temperature: frozen soil reads falsely dry.
- An area's figure is the mean of its stations' changes, held to the snow
  figure's reporting floor (decision R5). The page regroups the same way
  for the stations in the place it shows.
"""

import argparse
import json
import math
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

from refresh_snowpack import (
    DATA_URL,
    LATE_AFTER_DAYS,
    BATCH_SIZE,
    MIN_ROLLUP_SITES,
    RETRIES,
    TIMEOUT,
    USER_AGENT,
    _number,
    write_atomic,
)

ROOT = Path(__file__).resolve().parent
INVENTORY_PATH = ROOT / "snow_sites.json"
OUTPUT_PATH = ROOT / "soil_moisture.json"
STATIONS_URL = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations"
SCHEMA_VERSION = 1
METADATA_BATCH = 100

#: Days in the calendar the file carries, today included.
WINDOW_DAYS = 15
#: The change is measured over this many days.
CHANGE_DAYS = 7
#: Soil temperature, in degrees Fahrenheit as the service stores it, at or
#: below which a depth's moisture reading is not used.
FROZEN_AT_OR_BELOW_F = 32.0
#: The share of on-time stations that must have a full reading for a day to
#: be the end of the week, the precipitation set day's share (ADR-125).
END_DAY_SHARE = 0.9

#: The share of measuring stations that may be silent before the refresh
#: refuses the day. Wider than the snow refresh's two percent because the
#: station records list some soil sensors as active that have sent nothing
#: for more than a year (eleven of 382 on 2026-10-27). They are named in the
#: log and counted in the file; past a tenth, the service is at fault.
MISSING_SITE_TOLERANCE = 0.1

SHALLOW_DEPTHS = (-2, -4)
MIDDLE_DEPTH = -8
DEEP_DEPTH = -20
REQUEST_DEPTHS = (-2, -4, -8, -20)
ELEMENTS = ",".join(f"{code}:{depth}:1" for code in ("SMS", "STO") for depth in REQUEST_DEPTHS)


def round_tenth(value: float) -> float:
    """Half up, as the page's `Math.round` does, so both sides agree."""
    return math.floor(value * 10 + 0.5) / 10 + 0.0


def _get_json(session, url: str, params: dict, what: str) -> list:
    last_error = None
    for attempt in range(RETRIES):
        try:
            response = session.get(url, params=params, timeout=TIMEOUT,
                                   headers={"User-Agent": USER_AGENT})
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, list):
                raise ValueError(f"{what} response is not a list")
            return payload
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            if attempt + 1 < RETRIES:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"{what} request failed: {last_error}")


def _request_soil(session, station_ids: list[str], begin: date, end: date) -> list[dict]:
    return _get_json(session, DATA_URL, {
        "stationTriplets": ",".join(station_ids),
        "elements": ELEMENTS,
        "duration": "DAILY",
        "beginDate": begin.isoformat(),
        "endDate": end.isoformat(),
        "returnFlags": "true",
    }, "soil moisture")


def fetch_soil(session, station_ids: list[str], begin: date, end: date,
               *, request=_request_soil) -> list[dict]:
    """Every measuring station that answers, a short batch retried one station at a time.

    The snow refresh's `fetch_all`, without its refusal: a station listed
    with sensors that sends nothing is counted by `build_payload`, which
    holds the tolerance.
    """
    expected = set(station_ids)
    received: dict[str, dict] = {}
    for start in range(0, len(station_ids), BATCH_SIZE):
        for record in request(session, station_ids[start:start + BATCH_SIZE], begin, end):
            station = record.get("stationTriplet")
            if station not in expected or station in received:
                raise RuntimeError(f"unrequested or duplicate soil station returned: {station!r}")
            received[station] = record
    for station in sorted(expected - set(received)):
        match = next((row for row in request(session, [station], begin, end)
                      if row.get("stationTriplet") == station), None)
        if match is not None:
            received[station] = match
    return [received[station] for station in station_ids if station in received]


def fetch_sensor_depths(session, station_ids: list[str], as_of: date) -> dict[str, list[int]]:
    """Each station's active daily soil-moisture depths (first sensor), from the station records."""
    depths: dict[str, list[int]] = {}
    for start in range(0, len(station_ids), METADATA_BATCH):
        records = _get_json(session, STATIONS_URL, {
            "stationTriplets": ",".join(station_ids[start:start + METADATA_BATCH]),
            "elements": "SMS:*",
            "durations": "DAILY",
            "returnStationElements": "true",
        }, "soil sensor list")
        for record in records:
            active = sensor_depths(record, as_of)
            if active:
                depths[record["stationTriplet"]] = active
    return depths


def sensor_depths(record: dict, as_of: date) -> list[int]:
    found = set()
    for element in record.get("stationElements") or []:
        if (element.get("elementCode") == "SMS" and element.get("durationName") == "DAILY"
                and element.get("ordinal") == 1 and element.get("heightDepth") is not None
                and str(element.get("endDate", ""))[:10] >= as_of.isoformat()):
            found.add(int(element["heightDepth"]))
    return sorted(found, reverse=True)


def standard_depths(depths: list[int]) -> tuple[int, int, int] | None:
    """The shallow, middle and deep sensors the station value is taken over, or None."""
    shallow = next((depth for depth in SHALLOW_DEPTHS if depth in depths), None)
    if shallow is None or MIDDLE_DEPTH not in depths or DEEP_DEPTH not in depths:
        return None
    return shallow, MIDDLE_DEPTH, DEEP_DEPTH


def _series(record: dict) -> dict[tuple[str, int], dict[str, float]]:
    found: dict[tuple[str, int], dict[str, float]] = {}
    station = record.get("stationTriplet")
    for series in record.get("data") or []:
        element = series.get("stationElement") or {}
        code, depth = element.get("elementCode"), element.get("heightDepth")
        if code not in ("SMS", "STO") or depth is None or element.get("durationName") != "DAILY":
            continue
        unit = element.get("storedUnitCode")
        if (code, unit) not in (("SMS", "pct"), ("STO", "degF")):
            raise ValueError(f"{station} {code} uses unexpected unit {unit}")
        key = (code, int(depth))
        if key in found:
            raise ValueError(f"{station} has two daily {code} series at {depth} in")
        found[key] = {str(raw.get("date"))[:10]: value for raw in series.get("values") or []
                      if (value := _number(raw.get("value"))) is not None}
    return found


def station_days(record: dict, depths: tuple[int, int, int], dates: list[str]) -> dict:
    """One station's readings by depth after the frozen drop, and why a day has no value."""
    series = _series(record)
    readings: list[list[float | None]] = [[], [], []]
    raw_full: list[bool] = []
    raw_any: list[bool] = []
    frozen: list[bool] = []
    for day in dates:
        full = True
        present = False
        day_frozen = False
        for index, depth in enumerate(depths):
            moisture = series.get(("SMS", depth), {}).get(day)
            temperature = series.get(("STO", depth), {}).get(day)
            kept = None
            present = present or moisture is not None
            if moisture is None:
                full = False
            elif temperature is not None and temperature <= FROZEN_AT_OR_BELOW_F:
                day_frozen = True
            elif temperature is not None:
                kept = round_tenth(moisture)
            readings[index].append(kept)
        raw_full.append(full)
        raw_any.append(present)
        frozen.append(full and day_frozen)
    return {"readings": readings, "raw_full": raw_full, "raw_any": raw_any, "frozen": frozen}


def station_value(readings: list[list[float | None]], index: int) -> float | None:
    values = [depth[index] for depth in readings]
    if any(value is None for value in values):
        return None
    return round_tenth(sum(values) / len(values))


def end_day(dates: list[str], sites: list[dict]) -> str | None:
    """The newest day on which at least `END_DAY_SHARE` of the on-time stations have all three readings."""
    on_time = [site for site in sites if not site["late"]]
    if not on_time:
        return None
    needed = math.ceil(len(on_time) * END_DAY_SHARE)
    for index in range(len(dates) - 1, -1, -1):
        if sum(1 for site in on_time if site["_raw_full"][index]) >= needed:
            return dates[index]
    return None


def area_mean(changes: list[float], floor: int) -> float | None:
    """Mean of the station changes, in station order, or None below the floor."""
    if len(changes) < floor:
        return None
    # A plain running sum, not `sum()`, which compensates since Python 3.12:
    # the page adds the same numbers in the same order and must get the same float.
    total = 0.0
    for change in changes:
        total += change
    return round_tenth(total / len(changes))


def build_payload(inventory: dict, depths_by_station: dict[str, list[int]],
                  records: list[dict], as_of: date,
                  generated_at: datetime | None = None) -> dict:
    roster_sites = inventory["sites"]
    roster = [site["station"] for site in roster_sites]
    if len(set(roster)) != len(roster):
        raise ValueError("snow site inventory stations are not unique")
    known = set(roster)
    unknown = sorted(set(depths_by_station) - known)
    if unknown:
        raise ValueError(f"soil sensors listed for stations not in the inventory: {', '.join(unknown)}")

    standard = {station: standard_depths(depths) for station, depths in depths_by_station.items()}
    measuring = [station for station in roster if standard.get(station)]
    other_depths = [{"station": station, "depths_inches": [-depth for depth in depths_by_station[station]]}
                    for station in roster if station in depths_by_station and not standard[station]]

    by_station = {}
    for record in records:
        station = record.get("stationTriplet")
        if station not in standard or not standard[station]:
            raise ValueError(f"soil moisture covers a station not requested: {station}")
        by_station[station] = record
    begin = as_of - timedelta(days=WINDOW_DAYS - 1)
    dates = [(begin + timedelta(days=offset)).isoformat() for offset in range(WINDOW_DAYS)]

    sites = []
    for station in measuring:
        record = by_station.get(station)
        if record is None:
            continue
        days = station_days(record, standard[station], dates)
        if not any(days["raw_any"]):
            continue
        reported = [index for index, full in enumerate(days["raw_full"]) if full]
        latest = dates[reported[-1]] if reported else None
        sites.append({
            "station": station,
            "depths_inches": [-depth for depth in standard[station]],
            "latest_date": latest,
            "late": latest is None or (as_of - date.fromisoformat(latest)).days > LATE_AFTER_DAYS,
            "readings": days["readings"],
            "frozen_days": [index for index, flag in enumerate(days["frozen"]) if flag],
            "_raw_full": days["raw_full"],
            "_frozen": days["frozen"],
        })

    missing = sorted(set(measuring) - {site["station"] for site in sites})
    if len(missing) > int(len(measuring) * MISSING_SITE_TOLERANCE):
        raise ValueError(
            f"soil moisture is missing {len(missing)} of {len(measuring)} measuring "
            "stations: " + ", ".join(missing[:10]) + (" ..." if len(missing) > 10 else ""))
    if missing:
        print(f"  {len(missing)} station(s) sent no soil moisture and are left "
              f"out of today's file: {', '.join(missing)}")

    end = end_day(dates, sites)
    start = (date.fromisoformat(end) - timedelta(days=CHANGE_DAYS)).isoformat() if end else None
    end_index = dates.index(end) if end else None
    start_index = dates.index(start) if start and start in dates else None
    for site in sites:
        end_value = station_value(site["readings"], end_index) if end_index is not None else None
        start_value = station_value(site["readings"], start_index) if start_index is not None else None
        change = None
        reason = None
        if end_value is not None and start_value is not None:
            change = round_tenth(end_value - start_value)
        elif end_index is None or start_index is None \
                or not (site["_raw_full"][end_index] and site["_raw_full"][start_index]):
            reason = "missing_reading"
        elif site["_frozen"][end_index] or site["_frozen"][start_index]:
            reason = "frozen"
        else:
            reason = "no_temperature"
        site["end_percent"] = end_value
        site["start_percent"] = start_value
        site["change_points"] = change
        site["no_change_reason"] = reason
        del site["_raw_full"], site["_frozen"]

    by_area: dict[str, dict] = {}
    site_area = {site["station"]: site for site in roster_sites}
    for site in sites:
        area = site_area[site["station"]]
        entry = by_area.setdefault(area["huc6"], {
            "huc6": area["huc6"], "huc6_name": area["huc6_name"], "changes": [], "site_count": 0})
        entry["site_count"] += 1
        if site["change_points"] is not None:
            entry["changes"].append(site["change_points"])
    rollups = []
    for code in sorted(by_area):
        entry = by_area[code]
        rollups.append({
            "huc6": code,
            "huc6_name": entry["huc6_name"],
            "site_count": entry["site_count"],
            "measured_site_count": len(entry["changes"]),
            "minimum_reporting_sites": MIN_ROLLUP_SITES,
            "mean_change_points": area_mean(entry["changes"], MIN_ROLLUP_SITES),
        })

    stamp = (generated_at or datetime.now(timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": stamp,
        "as_of": as_of.isoformat(),
        "element": "SMS",
        "units": "percent of the soil's volume; changes in percentage points",
        "source": DATA_URL,
        "depth_rule": "mean of the 2 in (or 4 in where there is no 2 in sensor), 8 in and 20 in sensors",
        "frozen_rule": {"element": "STO", "at_or_below_f": FROZEN_AT_OR_BELOW_F},
        "change_days": CHANGE_DAYS,
        "end_date": end,
        "start_date": start,
        "minimum_reporting_sites": MIN_ROLLUP_SITES,
        "series_dates": dates,
        "site_count": len(sites),
        "measured_site_count": sum(1 for site in sites if site["change_points"] is not None),
        "frozen_site_count": sum(1 for site in sites if site["no_change_reason"] == "frozen"),
        "late_site_count": sum(1 for site in sites if site["late"]),
        "missing_site_count": len(missing),
        "other_depth_sites": other_depths,
        "rollups": rollups,
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
    session = requests.Session()
    station_ids = [site["station"] for site in inventory["sites"]]
    depths = fetch_sensor_depths(session, station_ids, today)
    measuring = [station for station in station_ids if standard_depths(depths.get(station, []))]
    if not measuring:
        raise RuntimeError("no inventory station lists the standard soil sensors")
    begin = today - timedelta(days=WINDOW_DAYS - 1)
    records = fetch_soil(session, measuring, begin, today)
    payload = build_payload(inventory, depths, records, today)
    changed = write_atomic(args.output, payload)
    print(f"{payload['site_count']} stations' soil moisture refreshed; "
          f"{payload['measured_site_count']} with a {CHANGE_DAYS}-day change to {payload['end_date']}; "
          f"{payload['frozen_site_count']} frozen; {payload['late_site_count']} reporting late; "
          f"{args.output} {'written' if changed else 'unchanged'}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
