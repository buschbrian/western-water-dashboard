"""Build `river_normals.json`: day-of-year flow percentiles for natural gauges (ADR-144).

For each `natural` gauge in `admitted_river_gauges.json`, asks the U.S.
Geological Survey's statistics service (beta) for the day-of-year percentiles
of its reviewed daily mean series and commits the 10th, 25th, 50th, 75th and
90th for all 366 calendar days, with the number of years behind each day.
The service computes them from approved daily means over the whole approved
record; this tool computes nothing and estimates nothing.

    python tools/build_river_normals.py              # every natural gauge
    python tools/build_river_normals.py --only 09183500
    python tools/build_river_normals.py --dry-run    # fetch and check, write nothing
    python tools/build_river_normals.py --prune      # also drop gauges no longer natural

A builder: every run merges, and a gauge not asked about keeps its entry. A
gauge whose reply fails a check, or whose days mostly rest on 10 years or
fewer, is reported and not written (ADR-145). The key goes only in the X-Api-Key header,
and only when USGS_API_KEY is set (ADR-098). Network job: not part of any build
or CI target. The percentiles move when the survey approves another year of
values, so rebuild about once a year; `tools/check_reference_freshness.py`
says when.
"""

import argparse
import datetime as dt
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import rivers  # noqa: E402
from pipeline.constants import (  # noqa: E402
    RIVER_NORMAL_FULL_YEARS, RIVER_NORMAL_MIN_YEARS, RIVER_NORMAL_PERCENTILES,
    RIVER_NORMALS_PATH,
)
from pipeline.providers import (  # noqa: E402
    USGS_STATISTICS_NORMALS_URL, fetch_usgs_flow_normals, usgs_flow_normals_url,
)
from pipeline.roster import load_admitted_river_gauges  # noqa: E402

DESCRIPTION = (
    "Day-of-year percentiles of daily mean flow for the natural river gauges (ADR-144), "
    "as the U.S. Geological Survey's statistics service publishes them: computed from "
    "approved daily means sharing a calendar day, over the whole approved record, with "
    "the Weibull plotting position (measured against the daily record on 2026-10-31). "
    "years is the number of approved values on that day. A day with fewer than "
    f"{RIVER_NORMAL_MIN_YEARS} years, or a percentile the service gives as nan, is never "
    f"compared with; a compared day with fewer than {RIVER_NORMAL_FULL_YEARS} years is "
    "published as a short record (ADR-145). Written by tools/build_river_normals.py; "
    "never hand-edited."
)


def build_entry(station: str, series_id: str, retrieved: str, fetch=fetch_usgs_flow_normals) -> dict:
    days = fetch(station, series_id, RIVER_NORMAL_PERCENTILES)
    entry = {
        "time_series_id": series_id,
        "source_url": usgs_flow_normals_url(station),
        "retrieved": retrieved,
        "days": days,
    }
    rivers._check_normals_entry(station, entry, series_id)
    return entry


def render(document: dict) -> str:
    """Indented JSON with each calendar day on one line, so a diff reads by day."""
    text = json.dumps(document, indent=1)
    return re.sub(r'\{\n\s+"years"[^{}]*?\}',
                  lambda m: re.sub(r"\s*\n\s*", " ", m.group(0)).replace("{ ", "{")
                  .replace(" }", "}"), text) + "\n"


def summarize(station: str, entry: dict) -> str:
    days = entry["days"].values()
    withheld = [key for key, day in entry["days"].items() if rivers.withheld_reason(day)]
    years = [day["years"] for day in days]
    return (f"{station}: {min(years)}-{max(years)} years per day; "
            f"{len(withheld)} day(s) withheld{': ' + ', '.join(withheld) if withheld else ''}")


def main(argv: list[str] | None = None, *, fetch=fetch_usgs_flow_normals,
         output: Path = RIVER_NORMALS_PATH, roster: dict | None = None,
         today: dt.date | None = None, pause: float = 1.0) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--only", nargs="+", metavar="SITE",
                        help="rebuild only these natural gauges and merge them in")
    parser.add_argument("--dry-run", action="store_true", help="fetch and check, write nothing")
    parser.add_argument("--prune", action="store_true",
                        help="drop entries for gauges the roster no longer lists as natural")
    args = parser.parse_args(argv)

    roster = load_admitted_river_gauges() if roster is None else roster
    natural = {s: e for s, e in roster.items() if e["tier"]["tier"] == "natural"}
    targets = natural
    if args.only:
        unknown = sorted(set(args.only) - set(natural))
        if unknown:
            print(f"ERROR: not a natural gauge on the roster: {', '.join(unknown)}",
                  file=sys.stderr)
            return 2
        targets = {s: natural[s] for s in args.only}

    previous = (json.loads(output.read_text(encoding="utf-8"))
                if output.exists() else {})
    gauges = dict(previous.get("gauges") or {})
    retrieved = (today or dt.date.today()).isoformat()
    failed = []
    for index, (station, entry) in enumerate(targets.items()):
        if index:
            time.sleep(pause)
        try:
            built = build_entry(station, entry["series"]["time_series_id"], retrieved, fetch)
        except Exception as exc:  # noqa: BLE001 -- one gauge's fault, not the run's
            print(f"HELD OUT {station} ({entry['display_name']}): {exc}", file=sys.stderr)
            failed.append(station)
            continue
        gauges[station] = built
        print(summarize(station, built))

    if args.prune:
        for station in sorted(set(gauges) - set(natural)):
            print(f"pruned {station}: no longer a natural gauge on the roster")
            del gauges[station]
    stray = sorted(set(gauges) - set(natural))
    if stray:
        print(f"kept {', '.join(stray)}: not natural on the roster; --prune drops them")

    document = {
        "description": DESCRIPTION,
        "source": "U.S. Geological Survey",
        "source_url": USGS_STATISTICS_NORMALS_URL,
        "percentiles": list(RIVER_NORMAL_PERCENTILES),
        "min_years": RIVER_NORMAL_MIN_YEARS,
        # The oldest gauge's date, so the freshness check reports the file due
        # when its stalest entry is.
        "retrieved": min((g["retrieved"] for g in gauges.values()), default=retrieved),
        "gauges": {station: gauges[station] for station in sorted(gauges)},
    }
    if args.dry_run:
        print("Dry run: river_normals.json not written")
    elif gauges:
        output.write_text(render(document), encoding="utf-8")
        print(f"Wrote {output.name}: {len(gauges)} gauge(s)")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
