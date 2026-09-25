"""Refresh the natural terminal lakes payload, `lakes.json` (ADR-112).

A separate orchestrator for a separate water type. It reads the reviewed
roster in `admitted_terminal_lakes.json`, fetches each lake's daily surface
elevation and volume from the U.S. Geological Survey's OGC daily collection,
and writes a record with no capacity, no percent full and no dam point. The
sequence is the reservoir one -- fetch, summarize, assemble, validate, write --
and the arithmetic lives in `pipeline.lakes`; nothing here is imported by
`refresh_reservoirs.py` and nothing here writes `reservoirs.json`.

    python refresh_lakes.py                 # refresh and write lakes.json
    python refresh_lakes.py --dry-run       # compute everything, write nothing
    python refresh_lakes.py --only "Walker Lake"   # probe; never writes

A failed fetch carries yesterday's record forward marked late, exactly as a
reservoir's is; past the withdrawal threshold the lake leaves the payload for
a notice that carries no measurement (ADR-056).
"""

import argparse
import datetime as dt
import json
import sys
import time

import pandas as pd

from pipeline import lakes
from pipeline.constants import LAKES_OUTPUT_PATH, START_DATE, local_today
from pipeline.freshness import carry_forward, carry_withdrawals
from pipeline.providers import (
    RETRY_ATTEMPTS, fetch_usgs_parameter_series,
)
from pipeline.roster import admitted_terminal_lakes


def _read_previous(path) -> dict:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


def load_previous(path=LAKES_OUTPUT_PATH) -> dict[str, dict]:
    """Yesterday's published records by station, for carry-forward."""
    return {str(r.get("source_station_id")): r
            for r in _read_previous(path).get("lakes") or []}


def load_previous_withdrawals(path=LAKES_OUTPUT_PATH) -> dict[str, dict]:
    """Yesterday's withdrawal notices by lake name.

    A withdrawn lake is not in `lakes`, so `load_previous` cannot carry it. A
    notice has no station id (ADR-056 fixes its fields), and the roster name
    is the key the validator checks against.
    """
    notices = _read_previous(path).get("withdrawn")
    if not isinstance(notices, list):
        return {}
    return {n["name"]: n for n in notices if isinstance(n, dict) and n.get("name")}


def fetch_lake(station: str, entry: dict, start: str, end: str
               ) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Both series for one lake, each screened to its own parameter and unit."""
    elevation = fetch_usgs_parameter_series(
        station, entry["elevation"]["parameter_code"],
        entry["elevation"]["statistic_id"], entry["elevation"]["unit"],
        start, end, column="elevation_ft")
    volume = fetch_usgs_parameter_series(
        station, entry["volume"]["parameter_code"],
        entry["volume"]["statistic_id"], entry["volume"]["unit"],
        start, end, column="volume_af")
    return elevation, volume


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="*", metavar="NAME",
                        help="debugging aid: fetch only these lakes and print the "
                             "records to stdout. Never writes lakes.json.")
    parser.add_argument("--dry-run", action="store_true",
                        help="compute everything but don't write lakes.json")
    args = parser.parse_args()

    today = local_today()
    end = (today + pd.Timedelta(days=1)).strftime("%Y%m%d")
    targets = dict(admitted_terminal_lakes())
    if args.only:
        wanted = set(args.only)
        targets = {s: e for s, e in targets.items() if e["name"] in wanted or s in wanted}
        missing = wanted - {e["name"] for e in targets.values()} - set(targets)
        if missing:
            print(f"ERROR: unknown lake(s): {', '.join(sorted(missing))}", file=sys.stderr)
            return 2

    previous = load_previous(LAKES_OUTPUT_PATH)
    previous_withdrawn = load_previous_withdrawals(LAKES_OUTPUT_PATH)
    records, carried_notices = [], []

    def carry(station: str, name: str, reason: str) -> None:
        # A lake already withdrawn has no record to carry, only its notice.
        # Without the notice the roster check fails and the lake payload
        # freezes on the day after a withdrawal.
        if station in previous:
            records.append(carry_forward(previous[station], today, reason))
        elif name in previous_withdrawn:
            carried_notices.extend(
                carry_withdrawals([previous_withdrawn[name]], set(), today))

    for station, entry in targets.items():
        name = entry["name"]
        # A lake's own record begins where the roster says its readings are on
        # one relation, and never before the project's shared start.
        start = max(START_DATE, entry["por_start"].replace("-", ""))
        try:
            elevation, volume = fetch_lake(station, entry, start, end)
        except Exception as exc:  # noqa: BLE001 -- one lake's fault, not the run's
            reason = (f"fetch failed after {RETRY_ATTEMPTS} attempts: "
                      f"{type(exc).__name__}: {exc}")
            print(f"WARNING: {name} ({station}) -- {reason}")
            carry(station, name, reason)
            continue
        if elevation.empty or volume.empty:
            which = "elevation" if elevation.empty else "volume"
            reason = f"the survey returned no usable {which} rows for the requested range"
            print(f"WARNING: {name} ({station}) -- {reason}")
            carry(station, name, reason)
            continue
        records.append(lakes.summarize_lake(entry, elevation, volume, today))
        time.sleep(0.5)

    lakes.attach_watersheds(records)

    if args.only:
        print(json.dumps(records, indent=2))
        return 0

    fetched_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    payload = lakes.build_payload(records, today, fetched_at, carried_notices)
    try:
        lakes.validate_payload(payload, targets)
    except ValueError as exc:
        # A lake that has never fetched has nothing to carry forward, so the
        # roster and the payload disagree; the daily script keeps the last
        # complete file and says why, and a traceback would say less.
        print(f"ERROR: {exc}; lakes.json left untouched", file=sys.stderr)
        return 1

    for record in payload["lakes"]:
        late = f" LATE ({record['days_stale']}d)" if record["is_stale"] else ""
        print(f"{record['name']}: {record['elevation']['current']} ft "
              f"({record['elevation']['vertical_datum']}), "
              f"{record['volume']['current']:,.0f} acre-feet as of "
              f"{record['as_of']}{late}")
    for notice in payload["withdrawn"]:
        print(f"{notice['name']}: withdrawn, last reading {notice['as_of']} "
              f"({notice['days_stale']} days)")

    if args.dry_run:
        print("Dry run: lakes.json not written")
        return 0
    LAKES_OUTPUT_PATH.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {LAKES_OUTPUT_PATH.name}: {payload['lake_count']} lake(s), "
          f"{payload['stale_count']} late, {payload['withdrawn_count']} withdrawn")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
