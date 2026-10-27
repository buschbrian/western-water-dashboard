"""Reviewed reservoir surface elevation (ADR-135).

A second measurement of a reservoir already published: its daily surface
level, above a datum the roster names with evidence. The record gains an
`elevation` block in the shape a terminal lake's level takes
(`pipeline.measurement`), and the daily series the reservoir page charts is
written to `elevation_history.json`, so `reservoirs.json` -- fetched by every
page -- carries a summary and never a series.

A level is never a percentage of anything (ADR-112): the block carries no
percentage change, and a reference level is a named elevation with its
authority, copied as reviewed.
"""

import pandas as pd

from .constants import ELEVATION_HISTORY_SCHEMA_VERSION
from .measurement import summarize_measurement

#: Fields the record's block copies from the roster beside the summary.
OFFSET_FIELDS = ("to_datum", "offset_ft", "range_ft", "readings", "usgs_site",
                 "parameters", "source_url", "measured")
LEVEL_FIELDS = ("elevation_ft", "label", "source_term", "authority", "url")


def _series(frame: pd.DataFrame) -> pd.Series:
    return frame.set_index("date")["elevation_ft"].sort_index()


def summarize_elevation(entry: dict, frame: pd.DataFrame) -> dict:
    """The `elevation` block for one rostered reservoir.

    `frame` is [date, elevation_ft] as `fetch_rise_series(..., column=
    "elevation_ft")` returns it, from the provider's first reading. Record
    extremes and the history rank are over that whole record, and the block's
    own `first_obs` says where it starts.
    """
    levels = _series(frame)
    if levels.empty:
        raise ValueError(f"{entry['name']}: no elevation readings")
    offset = entry.get("datum_offset")
    return {
        "unit": "ft",
        "vertical_datum": entry["vertical_datum"],
        # An operator's project datum travels with its name and its stated
        # relation to a national datum, so no page has to call it NGVD 1929.
        **({"datum_name": entry["datum_name"],
            "datum_relation": dict(entry["datum_relation"])}
           if "datum_relation" in entry else {}),
        "source_item_id": entry["elevation_item_id"],
        "source_url": entry["source_url"],
        **summarize_measurement(levels, levels.index[-1], places=2, with_pct=False),
        "datum_offset": (None if offset is None else
                         {key: offset[key] for key in OFFSET_FIELDS if key in offset}),
        "reference_levels": [{key: level[key] for key in LEVEL_FIELDS if key in level}
                             for level in entry.get("reference_levels") or []],
    }


def history_entry(station: str, entry: dict, frame: pd.DataFrame) -> dict:
    """One reservoir's daily levels, written once from the first day.

    Each value is the level on `start` plus its index in days; a day the
    provider did not report is null rather than left out, so the position is
    the date and no date is repeated thousands of times.
    """
    levels = _series(frame)
    days = pd.date_range(levels.index[0], levels.index[-1], freq="D")
    values = levels.reindex(days)
    return {
        "name": entry["name"],
        "source_station_id": station,
        "source_item_id": entry["elevation_item_id"],
        "vertical_datum": entry["vertical_datum"],
        "start": days[0].date().isoformat(),
        "end": days[-1].date().isoformat(),
        "values": [None if pd.isna(value) else round(float(value), 2) for value in values],
    }


def build_history_payload(entries: list[dict], fetched_at: str,
                          today: pd.Timestamp) -> dict:
    return {
        "schema_version": ELEVATION_HISTORY_SCHEMA_VERSION,
        "fetched_at": fetched_at,
        "run_date": today.date().isoformat(),
        "unit": "ft",
        "reservoirs": sorted(entries, key=lambda e: e["name"]),
    }


def validate_records(records: list[dict], roster: dict[str, dict]) -> list[str]:
    """Refuse an elevation the roster did not review; name a missing one.

    Raises for a block on a reservoir the roster does not name, a block with
    no datum, and a block carrying a percentage. Returns the names of rostered
    reservoirs published without a block -- a fetch that has never answered --
    so the run can say so without withholding everyone's storage over it.
    """
    missing = []
    for record in records:
        station = str(record.get("source_station_id"))
        block = record.get("elevation")
        if block is None:
            if station in roster:
                missing.append(record["name"])
            continue
        if station not in roster:
            raise ValueError(f"{record['name']}: an elevation the roster does not review")
        if not block.get("vertical_datum"):
            raise ValueError(f"{record['name']}: an elevation without its datum")
        spilled = sorted(key for key in block if key.endswith("_pct"))
        if spilled:
            raise ValueError(f"{record['name']}: a level has no percentage; refusing {spilled}")
    return missing


def validate_history_payload(payload: dict) -> None:
    for entry in payload["reservoirs"]:
        days = (pd.Timestamp(entry["end"]) - pd.Timestamp(entry["start"])).days + 1
        if len(entry["values"]) != days:
            raise ValueError(f"{entry['name']}: {len(entry['values'])} values for {days} days")
        if not entry.get("vertical_datum"):
            raise ValueError(f"{entry['name']}: a history without its datum")
