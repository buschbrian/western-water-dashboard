"""Refresh the daily river-flow payload, `rivers.json` (ADR-136, ADR-144, ADR-145).

A separate orchestrator for a separate measurement. It reads the reviewed
roster in `admitted_river_gauges.json`, confirms each gauge's reviewed series
is still the survey's primary daily mean, asks the U.S. Geological Survey's
v1 OGC daily collection for the last RIVER_FETCH_DAYS days, and writes 30
days per gauge. Every run reads the whole window again, so a revised
provisional value replaces the one published before it. A natural gauge's
newest value is classed against the committed day-of-year percentiles in
`river_normals.json`, which this script reads and never fetches.

    python refresh_rivers.py             # refresh and write rivers.json
    python refresh_rivers.py --dry-run   # compute everything, write nothing
    python refresh_rivers.py --only 09379500   # probe; never writes

A failed gauge carries yesterday's record forward marked late, exactly as a
reservoir's is; past the withdrawal threshold it leaves the payload for a
notice that carries no measurement (ADR-056). A payload that fails
validation, or a percentile file that fails its checks, leaves the last
complete file in place: no class is published against a normal that did not
load.
"""

import argparse
import datetime as dt
import json
import sys
import time

import pandas as pd

from pipeline import rivers
from pipeline.constants import (
    RIVER_FETCH_DAYS, RIVER_NORMALS_PATH, RIVERS_OUTPUT_PATH, local_today,
)
from pipeline.freshness import carry_forward, carry_withdrawals
from pipeline.providers import confirm_usgs_flow_series, fetch_usgs_flow_series
from pipeline.roster import admitted_river_gauges


def _read_previous(path) -> dict:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


def load_previous(path=RIVERS_OUTPUT_PATH) -> tuple[dict[str, dict], dict[str, dict]]:
    """Yesterday's records and notices, both keyed by station (ADR-126)."""
    previous = _read_previous(path)
    records = {str(r.get("source_station_id")): r for r in previous.get("gauges") or []
               if isinstance(r, dict)}
    notices = {str(n.get("source_station_id")): n for n in previous.get("withdrawn") or []
               if isinstance(n, dict) and n.get("source_station_id")}
    return records, notices


def fetch_gauge(station: str, entry: dict, start: dt.date, end: dt.date) -> list[dict]:
    series_id = entry["series"]["time_series_id"]
    confirm_usgs_flow_series(station, series_id)
    return fetch_usgs_flow_series(station, series_id, start, end)


def refresh(targets: dict[str, dict], today: pd.Timestamp, previous: dict[str, dict],
            previous_withdrawn: dict[str, dict], fetch=fetch_gauge,
            normals: dict[str, dict] | None = None) -> tuple[list[dict], list[dict]]:
    """Every gauge's record for today, or yesterday's carried forward."""
    normals = normals or {}
    end = today.date()
    start = end - dt.timedelta(days=RIVER_FETCH_DAYS - 1)
    records, carried = [], []
    for station, entry in targets.items():
        name = entry["display_name"]
        try:
            rows = fetch(station, entry, start, end)
            records.append(rivers.summarize_gauge(entry, rows, today, normals.get(station)))
        except Exception as exc:  # noqa: BLE001 -- one gauge's fault, not the run's
            reason = f"{type(exc).__name__}: {exc}"
            print(f"WARNING: {name} ({station}) -- {reason}")
            if station in previous:
                records.append(carry_forward(previous[station], today, reason))
            elif station in previous_withdrawn:
                carried.extend(carry_withdrawals(
                    [previous_withdrawn[station]], None, today,
                    roster=set(targets)))
    return records, carried


def main(argv: list[str] | None = None, *, fetch=fetch_gauge, output=RIVERS_OUTPUT_PATH,
         today: pd.Timestamp | None = None, pause: float = 0.5,
         normals_path=RIVER_NORMALS_PATH) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--only", nargs="*", metavar="SITE",
                        help="debugging aid: fetch only these gauges and print their "
                             "records. Never writes rivers.json.")
    parser.add_argument("--dry-run", action="store_true",
                        help="compute everything but don't write rivers.json")
    args = parser.parse_args(argv)

    today = local_today() if today is None else today
    roster = dict(admitted_river_gauges())
    targets = roster
    if args.only:
        wanted = set(args.only)
        targets = {s: e for s, e in roster.items()
                   if s in wanted or e["display_name"] in wanted}
        missing = wanted - set(targets) - {e["display_name"] for e in targets.values()}
        if missing:
            print(f"ERROR: unknown gauge(s): {', '.join(sorted(missing))}", file=sys.stderr)
            return 2

    try:
        normals = rivers.load_river_normals(roster, normals_path)
    except (OSError, ValueError) as exc:
        print(f"ERROR: the river percentiles did not load ({exc}); rivers.json left untouched",
              file=sys.stderr)
        return 1
    previous, previous_withdrawn = load_previous(output)

    def paced(station, entry, start, end):
        rows = fetch(station, entry, start, end)
        time.sleep(pause)
        return rows

    records, carried = refresh(targets, today, previous, previous_withdrawn, paced, normals)

    if args.only:
        print(json.dumps(records, indent=2))
        return 0

    fetched_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    payload = rivers.build_payload(records, today, fetched_at, carried)
    try:
        rivers.validate_payload(payload, roster)
    except ValueError as exc:
        print(f"ERROR: {exc}; rivers.json left untouched", file=sys.stderr)
        return 1

    for record in payload["gauges"]:
        late = f" LATE ({record['days_stale']}d)" if record["is_stale"] else ""
        band = record.get("normal_band")
        short = ", short record" if record.get("short_record") else ""
        versus = (f"; {record['flow_class']} (p25-p75 {band['p25']}-{band['p75']}, "
                  f"{band['years']} years{short})" if band
                  else f"; not compared: {record['normal_withheld']}"
                  if record.get("normal_withheld") else "")
        print(f"{record['name']}: {record['current_cfs']:,} ft^3/s on {record['as_of']} "
              f"({record['current_approval']}){versus}{late}")
    for notice in payload["withdrawn"]:
        print(f"{notice['name']}: withdrawn, last reading {notice['as_of']} "
              f"({notice['days_stale']} days)")
    if args.dry_run:
        print("Dry run: rivers.json not written")
        return 0
    output.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {output.name}: {payload['gauge_count']} gauge(s), "
          f"{payload['stale_count']} late, {payload['withdrawn_count']} withdrawn")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
