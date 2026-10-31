"""Daily river flow kept day by day in `river_history.json` (ADR-146).

`rivers.json` holds the last 30 days at each gauge. This file keeps every day
the daily refresh has read, so a later chart or analysis can look further back
than 30 days. For each gauge it keeps the survey's daily mean flow, the
review status and qualifiers of that value and, at a natural gauge, the flow
class of that day. The class is kept because `river_normals.json` is not
published, so a reader of this file could not work it out.

Every run reads the 30-day window again, so a revised value replaces the one
stored for that day. A day a run does not report stays as stored. A gauge
that leaves `rivers.json` for old data keeps its stored days. Nothing is
deleted: see ADR-146 for the size.
"""

import datetime as dt
from pathlib import Path

import pandas as pd

from . import daily_history as history, rivers

ROOT = Path(__file__).resolve().parent.parent
RIVER_HISTORY_PATH = ROOT / "river_history.json"
RIVER_HISTORY_SCHEMA_VERSION = 1

COLUMNS = ("cfs", "approval", "qualifiers")
CLASS_COLUMN = "flow_class"
ENTRY_FIELDS = frozenset({"name", "source_station_id", "time_series_id", "tier",
                          "start", "end", *COLUMNS, CLASS_COLUMN})
APPROVALS = frozenset({"Provisional", "Approved"})


def _columns(tier: str) -> tuple[str, ...]:
    return COLUMNS + ((CLASS_COLUMN,) if tier == "natural" else ())


def _classes(record: dict, normals: dict | None) -> dict[str, str | None]:
    """The class of each reported day in a natural record's window."""
    if record["tier"] != "natural":
        return {}
    classes = {}
    for row in record["daily"]:
        if row["cfs"] is None:
            continue
        fields = rivers.normal_fields(normals, dt.date.fromisoformat(row["date"]), row["cfs"])
        classes[row["date"]] = fields["flow_class"]
    return classes


def gauge_entry(record: dict, previous: dict | None, normals: dict | None) -> dict:
    """One gauge's stored days with this run's window merged in."""
    tier = record["tier"]
    columns = _columns(tier)
    classes = _classes(record, normals)
    reported = {}
    for row in record["daily"]:
        day = {"cfs": row["cfs"], "approval": row["approval"],
               "qualifiers": list(row["qualifiers"])}
        if tier == "natural":
            day[CLASS_COLUMN] = classes.get(row["date"])
        reported[row["date"]] = day
    stored = history.decode(previous, _columns(previous["tier"])) if previous else {}
    merged = history.merge(stored, reported, "cfs")
    return {
        "name": record["name"],
        "source_station_id": record["source_station_id"],
        "time_series_id": record["time_series_id"],
        "tier": tier,
        **history.encode(merged, columns),
    }


def build_payload(payload: dict, previous: dict, normals: dict[str, dict],
                  today: pd.Timestamp, fetched_at: str) -> dict:
    """The history file for this run: every gauge ever stored, merged by date."""
    stored = {str(e["source_station_id"]): e for e in previous.get("gauges") or []
              if isinstance(e, dict)}
    for record in payload["gauges"]:
        if not record.get("fetch_ok"):
            continue  # a carried-forward record adds nothing the file does not hold
        station = str(record["source_station_id"])
        stored[station] = gauge_entry(record, stored.get(station), normals.get(station))
    return {
        "schema_version": RIVER_HISTORY_SCHEMA_VERSION,
        "measurement": rivers.MEASUREMENT,
        "fetched_at": fetched_at,
        "run_date": today.date().isoformat(),
        "unit": "ft^3/s",
        "gauges": sorted(stored.values(), key=lambda e: (e["name"], e["source_station_id"])),
    }


def validate_payload(payload: dict) -> None:
    """Refuse a file whose columns drift, or that claims what a gauge cannot."""
    spilled = rivers.REFUSED_FIELDS & set(payload)
    if spilled:
        raise ValueError(f"the history never adds gauges together; refusing {sorted(spilled)}")
    seen = set()
    for entry in payload["gauges"]:
        label = entry.get("name")
        if set(entry) != ENTRY_FIELDS - ({CLASS_COLUMN} if entry.get("tier") == "shaped" else set()):
            raise ValueError(f"{label}: unexpected fields {sorted(set(entry) ^ ENTRY_FIELDS)}")
        if entry["tier"] not in ("shaped", "natural"):
            raise ValueError(f"{label}: unknown tier {entry['tier']!r}")
        if entry["source_station_id"] in seen:
            raise ValueError(f"{label}: a gauge appears twice")
        seen.add(entry["source_station_id"])
        history.check_dense(label, entry, _columns(entry["tier"]))
        for index, cfs in enumerate(entry["cfs"]):
            approval, qualifiers = entry["approval"][index], entry["qualifiers"][index]
            if cfs is None:
                if approval is not None or qualifiers is not None \
                        or entry.get(CLASS_COLUMN, [None] * len(entry["cfs"]))[index] is not None:
                    raise ValueError(f"{label}: a day with no flow carries other values")
                continue
            if isinstance(cfs, bool) or not isinstance(cfs, (int, float)) or cfs < 0:
                raise ValueError(f"{label}: day {index} has an impossible flow")
            if approval not in APPROVALS or not isinstance(qualifiers, list):
                raise ValueError(f"{label}: day {index} has no review status")
        if entry["tier"] == "natural":
            if any(c is not None and c not in rivers.FLOW_CLASSES for c in entry[CLASS_COLUMN]):
                raise ValueError(f"{label}: an unknown flow class")


def update(payload: dict, normals: dict[str, dict], today: pd.Timestamp, fetched_at: str,
           path: Path = RIVER_HISTORY_PATH) -> int:
    """Merge a validated `rivers.json` payload into the history file; returns gauges kept."""
    built = build_payload(payload, history.read_json(path), normals, today, fetched_at)
    validate_payload(built)
    history.write_compact(path, built)
    return len(built["gauges"])
