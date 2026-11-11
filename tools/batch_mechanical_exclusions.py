"""Exclude readings that meet an ADR-152 mechanical-error test, in one reviewed batch (ADR-158).

    python tools/batch_mechanical_exclusions.py --candidates record_checks.json
    python tools/batch_mechanical_exclusions.py --stations HNT PT7
    python tools/batch_mechanical_exclusions.py --candidates record_checks.json --write

Each candidate is fetched again from its provider's own service, through the
same raw reads the refresh uses, and admitted only when all three hold:

  1. it meets an ADR-152 test exactly, with ADR-152's neighbours (the nearest
     served readings before and after that are not excluded: within 15 days in
     a daily series, three months in a monthly one);
  2. it is served unchanged today, at the same stamp with the same value;
  3. it is not part of a run, which is three or more consecutive readings at
     one value, because a run may be a real drawdown.

A candidate file is a list; items whose `rule_fired` starts with `adr152_` are
the candidates, and the file's own verdict is never the evidence. With
`--stations` the candidates are each station's lowest and highest reading, the
two a record-figure screen reports. Everything is printed with its neighbours.

A run of fewer than three readings is one exclusion unit: its members are each
other's excluded neighbours, the way ADR-152 reads a series after its earlier
exclusions are applied, and all of them are written or none.

ADR-152's fourth test, the same-day exchange with another station, needs a
second station's series and admits nothing here: such a reading stays
individual under ADR-116.

Without `--write` nothing is changed. With it, the admitted readings are
written as ADR-116 records into the provider's own admission file, and the file
is reloaded through `load_excluded_readings` before it is kept. The reason is
generated from the test. `issue_url` is a placeholder per provider
(`.../issues/BATCH-CDEC`) for the person who opens the batch's issue to replace.
"""

import argparse
import datetime as dt
import json
import sys
import urllib.parse
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import providers  # noqa: E402
from pipeline.constants import (  # noqa: E402
    ADMITTED_CDEC_RESERVOIRS_PATH, ADMITTED_RESERVOIRS_PATH, AWDB_DATA_URL, START_DATE,
    local_today,
)
from pipeline.roster import load_excluded_readings  # noqa: E402

ISSUES = "https://github.com/buschbrian/western-water-dashboard/issues"

#: One admission file, one exclusion table and one sensor rule per provider.
PROVIDERS = {
    "cdec": {"path": ADMITTED_CDEC_RESERVOIRS_PATH, "sensor": providers.CDEC_STORAGE_SENSOR},
    "awdb": {"path": ADMITTED_RESERVOIRS_PATH, "sensor": None},
}

#: ADR-152: "agree within 10 percent", and the allowances either side.
AGREE = 0.10
POWER_ALLOWANCE = 0.02
DIGIT_ALLOWANCE = 0.01
POWER_STEPS = (1, 2, 3, 4)
DIGIT_MINIMUM = 1000
RUN_LENGTH = 3
DAILY_WINDOW_DAYS = 15
MONTHLY_WINDOW_MONTHS = 3

#: Neighbours either side of a candidate are fetched this far out, so a run
#: longer than a window still shows its first readings.
FETCH_PAD_DAYS = {"daily": 40, "monthly": 250}


def agree(before: float, after: float) -> bool:
    """Both neighbours above zero and within 10 percent of the larger."""
    return min(before, after) > 0 and abs(before - after) <= AGREE * max(before, after)


def zero_test(value: float, before: float, after: float):
    if value == 0 and before > 0 and after > 0:
        return "zero", "a daily reading of 0 with both neighbours above zero"
    return None


def power_of_ten_test(value: float, before: float, after: float):
    if value <= 0 or not agree(before, after):
        return None
    low, high = min(before, after) * (1 - POWER_ALLOWANCE), max(before, after) * (1 + POWER_ALLOWANCE)
    for step in POWER_STEPS:
        for shown, scaled in ((f"x {10 ** step:,}", value * 10 ** step),
                              (f"/ {10 ** step:,}", value / 10 ** step)):
            if low <= scaled <= high:
                return ("power-of-ten shift",
                        f"{value:,.0f} {shown} = {scaled:,.0f}, between the neighbours")
    return None


def one_digit_test(value: float, before: float, after: float):
    """One digit inserted or deleted. A changed digit never qualifies."""
    if value < DIGIT_MINIMUM or value != int(value) or not agree(before, after):
        return None
    low, high = min(before, after) * (1 - DIGIT_ALLOWANCE), max(before, after) * (1 + DIGIT_ALLOWANCE)
    digits = str(int(value))
    options = [(digits[:i] + digits[i + 1:], "deleting")
               for i in range(len(digits))]
    options += [(digits[:i] + digit + digits[i:], "inserting")
                for i in range(len(digits) + 1) for digit in "0123456789"]
    for text, how in options:
        if text and text[0] != "0" and low <= int(text) <= high:
            return ("one digit dropped or added",
                    f"{how} one digit gives {int(text):,}, between the neighbours")
    return None


def mechanical_test(value: float, before: float, after: float):
    """The first ADR-152 test the reading meets, as (name, detail), or None."""
    for test in (zero_test, power_of_ten_test, one_digit_test):
        met = test(value, before, after)
        if met:
            return met
    return None


def reading_day(stamp: str, cadence: str) -> pd.Timestamp:
    day = providers._reading_day(stamp)
    if day is None:
        raise ValueError(f"unreadable stamp {stamp!r}")
    return day + pd.offsets.MonthEnd(0) if cadence == "monthly" else day


def within(day: pd.Timestamp, other: pd.Timestamp, cadence: str) -> bool:
    if cadence == "monthly":
        early, late = sorted((day, other))
        return early + pd.DateOffset(months=MONTHLY_WINDOW_MONTHS) >= late
    return abs((day - other).days) <= DAILY_WINDOW_DAYS


def neighbours(series: list[dict], group: range, member: int, cadence: str):
    """The nearest readings before and after `member` that are not excluded.

    Members of its own exclusion group and readings already excluded are
    skipped, and a neighbour must lie inside ADR-152's window. Either side is
    None where nothing qualifies.
    """
    day = series[member]["day"]
    before = after = None
    for i in range(group.start - 1, -1, -1):
        if not series[i]["excluded"]:
            before = series[i] if within(day, series[i]["day"], cadence) else None
            break
    for i in range(group.stop, len(series)):
        if not series[i]["excluded"]:
            after = series[i] if within(day, series[i]["day"], cadence) else None
            break
    return before, after


def run_around(series: list[dict], index: int) -> range:
    """The consecutive served readings at the same value as series[index]."""
    value = series[index]["value"]
    start = stop = index
    while start > 0 and series[start - 1]["value"] == value:
        start -= 1
    while stop + 1 < len(series) and series[stop + 1]["value"] == value:
        stop += 1
    return range(start, stop + 1)


def assess(series: list[dict], day: pd.Timestamp, value: float, cadence: str) -> dict:
    """ADR-158's three conditions for one candidate reading.

    `series` is every reading the provider serves, date-sorted, each as
    `{stamp, day, value, excluded}` where `excluded` marks a reading already
    excluded. Returns a verdict dict: `admitted` and, when it is not, `why`;
    when it is, `members`, one entry per reading to write with its neighbours
    and test.
    """
    index = next((i for i, row in enumerate(series)
                  if row["day"] == day and row["value"] == value), None)
    if index is None:
        return {"admitted": False, "why": "changed or absent at the provider today"}
    group = run_around(series, index)
    if len(group) >= RUN_LENGTH:
        return {"admitted": False,
                "why": f"part of a run: {len(group)} consecutive readings at {value:,.0f} "
                       f"from {series[group.start]['day']:%Y-%m-%d} "
                       f"to {series[group.stop - 1]['day']:%Y-%m-%d}"}
    members = []
    for member in group:
        before, after = neighbours(series, group, member, cadence)
        if before is None or after is None:
            return {"admitted": False,
                    "why": f"no non-excluded neighbour on both sides within the window "
                           f"of {series[member]['day']:%Y-%m-%d}"}
        met = mechanical_test(value, before["value"], after["value"])
        if met is None:
            return {"admitted": False,
                    "why": f"meets no ADR-152 test between {before['value']:,.0f} and "
                           f"{after['value']:,.0f}"}
        members.append({"stamp": series[member]["stamp"], "day": series[member]["day"],
                        "value": value, "before": before, "after": after,
                        "test": met[0], "detail": met[1]})
    return {"admitted": True, "members": members}


def build_reason(member: dict, checked_on: str) -> str:
    """The reason an exclusion carries, generated from the test and nothing else."""
    before, after = member["before"], member["after"]
    return (f"ADR-152 test met: {member['test']} ({member['detail']}). "
            f"{member['value']:,.0f} acre-feet between {before['value']:,.0f} on "
            f"{before['day']:%Y-%m-%d} and {after['value']:,.0f} on {after['day']:%Y-%m-%d}. "
            f"Served unchanged on {checked_on}, and not part of a run of three "
            f"readings at one value (ADR-158).")


def source_url(provider: str, station: str, cadence: str, first: pd.Timestamp,
               last: pd.Timestamp) -> str:
    """The provider request that returns the reading and both neighbours."""
    if provider == "cdec":
        return (f"{providers.CDEC_DATA_URL}?Stations={station}"
                f"&SensorNums={providers.CDEC_STORAGE_SENSOR}"
                f"&dur_code={'M' if cadence == 'monthly' else 'D'}"
                f"&Start={first:%Y-%m-%d}&End={last:%Y-%m-%d}")
    query = urllib.parse.urlencode({
        "stationTriplets": station, "elements": "RESC", "duration": cadence.upper(),
        "beginDate": f"{first:%Y-%m-%d}", "endDate": f"{last:%Y-%m-%d}", "periodRef": "END"})
    return f"{AWDB_DATA_URL}?{query}"


def exclusion_record(provider: str, station: str, cadence: str, member: dict,
                     checked_on: str) -> dict:
    return {
        "sensor": PROVIDERS[provider]["sensor"] if PROVIDERS[provider]["sensor"] is not None
        else station,
        "stamp": member["stamp"],
        "value": int(member["value"]) if member["value"] == int(member["value"])
        else member["value"],
        "reason": build_reason(member, checked_on),
        "source_url": source_url(provider, station, cadence, member["before"]["day"],
                                 member["after"]["day"]),
        "reviewed_on": checked_on,
        "issue_url": f"{ISSUES}/BATCH-{provider.upper()}",
    }


def fetch_series(provider: str, station: str, cadence: str, first: dt.date,
                 last: dt.date) -> list[dict]:
    """Every reading the provider serves in the range, with its own stamp.

    The same request and the same usable-value rules as `fetch_cdec_series` and
    `fetch_awdb_series`, kept before the date is normalised because the stamp
    as written is part of an exclusion. A reading the committed exclusions
    already drop is kept and marked.
    """
    begin, end = first.isoformat(), last.isoformat()
    rows = []
    if provider == "cdec":
        payload = providers._get_cdec_json({
            "Stations": station, "SensorNums": str(providers.CDEC_STORAGE_SENSOR),
            "dur_code": "M" if cadence == "monthly" else "D", "Start": begin, "End": end})
        for value in (payload if isinstance(payload, list) else []):
            reading = value.get("value")
            if not isinstance(reading, (int, float)) or isinstance(reading, bool):
                continue
            if reading == providers.CDEC_MISSING_VALUE or reading < 0:
                continue
            rows.append((value.get("date"), float(reading), providers.CDEC_EXCLUDED_READINGS))
    else:
        payload = providers._get_awdb_json({
            "stationTriplets": station, "elements": "RESC", "duration": cadence.upper(),
            "beginDate": begin, "endDate": end, "periodRef": "END"})
        for block in (payload if isinstance(payload, list) else [payload]):
            for data in block.get("data") or []:
                for value in data.get("values") or []:
                    reading = value.get("value")
                    if not isinstance(reading, (int, float)) or isinstance(reading, bool):
                        continue
                    stamp = value.get("date") if cadence != "monthly" else (
                        f"{int(value['year'])}-{int(value['month'])}")
                    rows.append((stamp, float(reading), providers.AWDB_EXCLUDED_READINGS))
    series = []
    for stamp, reading, table in rows:
        if stamp is None or providers._reading_day(stamp) is None:
            continue
        series.append({
            "stamp": stamp, "day": reading_day(stamp, cadence), "value": reading,
            "excluded": providers.excluded_reading(station, stamp, reading, table) is not None})
    series.sort(key=lambda row: row["day"])
    deduplicated = {row["day"]: row for row in series}
    return list(deduplicated.values())


def roster_provider(station: str) -> str | None:
    for provider, spec in PROVIDERS.items():
        document = json.loads(spec["path"].read_text(encoding="utf-8"))
        if station in document.get("reservoirs", {}) or station in document.get("withheld", {}):
            return provider
    return None


def candidates_from_file(path: Path) -> list[dict]:
    items = json.loads(path.read_text(encoding="utf-8"))
    found = []
    for item in items:
        if not str(item.get("rule_fired", "")).startswith("adr152_"):
            continue
        found.append({"provider": item["provider"], "station": item["station"],
                      "cadence": item.get("cadence", "daily"), "date": item["date"],
                      "value": float(item["value"]), "named": item["rule_fired"],
                      "label": item.get("flag_line", "").split(" -- ")[0]})
    return found


def candidates_from_stations(stations: list[str], cadence: str, today: dt.date) -> list[dict]:
    """Each station's lowest and highest served reading, the record-figure pair."""
    found = []
    for station in stations:
        provider = roster_provider(station)
        if provider is None:
            raise SystemExit(f"{station}: not in the CDEC or NRCS admission file")
        series = fetch_series(provider, station, cadence,
                              dt.datetime.strptime(START_DATE, "%Y%m%d").date(), today)
        live = [row for row in series if not row["excluded"]]
        if not live:
            continue
        for row in (min(live, key=lambda r: r["value"]), max(live, key=lambda r: r["value"])):
            found.append({"provider": provider, "station": station, "cadence": cadence,
                          "date": f"{row['day']:%Y-%m-%d}", "value": row["value"],
                          "named": None, "label": station})
    return found


def run(candidates: list[dict], today: dt.date) -> dict[tuple[str, str], list[dict]]:
    """Assess every candidate, print the evidence, return admitted records by provider and station."""
    checked_on = today.isoformat()
    admitted: dict[tuple[str, str], list[dict]] = {}
    tally = {"admitted": 0, "dropped": 0}
    for item in candidates:
        provider, station, cadence = item["provider"], item["station"], item["cadence"]
        if provider not in PROVIDERS or roster_provider(station) != provider:
            raise SystemExit(f"{station}: no {provider} admission file names this station")
        day = pd.Timestamp(item["date"])
        pad = pd.Timedelta(days=FETCH_PAD_DAYS[cadence])
        series = fetch_series(provider, station, cadence, (day - pad).date(),
                              min((day + pad).date(), today))
        verdict = assess(series, day, item["value"], cadence)
        print(f"{provider.upper()} {station}  {item['date']}  {item['value']:,.0f} af"
              f"  ({item['label']})")
        if not verdict["admitted"]:
            tally["dropped"] += 1
            print(f"  DROPPED: {verdict['why']}")
            continue
        for member in verdict["members"]:
            before, after = member["before"], member["after"]
            print(f"  stamp as served: {member['stamp']}")
            print(f"  neighbours: {before['value']:,.0f} on {before['day']:%Y-%m-%d} (before), "
                  f"{after['value']:,.0f} on {after['day']:%Y-%m-%d} (after)")
            print(f"  test: {member['test']} -- {member['detail']}")
            admitted.setdefault((provider, station), []).append(
                exclusion_record(provider, station, cadence, member, checked_on))
            tally["admitted"] += 1
        if item["named"] and not item["named"].startswith("adr152_"):
            print(f"  note: candidate file names {item['named']}")
        print(f"  unchanged at the provider on {checked_on}; no run of {RUN_LENGTH} or more")
        print("  ADMITTED")
    print(f"\n{tally['admitted']} reading(s) admitted, {tally['dropped']} candidate(s) dropped")
    return admitted


def write(admitted: dict[tuple[str, str], list[dict]]) -> int:
    """Add the admitted records to each provider's file, then prove it still loads."""
    written = 0
    for provider, spec in PROVIDERS.items():
        mine = {station: records for (name, station), records in admitted.items()
                if name == provider}
        if not mine:
            continue
        path = spec["path"]
        original = path.read_bytes()
        document = json.loads(original)
        existing = document.get("excluded_readings")
        if existing is None:
            # Beside `keyed_by`, where the other provider files keep it.
            document = {**{k: v for k, v in document.items() if k != "keyed_by"},
                        "excluded_readings": {}, "keyed_by": document["keyed_by"]}
            existing = document["excluded_readings"]
        for station, records in mine.items():
            have = {(r["stamp"], float(r["value"])) for r in existing.get(station, [])}
            new = [r for r in records if (r["stamp"], float(r["value"])) not in have]
            if new:
                existing.setdefault(station, []).extend(new)
                written += len(new)
        path.write_bytes((json.dumps(document, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))
        try:
            load_excluded_readings(path, spec["sensor"])
        except ValueError:
            path.write_bytes(original)
            raise
    return written


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--candidates", type=Path, help="a record-check file (JSON list)")
    parser.add_argument("--stations", nargs="+", help="stations whose record low and high are tested")
    parser.add_argument("--cadence", default="daily", choices=("daily", "monthly"),
                        help="the cadence of --stations (default daily)")
    parser.add_argument("--write", action="store_true", help="write the admitted readings")
    args = parser.parse_args(argv)
    if bool(args.candidates) == bool(args.stations):
        parser.error("give exactly one of --candidates and --stations")
    today = local_today()
    today = today.date() if hasattr(today, "date") else today
    candidates = (candidates_from_file(args.candidates) if args.candidates
                  else candidates_from_stations(args.stations, args.cadence, today))
    admitted = run(candidates, today)
    if args.write:
        print(f"wrote {write(admitted)} exclusion record(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
