"""Daily mean river flow at reviewed gauges (ADR-136).

A gauge measures a rate, not a volume held: there is no full level, no
percent full and, for a shaped gauge, no normal to compare with. What a record
publishes is the survey's own daily means for the last 30 reported days,
each with its approval status and qualifiers, the newest of them, and the
change from seven days earlier.

Two rules from ADR-124 are mechanical here. No field adds gauges together,
and nothing names a gauge as a reservoir's inflow; `validate_payload` refuses
a payload that tries either.
"""

import datetime as dt

import pandas as pd

from .constants import (
    RIVER_SCHEMA_VERSION, RIVER_WINDOW_DAYS, STALE_AFTER_DAYS, WITHDRAW_AFTER_DAYS,
)
from .freshness import partition_by_age, withdrawal_notice
from .providers import usgs_flow_daily_url

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


class NoReportedFlow(ValueError):
    """The survey answered, and no day in the window carries a value."""


def _window(rows: list[dict], end: dt.date) -> list[dict]:
    by_date = {row["date"]: row for row in rows}
    days = [end - dt.timedelta(days=offset) for offset in range(RIVER_WINDOW_DAYS - 1, -1, -1)]
    return [
        dict(by_date[day.isoformat()]) if day.isoformat() in by_date
        else {"date": day.isoformat(), "cfs": None, "approval": None, "qualifiers": []}
        for day in days
    ]


def summarize_gauge(entry: dict, rows: list[dict], today: pd.Timestamp) -> dict:
    """One gauge's record from its fetched daily rows.

    The window ends on the newest day that carries a value, so a gauge a few
    days behind still shows 30 days of its own readings, and its lateness is
    said by `days_stale` rather than by a run of empty days.
    """
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
        "compared_with_normal": False,
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
    if record.get("compared_with_normal") is not False:
        raise ValueError(f"{name}: no gauge is compared with normal yet (ADR-136)")
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
