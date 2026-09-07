"""Natural terminal lakes: a water measured without a full level (ADR-112).

A terminal lake is not a reservoir with a missing capacity. Water leaves its
closed basin by evaporation, nothing holds it behind a dam, and there is no
engineered full pool to divide by -- so the record built here publishes what
the survey measures (a surface elevation above a named datum and a volume on
a named elevation-volume relation), how each has changed, and where each sits
among prior years on the same date. It publishes no capacity, no percent full
and no dam point, and `validate_payload` refuses a record that carries one.

The seasonal rank is the reservoir estimator applied unchanged: one vote per
prior year in the same window, counted from the lowest (`pipeline.seasonal`).
The method is the same and so is `METHOD_VERSION`; a lake does not get a
second definition of "normal for this date".

A restoration or regulatory level is admitted only as a *target* -- a named
elevation with its authority, source and date -- and never as capacity. It is
copied from the roster as written and nothing here computes a share of it.
"""

import pandas as pd

import huc

from .constants import (
    LAKE_SCHEMA_VERSION, METHOD_VERSION, STALE_AFTER_DAYS, WITHDRAW_AFTER_DAYS,
)
from .freshness import partition_by_age, withdrawal_notice
from .history import monthly_history, value_asof
from .numbers import _pct, _round
from .providers import USGS_DV_URL
from .seasonal import seasonal_rank

WATER_TYPE = "natural_terminal_lake"
SOURCE_KEY = "usgs"
SOURCE_LABEL = "U.S. Geological Survey"

#: Reservoir fields a lake record must never carry. Each one is a claim about
#: a full level, and a terminal lake has none (ADR-112).
RESERVOIR_ONLY_FIELDS = frozenset({
    "capacity_af", "capacity_basis", "pct_of_capacity", "physical_capacity_af",
    "capacity_history", "current_storage_af", "pct_of_seasonal_normal",
    "seasonal_normal_af", "baselines", "dam_lat", "dam_lon", "nid_id",
    "pct_of_record_max", "pct_of_peak_this_year",
})

#: The fields a withdrawal notice may carry, and no others (ADR-056): a notice
#: that carried a level or a volume would be publishing the figure it exists
#: to withhold.
NOTICE_FIELDS = frozenset({"name", "as_of", "days_stale", "source_label", "reason"})

CHANGE_WINDOWS = (("7d", 7), ("30d", 30), ("365d", 365))


def _measurement(series: pd.Series, last_date: pd.Timestamp, *, places: int,
                 with_pct: bool, change_tolerance_days: int = 10) -> dict:
    """Current value, record extremes, dated changes and the same-date rank.

    `places` is how the figure is rounded: a level is read to hundredths of a
    foot and a volume to whole acre-feet. `with_pct` is False for elevation --
    a percentage change in a level above an arbitrary datum has no hydrologic
    meaning, which is why ADR-112 refused percent-of-datum outright.
    """
    current = float(series.iloc[-1])
    out = {
        "current": _round(current, places),
        "as_of": last_date.date().isoformat(),
        "record_high": _round(float(series.max()), places),
        "record_high_date": series.idxmax().date().isoformat(),
        "record_low": _round(float(series.min()), places),
        "record_low_date": series.idxmin().date().isoformat(),
        "first_obs": series.index[0].date().isoformat(),
        "n_obs": int(series.size),
    }
    for label, days in CHANGE_WINDOWS:
        found = value_asof(series, last_date - pd.Timedelta(days=days),
                           tolerance_days=change_tolerance_days)
        past, past_date = found if found else (None, None)
        out[f"change_{label}"] = _round(None if past is None else current - past, places)
        if with_pct:
            out[f"change_{label}_pct"] = (
                None if not past else _round((current - past) / past * 100, 1))
        # What the change is a change from: the tolerance means "365-day
        # change" has covered 355 to 375 days, and the record says which.
        out[f"change_{label}_reference_date"] = (
            None if past_date is None else past_date.date().isoformat())
        out[f"change_{label}_elapsed_days"] = (
            None if past_date is None else int((last_date - past_date).days))
    rank = seasonal_rank(series, last_date, current)
    out["seasonal_rank"] = rank[0] if rank else None
    out["seasonal_rank_of"] = rank[1] if rank else None
    return out


def summarize_lake(entry: dict, elevation: pd.DataFrame, volume: pd.DataFrame,
                   today: pd.Timestamp) -> dict:
    """Turn a lake's two daily series into the record the payload publishes.

    `elevation` is [date, elevation_ft] and `volume` is [date, volume_af], as
    `fetch_usgs_parameter_series` returns them. The record's own `as_of` is
    the earlier of the two series' last dates: both are read at the same
    gauge and computed on the same relation, so they normally agree, and when
    they do not the lake is as current as its older measurement.
    """
    levels = elevation.set_index("date")["elevation_ft"].sort_index()
    volumes = volume.set_index("date")["volume_af"].sort_index()
    if levels.empty or volumes.empty:
        raise ValueError(f"{entry['name']}: both series are required")
    last_level, last_volume = levels.index[-1], volumes.index[-1]
    as_of = min(last_level, last_volume)
    days_stale = int((today - as_of).days)
    first_obs = min(levels.index[0], volumes.index[0])

    return {
        "name": entry["name"],
        "water_type": WATER_TYPE,
        "source_key": SOURCE_KEY,
        "source_label": SOURCE_LABEL,
        "source_url": USGS_DV_URL,
        "source_station_id": entry["station"],
        "state": entry.get("state"),
        "lat": entry["lat"],
        "lon": entry["lon"],
        "data_frequency": "daily",
        "stale_after_days": STALE_AFTER_DAYS,

        # --- freshness ---
        "as_of": as_of.date().isoformat(),
        "days_stale": days_stale,
        "is_stale": days_stale > STALE_AFTER_DAYS,
        "fetch_ok": True,

        # --- the two measurements, each with its own provenance ---
        "elevation": {
            "unit": "ft",
            "vertical_datum": entry["elevation"]["vertical_datum"],
            "parameter_code": entry["elevation"]["parameter_code"],
            "statistic_id": entry["elevation"]["statistic_id"],
            **_measurement(levels, last_level, places=2, with_pct=False),
        },
        "volume": {
            "unit": "acre_feet",
            "parameter_code": entry["volume"]["parameter_code"],
            "statistic_id": entry["volume"]["statistic_id"],
            # The relation the survey computes volume with, named so a reader
            # can tell a change in the water from a change in the table.
            "relation": {
                "name": entry["volume"]["relation"]["name"],
                "source_url": entry["volume"]["relation"]["source_url"],
                "in_use_from": entry["volume"]["relation"].get("in_use_from"),
            },
            **_measurement(volumes, last_volume, places=0, with_pct=True),
            "monthly": monthly_history(volumes),
        },

        # A named target, never a capacity: copied as reviewed, with no share
        # of it computed here (ADR-112).
        "targets": [dict(target) for target in entry.get("targets") or []],

        # --- provenance ---
        "first_obs": first_obs.date().isoformat(),
        "years_of_record": _round((as_of - first_obs).days / 365.25, 1),
    }


def attach_watersheds(records: list[dict]) -> None:
    """Drainage membership from the published lake point, and only that.

    The reservoir path assigns from the dam where it has one, because a dam
    is where stored water leaves. A terminal lake's water leaves nowhere, so
    the lake point is the assignment point and the record says so; no outlet
    is invented for it (ADR-112). Both levels come from the committed
    geometry, and a missing boundary file costs the fields, not the day.
    """
    try:
        units = huc.load_units()
        fine_units = huc.load_units_at(8)
    except (OSError, ValueError, KeyError) as exc:
        print(f"WARNING: no watershed boundaries ({type(exc).__name__}: {exc}); "
              "publishing lakes without HUC fields")
        return
    for record in records:
        lat, lon = record.get("lat"), record.get("lon")
        if lat is None or lon is None:
            continue
        record.update(huc.describe(
            lat, lon, units, station=str(record.get("source_station_id")),
            source="published_point", fine_units=fine_units))


def build_payload(records: list[dict], today: pd.Timestamp, fetched_at: str) -> dict:
    """The envelope, with the late and the withdrawn told apart (ADR-056)."""
    published, withdrawn = partition_by_age(records)
    published.sort(key=lambda r: r["name"])
    return {
        "schema_version": LAKE_SCHEMA_VERSION,
        "method_version": METHOD_VERSION,
        "water_type": WATER_TYPE,
        "fetched_at": fetched_at,
        "run_date": today.date().isoformat(),
        "stale_after_days": STALE_AFTER_DAYS,
        "withdraw_after_days": WITHDRAW_AFTER_DAYS,
        "lake_count": len(published),
        "stale_count": sum(1 for r in published if r.get("is_stale")),
        "withdrawn_count": len(withdrawn),
        "lakes": published,
        "withdrawn": [withdrawal_notice(r) for r in withdrawn],
    }


def validate_payload(payload: dict, roster: dict[str, dict]) -> None:
    """Refuse a payload that claims what a terminal lake cannot have.

    Three checks, each a sentence of ADR-112 made mechanical: no lake record
    carries a reservoir-only field; no withdrawal notice carries a
    measurement; and every lake on the roster is either published or
    withdrawn, so a silently failed fetch cannot look like a decision.
    """
    for record in payload["lakes"]:
        if record.get("water_type") != WATER_TYPE:
            raise ValueError(f"{record.get('name')}: a lake record must say what it is")
        spilled = RESERVOIR_ONLY_FIELDS & set(record)
        if spilled:
            raise ValueError(
                f"{record['name']}: a terminal lake has no full level; refusing "
                f"{sorted(spilled)}")
        for block in ("elevation", "volume"):
            if not isinstance(record.get(block), dict) or "current" not in record[block]:
                raise ValueError(f"{record['name']}: the {block} block is required")
        for target in record.get("targets") or []:
            if any(key in target for key in ("capacity_af", "volume_af", "pct")):
                raise ValueError(f"{record['name']}: a target is never a capacity")
    for notice in payload["withdrawn"]:
        extra = set(notice) - NOTICE_FIELDS
        if extra:
            raise ValueError(
                f"{notice.get('name')}: a withdrawal notice carries no measurement; "
                f"refusing {sorted(extra)}")
    names = ({r["name"] for r in payload["lakes"]}
             | {n["name"] for n in payload["withdrawn"]})
    expected = {row["name"] for row in roster.values()}
    if names != expected:
        raise ValueError(
            f"roster and payload disagree: missing {sorted(expected - names)}, "
            f"unexpected {sorted(names - expected)}")
