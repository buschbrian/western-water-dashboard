"""Add the gauge worksheets' bulk-queue rows to `admitted_river_gauges.json` (ADR-168).

Brian Busch directed on 2026-11-14 that every river gauge the worksheets can
publish be added. ADR-138 lets the two ADR-137 outcomes be agreed in bulk, and
the worksheets already name the rows where nothing else is in doubt: queue
`bulk`. This tool turns those rows into roster entries and nothing more.

A row is admitted when all of these hold, and every other bulk row is listed
with the reason it was held:

- `review_queue` is `bulk` and `suggested_ruling` is `reservoir` (published as
  `shaped`) or `natural`, and `reviewer_ruling` is blank or the same tier;
- the record covers 1991-2020 and the basin is traced;
- the display name (`accepted_display_name`, else `proposed_display_name`) has
  no open `name_check` and is not already used by another gauge;
- for `natural`: no published reservoir upstream, storage under 10% of a year's
  flow, and a GAGES-II `reference` class (the published natural gauges all are);
- the survey lists exactly one primary daily mean flow series in ft^3/s.

    python tools/admit_bulk_river_gauges.py --plan   # no network; print the selection
    python tools/admit_bulk_river_gauges.py          # look up each series and merge

A builder that merges: an entry already on the roster is never changed, and a
row the survey refuses is held, not guessed. Network job (one metadata request
per new gauge); not part of any build or CI target. The worksheets are read,
never written; `reviewer_ruling` stays blank until the review page's export is
imported.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline.providers import (  # noqa: E402
    USGS_FLOW_UNIT, _usgs_v1_features, usgs_flow_metadata_url,
)
from pipeline.roster import (  # noqa: E402
    ADMITTED_RIVER_GAUGES_PATH, RIVER_NATURAL_STORAGE_SHARE_PCT, load_admitted_river_gauges,
)

#: The worksheets and the state each one screened by the survey's state code.
WORKSHEETS = {
    "gauge-review.csv": "UT",
    "gauge-review-co.csv": "CO",
    "gauge-review-nm.csv": "NM",
    "gauge-review-az.csv": "AZ",
}
#: Words naming a built channel rather than a river. ADR-138's not-a-river
#: rule names tunnels, drains and canals; these slip past it, so a person
#: decides each one rather than this tool.
WATERWORK_WORDS = ("wasteway", "canal", "ditch", "drain", "tunnel", "lateral",
                   "conduit", "flume", "outlet")
TIER_FOR_SUGGESTION = {"reservoir": "shaped", "natural": "natural"}
#: A person's ruling in the review page, imported into `reviewer_ruling`,
#: admits a row from any queue (Brian, 2026-11-14).
RULED_TIERS = {"reservoir": "shaped", "natural": "natural"}
RULED_ON = re.compile(r"Ruled \w+ by Brian Busch in the review page on (\d{4}-\d\d-\d\d)")
DIRECTED_BY = "Brian Busch"
DIRECTED_ON = "2026-11-14"
#: ADR-138: Brian agreed on 2026-10-27 that both ADR-137 outcomes may be
#: agreed in bulk. That is the ruling a bulk natural row rests on.
BULK_RULED_ON = "2026-10-27"
STATUS = "pending_formal_ruling"


def _number(text: str):
    if text in ("", None):
        return None
    value = float(text)
    return int(value) if value.is_integer() and "." not in text else value


def _reservoirs(text: str) -> list[str]:
    return [name.strip() for name in (text or "").split(";") if name.strip()]


def read_bulk_rows(root: Path = ROOT) -> list[dict]:
    rows = []
    for worksheet, state in WORKSHEETS.items():
        with (root / worksheet).open(newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                if row["review_queue"] == "bulk" or row["reviewer_ruling"] in RULED_TIERS:
                    rows.append({**row, "_worksheet": worksheet, "_state": state})
    return rows


def display_name(row: dict) -> str:
    return (row.get("accepted_display_name") or row["proposed_display_name"]).strip()


def ruled(row: dict) -> bool:
    return (row.get("reviewer_ruling") or "") in RULED_TIERS


def tier_of(row: dict) -> str | None:
    if ruled(row):
        return RULED_TIERS[row["reviewer_ruling"]]
    return TIER_FOR_SUGGESTION.get(row["suggested_ruling"])


def held_reason(row: dict, names_in_use: set[str]) -> str | None:
    """Why a row is not admitted here, or None when it is."""
    suggestion = row["suggested_ruling"]
    ruling = row.get("reviewer_ruling") or ""
    tier = tier_of(row)
    if ruling and not ruled(row):
        return f"reviewer ruled {ruling}: not a published tier"
    if tier is None:
        return f"suggested {suggestion}: not a published tier"
    if not ruled(row) and row["covers_1991_2020"] != "yes":
        return "record does not cover 1991-2020"
    if row["trace_screen"] != "traced":
        return f"basin trace is {row['trace_screen'] or 'missing'}"
    if row["name_check"]:
        return f"display name needs a person: {row['name_check']}"
    channel = [word for word in WATERWORK_WORDS
               if word in display_name(row).lower().split(" above ")[0].split()]
    if channel:
        return f"the name calls the gauge's own water a {channel[0]}: a person decides"
    if display_name(row) in names_in_use:
        return f"display name {display_name(row)!r} is already used"
    if tier == "natural":
        share = _number(row["storage_share_pct"])
        if _reservoirs(row["upstream_reservoirs"]) or share is None \
                or share >= RIVER_NATURAL_STORAGE_SHARE_PCT:
            return "natural suggestion does not meet ADR-137 on the evidence"
        years = _number(row["flow_years"])
        if years is None or years <= 10:
            return f"natural, but only {years} years of flow: too few to compare (ADR-145)"
        if not ruled(row) and row["gages2_class"] != "reference":
            return f"natural, but GAGES-II class is {row['gages2_class']}, not reference"
    return None


def evidence(row: dict) -> dict:
    published = row["drainage_area_sq_mi"]
    trace = f"traced; NLDI basin {int(float(row['nldi_basin_sq_mi'])):,} sq mi" + (
        f" against a published {_published_area(published)}" if published
        else "; the survey publishes no drainage area")
    return {
        "worksheet": row["_worksheet"],
        "screened_on": row["screened_on"],
        "suggested_ruling": row["suggested_ruling"],
        "review_queue": row["review_queue"],
        "published_reservoirs_upstream": _reservoirs(row["upstream_reservoirs"]),
        "dams_upstream": _number(row["dams_upstream"]),
        "dam_storage_af": _number(row["dam_storage_af"]),
        "storage_share_pct": _number(row["storage_share_pct"]),
        "largest_dams": row["largest_dams"],
        "irrigation_dams": _number(row["irrigation_dams"]),
        "gages2_class": row["gages2_class"],
        "nrcs_adjustment_pct": row["nrcs_adjustment_pct"],
        "flow_years": _number(row["flow_years"]),
        "trace": trace,
    }


def _published_area(text: str) -> str:
    value = float(text)
    return f"{value:,.0f}" if value >= 100 else f"{value:g}"


def ruled_on(row: dict) -> str | None:
    found = RULED_ON.search(row.get("notes") or "")
    return found.group(1) if found else None


def basis(row: dict, tier: str) -> str:
    found = evidence(row)
    reservoirs = found["published_reservoirs_upstream"]
    share = found["storage_share_pct"]
    if tier == "shaped" and reservoirs:
        first = f"ADR-137: {len(reservoirs)} published reservoir(s) inside the traced basin."
    elif tier == "shaped":
        first = (f"ADR-137: no published reservoir in the traced basin, but inventoried dams "
                 f"hold {share}% of a year's flow, at or above 10%.")
    else:
        first = (f"ADR-137: no published reservoir in the traced basin; storage is {share}% "
                 "of a year's flow, under 10%; a GAGES-II reference gauge.")
    if ruled(row):
        when = ruled_on(row) or "an unrecorded date"
        return (f"{first} Ruled {row['reviewer_ruling']} by Brian Busch in the review page on "
                f"{when}; added at his direction of {DIRECTED_ON}.")
    return (f"{first} Worksheet bulk queue (ADR-138), added at Brian Busch's direction of "
            f"{DIRECTED_ON} to publish every gauge the worksheets can.")


def lookup_series(station: str, today: str, features=None) -> dict:
    """The one primary daily mean flow series, or a refusal naming what was found."""
    if features is None:
        features = _usgs_v1_features(usgs_flow_metadata_url(station))
    primary = [f for f in features
               if (f.get("properties") or {}).get("primary") == "Primary"
               and (f.get("properties") or {}).get("unit_of_measure") == USGS_FLOW_UNIT]
    if len(primary) != 1 or not primary[0].get("id"):
        raise ValueError(f"{station}: expected one primary daily mean flow series, "
                         f"found {[f.get('id') for f in primary]}")
    props = primary[0]["properties"]
    begin = str(props.get("begin") or "")[:10]
    dt.date.fromisoformat(begin)  # refuses a missing or malformed start
    return {
        "time_series_id": primary[0]["id"],
        "parameter_code": "00060",
        "statistic_id": "00003",
        "unit": USGS_FLOW_UNIT,
        "record_begin": begin,
        "source_url": usgs_flow_metadata_url(station),
        "checked": today,
    }


def entry(row: dict, series: dict) -> dict:
    tier = tier_of(row)
    station = row["usgs_site_no"]
    built = {
        "station": station,
        "display_name": display_name(row),
        "usgs_name": row["site_name"],
        "state": row["_state"],
        "lat": float(row["latitude"]),
        "lon": float(row["longitude"]),
        "drainage_area_sq_mi": (float(row["drainage_area_sq_mi"])
                                if row["drainage_area_sq_mi"] else None),
        "huc8": row["huc8"],
        "huc8_name": row["huc8_name"],
        "usgs_page": row["usgs_page"],
        "series": series,
        "tier": {
            "tier": tier,
            "basis": basis(row, tier),
            "directed_by": DIRECTED_BY,
            "directed_on": DIRECTED_ON,
            "status": f"ruled_{tier}" if ruled(row) else STATUS,
            "evidence": evidence(row),
        },
    }
    if tier == "natural":
        built["tier"]["tier_ruled_on"] = (ruled_on(row) if ruled(row) else None) or BULK_RULED_ON
    return built


def select(rows: list[dict], roster: dict) -> tuple[list[dict], list[tuple[dict, str]]]:
    names = {e["display_name"] for e in roster.values()}
    chosen, held = [], []
    for row in rows:
        if row["usgs_site_no"] in roster:
            continue
        reason = held_reason(row, names)
        if reason:
            held.append((row, reason))
        else:
            names.add(display_name(row))
            chosen.append(row)
    return chosen, held


def render(document: dict) -> str:
    """The roster's own layout: two-space indent, a list of names on one line."""
    text = json.dumps(document, indent=2, ensure_ascii=False)
    return re.sub(r'\[\n\s+("(?:[^"\\]|\\.)*"(?:,\n\s+"(?:[^"\\]|\\.)*")*)\n\s+\]',
                  lambda m: "[" + re.sub(r",\n\s+", ", ", m.group(1)) + "]", text) + "\n"


def main(argv: list[str] | None = None, *, lookup=lookup_series,
         path: Path = ADMITTED_RIVER_GAUGES_PATH, root: Path = ROOT,
         today: dt.date | None = None, pause: float = 0.5) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--plan", action="store_true",
                        help="print the selection and the held rows; no network, no write")
    args = parser.parse_args(argv)

    today_text = (today or dt.date.today()).isoformat()
    document = json.loads(path.read_text(encoding="utf-8"))
    roster = load_admitted_river_gauges(path)
    chosen, held = select(read_bulk_rows(root), roster)
    for row, reason in held:
        print(f"HELD {row['usgs_site_no']} {display_name(row)} ({row['_state']}): {reason}")
    if args.plan:
        for row in chosen:
            print(f"ADD  {row['usgs_site_no']} {display_name(row)} ({row['_state']}): "
                  f"{tier_of(row)}{' (ruled)' if ruled(row) else ''}")
        print(f"Plan: {len(chosen)} to add, {len(held)} held, {len(roster)} already published")
        return 0

    gauges = dict(document["gauges"])
    failed = 0
    for index, row in enumerate(chosen):
        if index:
            time.sleep(pause)
        station = row["usgs_site_no"]
        try:
            series = lookup(station, today_text)
        except Exception as exc:  # noqa: BLE001 -- one gauge's fault, not the run's
            print(f"HELD {station} {display_name(row)} ({row['_state']}): {exc}")
            failed += 1
            continue
        gauges[station] = entry(row, series)
        print(f"ADD  {station} {display_name(row)}: {gauges[station]['tier']['tier']}")
    added = len(gauges) - len(document["gauges"])
    if not added:
        print("Nothing added; roster unchanged")
        return 1 if failed else 0
    document["gauges"] = gauges
    document["reviewed"] = today_text
    document["selection"] = document["selection"].rstrip() + (
        f" On {DIRECTED_ON} Brian Busch directed that every gauge the worksheets can publish "
        f"be added (ADR-168): {added} more from the Utah, Colorado, New Mexico and Arizona "
        "worksheets' bulk queue, written by tools/admit_bulk_river_gauges.py, each pending "
        "his formal ruling.")
    candidate = path.with_suffix(".candidate.json")
    candidate.write_text(render(document), encoding="utf-8")
    try:
        load_admitted_river_gauges(candidate)
    except ValueError as exc:
        candidate.unlink()
        print(f"ERROR: the merged roster fails its loader ({exc}); nothing written",
              file=sys.stderr)
        return 1
    candidate.replace(path)
    print(f"Wrote {path.name}: {added} added, {failed} held by the survey, "
          f"{len(gauges)} in all")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
