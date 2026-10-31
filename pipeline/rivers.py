"""Daily mean river flow at reviewed gauges (ADR-136, ADR-144).

A gauge measures a rate, not a volume held: there is no full level and no
percent full. What a record publishes is the survey's own daily means for the
last 30 reported days, each with its approval status and qualifiers, the
newest of them, and the change from seven days earlier. A shaped gauge has no
normal to compare with. A natural gauge's newest value is placed among the
survey's own day-of-year percentiles for that calendar day (ADR-144); nothing
here computes a percentile.

Two rules from ADR-124 are mechanical here. No field adds gauges together,
and nothing names a gauge as a reservoir's inflow; `validate_payload` refuses
a payload that tries either.
"""

import datetime as dt
import json
import math
import statistics
from pathlib import Path

import pandas as pd

from .constants import (
    RIVER_NORMAL_MIN_YEARS, RIVER_NORMAL_PERCENTILES, RIVER_NORMALS_PATH,
    RIVER_SCHEMA_VERSION, RIVER_WINDOW_DAYS, STALE_AFTER_DAYS, WITHDRAW_AFTER_DAYS,
)
from .freshness import partition_by_age, withdrawal_notice
from .providers import DAYS_OF_YEAR, usgs_flow_daily_url

SOURCE_KEY = "usgs"
SOURCE_LABEL = "U.S. Geological Survey"
MEASUREMENT = "daily_mean_flow"

#: Fields no river record or envelope may carry. A normal or a rank needs a
#: method this payload does not have; a total would add water that downstream
#: gauges measure again; an inflow is a claim about a reservoir.
REFUSED_FIELDS = frozenset({
    "normal_cfs", "pct_of_normal", "seasonal_rank", "seasonal_rank_of", "percentile",
    "total_cfs", "combined_cfs", "sum_cfs", "inflow_cfs", "inflow",
    "capacity_af", "pct_of_capacity",
})

NOTICE_FIELDS = frozenset({
    "name", "as_of", "days_stale", "source_label", "reason", "source_station_id",
})

#: The comparison a natural record carries and a shaped record never does.
NORMAL_FIELDS = frozenset({"normal_band", "flow_class", "normal_withheld"})
BAND_KEYS = tuple(f"p{p}" for p in RIVER_NORMAL_PERCENTILES)
BAND_FIELDS = frozenset({"day", *BAND_KEYS, "years", "retrieved", "source_url"})
#: WaterWatch's five classes, lowest first.
FLOW_CLASSES = ("much_below_normal", "below_normal", "normal", "above_normal",
                "much_above_normal")
#: Why a natural gauge's day carries no comparison.
WITHHELD_REASONS = frozenset({"fewer_than_30_years", "percentile_missing"})


class NoReportedFlow(ValueError):
    """The survey answered, and no day in the window carries a value."""


def flow_class(cfs: float, band: dict) -> str:
    """WaterWatch's class for a flow against one day's percentiles.

    Under the 10th is much below, under the 25th below, the 25th to the 75th
    normal, up to the 90th above, over it much above. A value equal to a
    boundary takes the class nearer normal, on both sides alike.
    """
    if cfs < band["p10"]:
        return "much_below_normal"
    if cfs < band["p25"]:
        return "below_normal"
    if cfs <= band["p75"]:
        return "normal"
    if cfs <= band["p90"]:
        return "above_normal"
    return "much_above_normal"


def withheld_reason(day: dict) -> str | None:
    """Why a stored day cannot be compared, or None when it can."""
    if day["years"] < RIVER_NORMAL_MIN_YEARS:
        return "fewer_than_30_years"
    if any(day.get(key) is None for key in BAND_KEYS):
        return "percentile_missing"
    return None


def _check_normals_entry(station: str, entry: dict, series_id: str) -> None:
    if entry.get("time_series_id") != series_id:
        raise ValueError(
            f"{station}: the percentiles belong to {entry.get('time_series_id')!r}, "
            f"not the reviewed series {series_id}")
    if not str(entry.get("source_url", "")).startswith("https://"):
        raise ValueError(f"{station}: the percentiles must name an HTTPS source")
    dt.date.fromisoformat(entry.get("retrieved", ""))
    days = entry.get("days")
    if not isinstance(days, dict) or list(days) != list(DAYS_OF_YEAR):
        raise ValueError(f"{station}: the percentiles must cover all 366 days in order")
    for key, day in days.items():
        years = day.get("years") if isinstance(day, dict) else None
        if isinstance(years, bool) or not isinstance(years, int) or years < 0 \
                or set(day) != {"years", *BAND_KEYS}:
            raise ValueError(f"{station}: {key} is malformed")
        values = [day[k] for k in BAND_KEYS]
        if any(v is not None and (isinstance(v, bool) or not isinstance(v, (int, float))
                                  or not math.isfinite(v) or v < 0) for v in values):
            raise ValueError(f"{station}: {key} has an impossible percentile")
        present = [v for v in values if v is not None]
        if present != sorted(present):
            raise ValueError(f"{station}: {key} percentiles are out of order")
    if statistics.median(day["years"] for day in days.values()) < RIVER_NORMAL_MIN_YEARS:
        raise ValueError(
            f"{station}: most days have fewer than {RIVER_NORMAL_MIN_YEARS} years of approved "
            "values, so this gauge has no normal to compare with (ADR-144)")


def load_river_normals(roster: dict[str, dict],
                       path: Path = RIVER_NORMALS_PATH) -> dict[str, dict]:
    """The committed percentiles for every natural gauge on the roster.

    Refuses the file when a natural gauge has no entry, when an entry names
    another series, misses a day, or holds percentiles out of order, and
    when most of a gauge's days have under 30 years: a natural record is
    never published against a normal nobody reviewed.
    """
    natural = {s: e for s, e in roster.items() if e["tier"]["tier"] == "natural"}
    if not natural:
        return {}
    document = json.loads(path.read_text(encoding="utf-8"))
    if tuple(document.get("percentiles") or ()) != RIVER_NORMAL_PERCENTILES \
            or document.get("min_years") != RIVER_NORMAL_MIN_YEARS:
        raise ValueError(f"{path.name} was built for other percentiles or another minimum")
    gauges = document.get("gauges")
    if not isinstance(gauges, dict):
        raise ValueError(f"{path.name} must contain a gauges object")
    missing = sorted(set(natural) - set(gauges))
    if missing:
        raise ValueError(f"{path.name} has no percentiles for natural gauge(s) {missing}")
    for station, entry in natural.items():
        _check_normals_entry(station, gauges[station], entry["series"]["time_series_id"])
    return {station: gauges[station] for station in natural}


def normal_fields(normals: dict, as_of: dt.date, cfs: float) -> dict:
    """A natural record's comparison for its newest day, or why there is none."""
    key = as_of.strftime("%m-%d")
    day = normals["days"][key]
    reason = withheld_reason(day)
    if reason:
        return {"compared_with_normal": False, "normal_band": None, "flow_class": None,
                "normal_withheld": reason}
    band = {"day": key, **{k: day[k] for k in BAND_KEYS}, "years": day["years"],
            "retrieved": normals["retrieved"], "source_url": normals["source_url"]}
    return {"compared_with_normal": True, "normal_band": band,
            "flow_class": flow_class(cfs, band), "normal_withheld": None}


def _window(rows: list[dict], end: dt.date) -> list[dict]:
    by_date = {row["date"]: row for row in rows}
    days = [end - dt.timedelta(days=offset) for offset in range(RIVER_WINDOW_DAYS - 1, -1, -1)]
    return [
        dict(by_date[day.isoformat()]) if day.isoformat() in by_date
        else {"date": day.isoformat(), "cfs": None, "approval": None, "qualifiers": []}
        for day in days
    ]


def summarize_gauge(entry: dict, rows: list[dict], today: pd.Timestamp,
                    normals: dict | None = None) -> dict:
    """One gauge's record from its fetched daily rows.

    The window ends on the newest day that carries a value, so a gauge a few
    days behind still shows 30 days of its own readings, and its lateness is
    said by `days_stale` rather than by a run of empty days. A natural gauge
    needs its committed percentiles; a shaped gauge never takes any.
    """
    natural = entry["tier"]["tier"] == "natural"
    if natural and normals is None:
        raise ValueError(f"{entry['display_name']}: a natural gauge needs its percentiles")
    if not natural and normals is not None:
        raise ValueError(f"{entry['display_name']}: a shaped gauge is never compared with normal")
    reported = [row for row in rows if row["cfs"] is not None]
    if not reported:
        raise NoReportedFlow(f"{entry['display_name']}: no reported flow in the window")
    newest = reported[-1]
    as_of = dt.date.fromisoformat(newest["date"])
    daily = _window(rows, as_of)
    week_ago = daily[-8]
    values = [(row["cfs"], row["date"]) for row in daily if row["cfs"] is not None]
    # A tie names its most recent day, which is the one a reader asks about.
    high = max(values, key=lambda pair: (pair[0], pair[1]))
    low = max(values, key=lambda pair: (-pair[0], pair[1]))
    days_stale = int((today - pd.Timestamp(as_of)).days)
    series = entry["series"]
    toward = entry.get("flows_toward")
    comparison = (normal_fields(normals, as_of, newest["cfs"]) if natural
                  else {"compared_with_normal": False})
    return {
        "name": entry["display_name"],
        "usgs_name": entry["usgs_name"],
        "measurement": MEASUREMENT,
        "source_key": SOURCE_KEY,
        "source_label": SOURCE_LABEL,
        "source_station_id": entry["station"],
        "source_url": usgs_flow_daily_url(series["time_series_id"]),
        "usgs_page": entry["usgs_page"],
        "time_series_id": series["time_series_id"],
        "parameter_code": series["parameter_code"],
        "statistic_id": series["statistic_id"],
        "unit": series["unit"],
        "state": entry["state"],
        "lat": entry["lat"],
        "lon": entry["lon"],
        "drainage_area_sq_mi": entry.get("drainage_area_sq_mi"),
        "huc8": entry["huc8"],
        "huc8_name": entry["huc8_name"],
        "flows_toward": toward["name"] if toward else None,
        "tier": entry["tier"]["tier"],
        **comparison,
        "data_frequency": "daily",
        "stale_after_days": STALE_AFTER_DAYS,
        "as_of": as_of.isoformat(),
        "days_stale": days_stale,
        "is_stale": days_stale > STALE_AFTER_DAYS,
        "fetch_ok": True,
        "current_cfs": newest["cfs"],
        "current_approval": newest["approval"],
        "current_qualifiers": list(newest["qualifiers"]),
        "change_7d_cfs": (None if week_ago["cfs"] is None
                          else round(newest["cfs"] - week_ago["cfs"], 2)),
        "change_7d_reference_date": week_ago["date"] if week_ago["cfs"] is not None else None,
        "window_start": daily[0]["date"],
        "window_end": daily[-1]["date"],
        "window_high_cfs": high[0],
        "window_high_date": high[1],
        "window_low_cfs": low[0],
        "window_low_date": low[1],
        "reported_days": len(values),
        "provisional_days": sum(1 for row in daily
                                if row["cfs"] is not None and row["approval"] == "Provisional"),
        "daily": daily,
    }


def build_payload(records: list[dict], today: pd.Timestamp, fetched_at: str,
                  carried_notices: list[dict] | None = None) -> dict:
    """The envelope, with late and withdrawn told apart (ADR-056)."""
    published, withdrawn = partition_by_age(records)
    notices = [withdrawal_notice(r, with_station=True) for r in withdrawn]
    notices.extend(carried_notices or ())
    notices.sort(key=lambda n: (-(n.get("days_stale") or 0), n.get("name") or ""))
    published.sort(key=lambda r: r["name"])
    return {
        "schema_version": RIVER_SCHEMA_VERSION,
        "measurement": MEASUREMENT,
        "fetched_at": fetched_at,
        "run_date": today.date().isoformat(),
        "window_days": RIVER_WINDOW_DAYS,
        "stale_after_days": STALE_AFTER_DAYS,
        "withdraw_after_days": WITHDRAW_AFTER_DAYS,
        "gauge_count": len(published),
        "stale_count": sum(1 for r in published if r.get("is_stale")),
        "withdrawn_count": len(notices),
        "gauges": published,
        "withdrawn": notices,
    }


def _check_record(record: dict) -> None:
    name = record.get("name")
    if record.get("measurement") != MEASUREMENT:
        raise ValueError(f"{name}: a river record must say what it measures")
    spilled = REFUSED_FIELDS & set(record)
    if spilled:
        raise ValueError(f"{name}: refusing {sorted(spilled)}")
    tier = record.get("tier")
    if tier == "shaped":
        if record.get("compared_with_normal") is not False or NORMAL_FIELDS & set(record):
            raise ValueError(f"{name}: a shaped gauge is never compared with normal (ADR-136)")
    elif tier == "natural":
        _check_comparison(record)
    else:
        raise ValueError(f"{name}: unknown tier {tier!r}")
    daily = record.get("daily")
    if not isinstance(daily, list) or len(daily) != RIVER_WINDOW_DAYS:
        raise ValueError(f"{name}: the window must hold {RIVER_WINDOW_DAYS} days")
    dates = [dt.date.fromisoformat(row["date"]) for row in daily]
    if any((b - a).days != 1 for a, b in zip(dates, dates[1:])):
        raise ValueError(f"{name}: the window's days are not consecutive")
    if daily[-1]["date"] != record.get("as_of") or daily[-1]["cfs"] is None:
        raise ValueError(f"{name}: the window must end on the newest reported day")
    if daily[-1]["cfs"] != record.get("current_cfs"):
        raise ValueError(f"{name}: the current flow is not the window's last value")
    for row in daily:
        if set(row) != {"date", "cfs", "approval", "qualifiers"}:
            raise ValueError(f"{name}: {row.get('date')} has unexpected fields")
        if row["cfs"] is not None and row["cfs"] < 0:
            raise ValueError(f"{name}: {row['date']} has a negative flow")


def _check_comparison(record: dict) -> None:
    name = record.get("name")
    if not NORMAL_FIELDS <= set(record):
        raise ValueError(f"{name}: a natural record says whether it is compared with normal")
    band, compared = record["normal_band"], record.get("compared_with_normal")
    if compared is False:
        if band is not None or record["flow_class"] is not None \
                or record["normal_withheld"] not in WITHHELD_REASONS:
            raise ValueError(f"{name}: a natural record without a comparison says why, alone")
        return
    if compared is not True or record["normal_withheld"] is not None \
            or not isinstance(band, dict) or set(band) != BAND_FIELDS:
        raise ValueError(f"{name}: a compared natural record carries one band and no reason")
    values = [band[k] for k in BAND_KEYS]
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) for v in values) \
            or values != sorted(values) or band["years"] < RIVER_NORMAL_MIN_YEARS:
        raise ValueError(f"{name}: the band is out of order or rests on too few years")
    if band["day"] != str(record.get("as_of"))[5:]:
        raise ValueError(f"{name}: the band is for {band['day']}, not the reading's date")
    if record["flow_class"] != flow_class(record["current_cfs"], band):
        raise ValueError(f"{name}: the class does not follow from the flow and the band")


def validate_payload(payload: dict, roster: dict[str, dict]) -> None:
    """Refuse a payload that claims what a gauge cannot, or loses a gauge."""
    spilled = REFUSED_FIELDS & set(payload)
    if spilled:
        raise ValueError(f"the envelope never adds gauges together; refusing {sorted(spilled)}")
    for record in payload["gauges"]:
        _check_record(record)
    for notice in payload["withdrawn"]:
        extra = set(notice) - NOTICE_FIELDS
        if extra:
            raise ValueError(
                f"{notice.get('name')}: a withdrawal notice carries no measurement; "
                f"refusing {sorted(extra)}")
    stations = ([r["source_station_id"] for r in payload["gauges"]]
                + [n.get("source_station_id") for n in payload["withdrawn"]])
    if len(set(stations)) != len(stations):
        raise ValueError("a gauge is both published and withdrawn, or twice")
    if set(stations) != set(roster):
        raise ValueError(
            f"roster and payload disagree: missing {sorted(set(roster) - set(stations))}, "
            f"unexpected {sorted(set(stations) - set(roster), key=str)}")
    for record in payload["gauges"]:
        if record["tier"] != roster[record["source_station_id"]]["tier"]["tier"]:
            raise ValueError(f"{record['name']}: the record's tier is not the roster's")
