"""Build precipitation_history.json -- every water year since 1991 at each
snow station whose precipitation record covers all of them (ADR-122).

## Why one fixed set of stations

The chart people share from the Conservation Service draws each past year
from whichever stations reported that year: 93 sites in 2003, 115 now. The
highest and lowest lines then compare different networks, and a year looks
wet partly because a wet station joined it. Here a station enters the history
only when its record covers every water year in the window, so every year on
the chart is the same stations and a band is a statement about weather.

## Why weekly

The page needs a year's accumulation by date, for every station, for every
year, so that any drainage area, state or station set can be summed in the
browser by the same rule as the daily line. Daily values for 36 years at 460
stations are six million numbers; one value every seven days is 53 a year and
an accumulation curve is smooth enough that a straight line between them
moves a week's band by less than the week's own rain. The page says so.

## The step rule

A step's value is the station's published reading on that calendar day. If
that day is absent, the latest reading in the three days before it stands in,
and the record counts how many times that happened. Nothing is repaired: an
accumulation that falls between steps is kept as published. A station with
any step that has no reading inside the rule is not in the fixed set.

The steps are calendar days, not day counts, so a leap year compares 1 March
with 1 March.

## Not part of the daily refresh

A finished water year cannot change. This runs once each October, after the
year closes, and when the station inventory grows. Every run merges by
station; a change of window refuses to merge, because two windows are two
different populations.

    python tools/build_precipitation_history.py --dry-run
    python tools/build_precipitation_history.py
    python tools/build_precipitation_history.py --missing
    python tools/build_precipitation_history.py --only 766:UT:SNTL
"""

import argparse
import json
import os
import sys
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

ROOT = Path(__file__).resolve().parent.parent
INVENTORY_PATH = ROOT / "snow_sites.json"
OUTPUT_PATH = ROOT / "precipitation_history.json"
DATA_URL = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data"
USER_AGENT = "western-water-dashboard/precipitation-history (+https://github.com/buschbrian)"

SCHEMA_VERSION = 1
FIRST_WATER_YEAR = 1991
STEP_DAYS = 7
#: How far back a missing step may borrow a reading.
SUBSTITUTE_DAYS = 3
BATCH_SIZE = 10
DEFAULT_WORKERS = 2
TIMEOUT = 300
RETRIES = 3

RETRYABLE_REASONS = frozenset({"the provider did not answer"})


def step_month_days() -> list[str]:
    """Calendar days of the steps, read off a water year with no 29 February."""
    start = date(2026, 10, 1)
    return [(start + timedelta(days=k)).strftime("%m-%d")
            for k in range(0, 365, STEP_DAYS)]


def step_date(water_year: int, month_day: str) -> date:
    month, day = (int(part) for part in month_day.split("-"))
    return date(water_year - 1 if month >= 10 else water_year, month, day)


def last_finished_water_year(today: date) -> int:
    return today.year if today.month >= 10 else today.year - 1


def to_tenths(value: float) -> int:
    return int(round(value * 10))


def readings_by_date(record: dict) -> dict[str, float]:
    series = [
        entry for entry in record.get("data", [])
        if entry.get("stationElement", {}).get("elementCode") == "PREC"
        and entry.get("stationElement", {}).get("durationName") == "DAILY"
    ]
    if len(series) > 1:
        raise ValueError(f"{record.get('stationTriplet')} has {len(series)} "
                         "daily precipitation series")
    values = {}
    for entry in series[0]["values"] if series else []:
        value = entry.get("value")
        if isinstance(value, (int, float)):
            values[entry["date"][:10]] = float(value)
    return values


def year_steps(readings: dict[str, float], water_year: int,
               month_days: list[str]) -> tuple[list[int] | None, int]:
    """One water year's step values in tenths, and how many were borrowed.

    None when a step has no reading inside the rule.
    """
    values, substituted = [], 0
    for month_day in month_days:
        day = step_date(water_year, month_day)
        value = readings.get(day.isoformat())
        if value is None:
            for back in range(1, SUBSTITUTE_DAYS + 1):
                value = readings.get((day - timedelta(days=back)).isoformat())
                if value is not None:
                    substituted += 1
                    break
        if value is None:
            return None, substituted
        values.append(to_tenths(value))
    return values, substituted


def encode(values: list[int]) -> list[int]:
    """The first step, then each step's change: small numbers compress well."""
    return [values[0]] + [b - a for a, b in zip(values, values[1:])]


def build_site(station: str, record: dict | None, years: range,
               month_days: list[str]) -> dict:
    if record is None:
        return {"station": station, "available": False,
                "reason": "the provider did not answer"}
    readings = readings_by_date(record)
    if not readings:
        return {"station": station, "available": False,
                "reason": "no precipitation record"}
    encoded, substituted = [], 0
    for water_year in years:
        values, borrowed = year_steps(readings, water_year, month_days)
        if values is None:
            return {"station": station, "available": False,
                    "reason": "the record does not cover every water year in the window",
                    "first_gap_water_year": water_year}
        substituted += borrowed
        encoded.append(encode(values))
    return {"station": station, "available": True,
            "substituted_steps": substituted, "years": encoded}


def fetch_batch(session: requests.Session, stations: list[str],
                begin: date, end: date) -> dict[str, dict]:
    params = {
        "stationTriplets": ",".join(stations),
        "elements": "PREC",
        "duration": "DAILY",
        "beginDate": begin.isoformat(),
        "endDate": end.isoformat(),
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
            wanted = set(stations)
            return {row["stationTriplet"]: row for row in payload
                    if row.get("stationTriplet") in wanted}
        except (requests.RequestException, ValueError) as error:
            last_error = error
            if attempt + 1 < RETRIES:
                time.sleep(5 * 2 ** attempt)
    raise RuntimeError(f"precipitation history request failed: {last_error}")


def already_built(path: Path) -> dict:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def needs_building(station: str, existing_sites: dict[str, dict]) -> bool:
    record = existing_sites.get(station)
    if record is None:
        return True
    return not record["available"] and record.get("reason") in RETRYABLE_REASONS


def build_payload(sites: list[dict], *, first: int, last: int,
                  month_days: list[str], checked: str) -> dict:
    available = [site for site in sites if site["available"]]
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_by": "tools/build_precipitation_history.py",
        "checked": checked,
        "source": DATA_URL,
        "element": "PREC",
        "units": "tenths of an inch, accumulated since 1 October",
        "encoding": "per year: the first step's value, then each step's change",
        "first_water_year": first,
        "last_water_year": last,
        "step_month_days": month_days,
        "substitute_days": SUBSTITUTE_DAYS,
        "site_count": len(sites),
        "available_site_count": len(available),
        "sites": sorted(sites, key=lambda site: site["station"]),
    }


def write_atomic(path: Path, payload: dict) -> None:
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n"
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(body)
        os.replace(temporary, path)
        os.chmod(path, 0o644)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--inventory", type=Path, default=INVENTORY_PATH)
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--through", type=int, default=None, metavar="WATER_YEAR",
                        help="last water year in the window (default: the last finished one)")
    parser.add_argument("--only", nargs="+", default=None, metavar="STATION")
    parser.add_argument("--missing", action="store_true")
    parser.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.only and args.missing:
        print("ERROR: --only names the stations and --missing works them out; "
              "use one.", file=sys.stderr)
        return 2

    today = datetime.now(ZoneInfo("America/Denver")).date()
    last = args.through or last_finished_water_year(today)
    years = range(FIRST_WATER_YEAR, last + 1)
    month_days = step_month_days()
    roster = [site["station"] for site in
              json.loads(args.inventory.read_text(encoding="utf-8"))["sites"]]

    existing = already_built(args.output)
    if existing and (existing.get("first_water_year"), existing.get("last_water_year")) \
            != (FIRST_WATER_YEAR, last):
        if args.only or args.missing:
            print(f"ERROR: the committed history covers "
                  f"{existing.get('first_water_year')}-{existing.get('last_water_year')}, "
                  f"not {FIRST_WATER_YEAR}-{last}. Two windows are two populations; "
                  "run without --only or --missing to rebuild every station.",
                  file=sys.stderr)
            return 2
        existing = {}
    existing_sites = {site["station"]: site for site in existing.get("sites", [])}

    if args.only:
        unknown = sorted(set(args.only) - set(roster))
        if unknown:
            print(f"ERROR: not in the inventory: {', '.join(unknown)}", file=sys.stderr)
            return 2
        selected = [station for station in roster if station in set(args.only)]
    elif args.missing:
        selected = [station for station in roster if needs_building(station, existing_sites)]
    else:
        selected = list(roster)

    print(f"Window {FIRST_WATER_YEAR}-{last}: {len(selected)} of {len(roster)} stations to fetch.")
    if args.dry_run or not selected:
        return 0

    begin = step_date(FIRST_WATER_YEAR, "10-01") - timedelta(days=SUBSTITUTE_DAYS)
    end = date(last, 9, 30)
    batches = [selected[i:i + BATCH_SIZE] for i in range(0, len(selected), BATCH_SIZE)]
    session = requests.Session()
    built: dict[str, dict] = {}

    def run(batch: list[str]) -> list[dict]:
        try:
            records = fetch_batch(session, batch, begin, end)
        except RuntimeError as error:
            print(f"  batch starting {batch[0]} failed: {error}", file=sys.stderr)
            records = {}
        return [build_site(station, records.get(station), years, month_days)
                for station in batch]

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(run, batch) for batch in batches]
        for done, future in enumerate(as_completed(futures), start=1):
            for site in future.result():
                built[site["station"]] = site
            print(f"  {done}/{len(batches)} batches", flush=True)

    roster_set = set(roster)
    merged = {station: site for station, site in existing_sites.items()
              if station in roster_set and station not in built}
    merged.update(built)
    payload = build_payload(list(merged.values()), first=FIRST_WATER_YEAR, last=last,
                            month_days=month_days, checked=today.isoformat())
    write_atomic(args.output, payload)
    unanswered = sum(1 for site in merged.values()
                     if site.get("reason") in RETRYABLE_REASONS)
    print(f"{payload['available_site_count']} of {payload['site_count']} stations cover "
          f"every water year {FIRST_WATER_YEAR}-{last}; {unanswered} did not answer "
          f"(run --missing to ask again). Wrote {args.output}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
