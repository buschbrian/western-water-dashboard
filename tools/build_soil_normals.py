"""Build `soil_normals.json`: each soil station's percentiles by calendar day (ADR-169).

For every snow station with the standard soil sensors (ADR-142's R4: 2 in or
4 in, 8 in and 20 in), asks the Natural Resources Conservation Service for its
whole daily record of soil moisture and soil temperature at those depths,
takes the station value for each day exactly as the daily refresh does
(frozen readings dropped), and keeps the 10th to 90th percentiles of each
calendar day over the years before the build year. See
`pipeline/soil_normals.py` for the method.

    python tools/build_soil_normals.py                    # every measuring station
    python tools/build_soil_normals.py --only 1000:OR:SNTL
    python tools/build_soil_normals.py --dry-run          # fetch and report, write nothing

A builder: every run merges, and a station not asked about keeps its entry.
Network job: not part of any build or CI target. Rebuild once a year, after
January 1, so the year just ended joins the sample. The workflow
`soil-normals-build.yml` runs this where the service is reachable.
"""

import argparse
import json
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import refresh_soil_moisture as soil  # noqa: E402
from pipeline import soil_normals  # noqa: E402

#: The service's record for soil sensors starts in the 1990s at the earliest.
RECORD_START = date(1990, 1, 1)
#: Years asked for in one request, so no one reply is very large.
CHUNK_YEARS = 6
#: Stations asked for in one request.
CHUNK_STATIONS = 10


def _request(session, stations: list[str], begin: date, end: date) -> list[dict]:
    return soil._get_json(session, soil.DATA_URL, {
        "stationTriplets": ",".join(stations),
        "elements": soil.ELEMENTS,
        "duration": "DAILY",
        "beginDate": begin.isoformat(),
        "endDate": end.isoformat(),
    }, "soil moisture record")


def _merge_series(target: dict, record: dict) -> None:
    """Append one reply's series to the station's, keyed as `_series` keys them."""
    for series in record.get("data") or []:
        element = series.get("stationElement") or {}
        key = (element.get("elementCode"), element.get("heightDepth"))
        slot = target.setdefault(key, {"stationElement": element, "values": []})
        slot["values"].extend(series.get("values") or [])


def station_values(record: dict, depths: tuple[int, int, int], begin: date, end: date) -> dict[str, float]:
    """The station value (R4, frozen dropped) for every day with one."""
    dates = []
    day = begin
    while day <= end:
        dates.append(day.isoformat())
        day += timedelta(days=1)
    days = soil.station_days(record, depths, dates)
    values = {}
    for index, day in enumerate(dates):
        value = soil.station_value(days["readings"], index)
        if value is not None:
            values[day] = value
    return values


def fetch_records(session, stations: list[str], end: date, request=_request) -> dict[str, dict]:
    """Each station's whole record, gathered over several requests."""
    gathered: dict[str, dict] = {station: {} for station in stations}
    for start in range(0, len(stations), CHUNK_STATIONS):
        batch = stations[start:start + CHUNK_STATIONS]
        year = RECORD_START.year
        while year <= end.year:
            begin = date(year, 1, 1)
            stop = min(date(year + CHUNK_YEARS - 1, 12, 31), end)
            for record in request(session, batch, begin, stop):
                station = record.get("stationTriplet")
                if station in gathered:
                    _merge_series(gathered[station], record)
            year += CHUNK_YEARS
        print(f"  fetched {min(start + CHUNK_STATIONS, len(stations))} of {len(stations)} stations",
              flush=True)
    return {station: {"stationTriplet": station, "data": list(series.values())}
            for station, series in gathered.items()}


def build_entry(station: str, record: dict, depths: tuple[int, int, int], before_year: int) -> dict | None:
    end = date(before_year - 1, 12, 31)
    values = station_values(record, depths, RECORD_START, end)
    if not values:
        return None
    days = soil_normals.station_days(values, before_year)
    return {
        "depths_inches": [-depth for depth in depths],
        "first_date": min(values),
        "last_date": max(values),
        "compared_days": sum(1 for row in days if len(row) > 1),
        "days": days,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", nargs="+", default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--output", type=Path, default=soil_normals.SOIL_NORMALS_PATH)
    args = parser.parse_args()

    today = datetime.now(ZoneInfo("America/Denver")).date()
    before_year = today.year
    inventory = json.loads(soil.INVENTORY_PATH.read_text(encoding="utf-8"))
    session = requests.Session()
    station_ids = [site["station"] for site in inventory["sites"]]
    depths = soil.fetch_sensor_depths(session, station_ids, today)
    measuring = {station: soil.standard_depths(depths.get(station, [])) for station in station_ids}
    measuring = {station: chosen for station, chosen in measuring.items() if chosen}
    if args.only:
        unknown = sorted(set(args.only) - set(measuring))
        if unknown:
            raise SystemExit(f"not a station with the standard soil sensors: {', '.join(unknown)}")
        measuring = {station: measuring[station] for station in args.only}
    print(f"{len(measuring)} station(s) with the standard soil sensors; years before {before_year}.")

    started = time.monotonic()
    records = fetch_records(session, list(measuring), date(before_year - 1, 12, 31))
    previous = soil_normals.load(args.output) if args.output.exists() else None
    stations = dict(previous["stations"]) if previous else {}
    empty = []
    for station, chosen in measuring.items():
        entry = build_entry(station, records[station], chosen, before_year)
        if entry is None:
            empty.append(station)
            stations.pop(station, None)
            continue
        stations[station] = entry
    compared = [entry["compared_days"] for entry in stations.values()]
    print(f"{len(stations)} station(s) kept; {sum(1 for c in compared if c >= 300)} compared on 300 days "
          f"or more; {sum(1 for c in compared if c == 0)} never compared; {len(empty)} with no value: "
          f"{', '.join(empty[:10])}{' ...' if len(empty) > 10 else ''}. "
          f"{time.monotonic() - started:.0f} s.")

    document = {
        "schema_version": soil_normals.SOIL_NORMALS_SCHEMA_VERSION,
        "method_version": soil_normals.SOIL_NORMALS_METHOD_VERSION,
        "description": (
            "Soil moisture percentiles for each calendar day at each snow station with the standard "
            "sensors (ADR-169): the station value of ADR-142 (mean of the 2 in or 4 in, 8 in and 20 in "
            "sensors, frozen readings dropped), one value per year on that calendar day, the 10th to "
            "90th percentile by the Weibull plotting position. A day with fewer than "
            f"{soil_normals.MIN_YEARS} years carries only its count. Position n of days is calendar day "
            "n of a 365-day year; February 29 reads February 28. Written by tools/build_soil_normals.py; "
            "never hand-edited."),
        "source": soil.DATA_URL,
        "built": today.isoformat(),
        "years_before": before_year,
        "percentiles": list(soil_normals.PERCENTILES),
        "min_years": soil_normals.MIN_YEARS,
        "row": ["years", *soil_normals.BAND_KEYS],
        "stations": stations,
    }
    soil_normals.validate(document)
    if args.dry_run:
        print("Dry run: nothing written.")
        return 0
    text = soil_normals.render(document)
    temporary = args.output.with_suffix(".json.tmp")
    temporary.write_text(text, encoding="utf-8")
    temporary.replace(args.output)
    print(f"{args.output} written, {len(text) / 1e6:.1f} MB.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
