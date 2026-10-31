"""The week's change in soil moisture kept day by day (ADR-146).

`soil_moisture.json` holds 15 days of readings and one week's change. This
file keeps, for each refresh date, what that file published for each drainage
area: the mean change in percentage points, the stations it rests on, and the
stations in the area. It also keeps the day each change ended on and how many
stations had a change. The grain is the drainage area, not the station: the
Natural Resources Conservation Service serves every station's full record, but
only this site knows the figure it published on a given day.

Only the day a run publishes is stored. No earlier day is rebuilt, because the
end day of a week depends on that day's coverage and no file holds it. A second
run on the same date replaces that date. A date is never removed.
"""

from pathlib import Path

from . import daily_history as history

ROOT = Path(__file__).resolve().parent.parent
SOIL_HISTORY_PATH = ROOT / "soil_moisture_history.json"
SOIL_HISTORY_SCHEMA_VERSION = 1

HEADER_COLUMNS = ("end_date", "site_count", "measured_site_count")
AREA_COLUMNS = ("site_count", "measured_site_count", "mean_change_points")
AREA_FIELDS = frozenset({"huc6", "huc6_name", *AREA_COLUMNS})


def _flat(huc6: str, column: str) -> str:
    return f"{huc6}/{column}"


def _flat_columns(areas: list[dict]) -> tuple[str, ...]:
    return HEADER_COLUMNS + tuple(_flat(a["huc6"], c) for a in areas for c in AREA_COLUMNS)


def _stored_areas(previous: dict) -> list[dict]:
    return [a for a in previous.get("areas") or [] if isinstance(a, dict)]


def build_payload(soil: dict, previous: dict, fetched_at: str) -> dict:
    """The history file for this run: the stored dates with today's published figures."""
    as_of = soil["as_of"]
    names = {a["huc6"]: a["huc6_name"] for a in _stored_areas(previous)}
    names.update({r["huc6"]: r["huc6_name"] for r in soil["rollups"]})
    codes = sorted(names)
    areas = [{"huc6": code, "huc6_name": names[code]} for code in codes]
    columns = _flat_columns(areas)

    stored = {}
    if previous.get("start"):
        # Rebuild the stored dates on today's full set of areas.
        header = history.decode(previous, HEADER_COLUMNS)
        for index, (day, row) in enumerate(header.items()):
            stored[day] = dict(row)
            for area in _stored_areas(previous):
                for column in AREA_COLUMNS:
                    stored[day][_flat(area["huc6"], column)] = area[column][index]

    today = {"end_date": soil["end_date"], "site_count": soil["site_count"],
             "measured_site_count": soil["measured_site_count"]}
    for rollup in soil["rollups"]:
        for column in AREA_COLUMNS:
            today[_flat(rollup["huc6"], column)] = rollup[column]
    merged = history.merge(stored, {as_of: today}, "site_count")
    flat = history.encode(merged, columns)

    return {
        "schema_version": SOIL_HISTORY_SCHEMA_VERSION,
        "fetched_at": fetched_at,
        "run_date": as_of,
        "units": "percentage points of the soil's volume",
        "change_days": soil["change_days"],
        "start": flat["start"],
        "end": flat["end"],
        **{column: flat[column] for column in HEADER_COLUMNS},
        "areas": [{**area, **{c: flat[_flat(area["huc6"], c)] for c in AREA_COLUMNS}}
                  for area in areas],
    }


def validate_payload(payload: dict) -> None:
    history.check_dense("soil history", payload, HEADER_COLUMNS)
    count = len(payload["site_count"])
    seen = set()
    for area in payload["areas"]:
        label = area.get("huc6_name")
        if set(area) != AREA_FIELDS:
            raise ValueError(f"{label}: unexpected fields {sorted(set(area) ^ AREA_FIELDS)}")
        if area["huc6"] in seen:
            raise ValueError(f"{label}: an area appears twice")
        seen.add(area["huc6"])
        history.check_dense(label, {"start": payload["start"], "end": payload["end"], **area},
                            AREA_COLUMNS)
        for index in range(count):
            sites, measured = area["site_count"][index], area["measured_site_count"][index]
            mean = area["mean_change_points"][index]
            if (sites is None) != (measured is None):
                raise ValueError(f"{label}: day {index} counts stations only in part")
            if sites is None:
                if mean is not None:
                    raise ValueError(f"{label}: day {index} has a change and no stations")
                continue
            if measured > sites or measured < 0:
                raise ValueError(f"{label}: day {index} has more measured stations than stations")
            if mean is not None and (isinstance(mean, bool) or not isinstance(mean, (int, float))
                                     or abs(mean) > 100):
                raise ValueError(f"{label}: day {index} has an impossible change")
    for index in range(count):
        if payload["site_count"][index] is None and payload["end_date"][index] is not None:
            raise ValueError(f"day {index} has an end date and no stations")


def update(soil: dict, fetched_at: str, path: Path = SOIL_HISTORY_PATH) -> int:
    """Merge a built `soil_moisture.json` payload into the history file; returns dates kept."""
    built = build_payload(soil, history.read_json(path), fetched_at)
    validate_payload(built)
    history.write_compact(path, built)
    return len(built["site_count"])
