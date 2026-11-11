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
elevation with its authority, decision, source and date -- and never as
capacity. It is copied from the roster as written and nothing here computes a
share of it.

A lake may publish its elevation alone, with `volume: null`, where no volume
relation is reviewed, and a lake whose arms are measured apart publishes a
named list of arms and no combined level (ADR-159).
"""

import pandas as pd

import huc

from .constants import (
    LAKE_SCHEMA_VERSION, METHOD_VERSION, STALE_AFTER_DAYS, TARGET_SHARE_WORDS,
    WITHDRAW_AFTER_DAYS,
)
from .freshness import partition_by_age, withdrawal_notice
from .history import monthly_history
from .measurement import summarize_measurement
from .numbers import _round
from .providers import USGS_DV_URL

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

def _gauge_blocks(name: str, spec: dict, elevation: pd.DataFrame,
                  volume: pd.DataFrame | None) -> tuple[dict, dict | None, pd.Timestamp,
                                                        pd.Timestamp]:
    """One gauge's elevation block, its volume block or None, and its dates.

    `spec` is the roster entry for the gauge: the lake itself, or one arm.
    A gauge with a reviewed volume needs both series; a gauge with none
    publishes its elevation and a null volume (ADR-159). The returned
    `as_of` is the earlier of the two series' last dates: both are read at
    the same gauge, so they normally agree, and when they do not the gauge
    is as current as its older measurement.
    """
    levels = elevation.set_index("date")["elevation_ft"].sort_index()
    has_volume = spec.get("volume") is not None
    volumes = (volume.set_index("date")["volume_af"].sort_index()
               if has_volume and volume is not None else pd.Series(dtype="float64"))
    if levels.empty or (has_volume and volumes.empty):
        raise ValueError(f"{name}: both series are required" if has_volume
                         else f"{name}: the elevation series is required")
    last_level = levels.index[-1]
    elevation_block = {
        "unit": "ft",
        "vertical_datum": spec["elevation"]["vertical_datum"],
        "parameter_code": spec["elevation"]["parameter_code"],
        "statistic_id": spec["elevation"]["statistic_id"],
        **summarize_measurement(levels, last_level, places=2, with_pct=False),
    }
    if not has_volume:
        return elevation_block, None, last_level, levels.index[0]
    last_volume = volumes.index[-1]
    volume_block = {
        "unit": "acre_feet",
        "parameter_code": spec["volume"]["parameter_code"],
        "statistic_id": spec["volume"]["statistic_id"],
        # The relation the survey computes volume with, named so a reader
        # can tell a change in the water from a change in the table.
        "relation": {
            "name": spec["volume"]["relation"]["name"],
            "source_url": spec["volume"]["relation"]["source_url"],
            "in_use_from": spec["volume"]["relation"].get("in_use_from"),
        },
        **summarize_measurement(volumes, last_volume, places=0, with_pct=True),
        "monthly": monthly_history(volumes),
    }
    return (elevation_block, volume_block, min(last_level, last_volume),
            min(levels.index[0], volumes.index[0]))


def _lake_envelope(entry: dict, as_of: pd.Timestamp, today: pd.Timestamp) -> dict:
    days_stale = int((today - as_of).days)
    return {
        "name": entry["name"],
        "water_type": WATER_TYPE,
        "source_key": SOURCE_KEY,
        "source_label": SOURCE_LABEL,
        "source_url": USGS_DV_URL,
        "source_station_id": entry.get("station"),
        "state": entry.get("state"),
        "lat": entry.get("lat"),
        "lon": entry.get("lon"),
        "data_frequency": "daily",
        "stale_after_days": STALE_AFTER_DAYS,

        # --- freshness ---
        "as_of": as_of.date().isoformat(),
        "days_stale": days_stale,
        "is_stale": days_stale > STALE_AFTER_DAYS,
        "fetch_ok": True,
    }


def _targets(entry: dict) -> list[dict]:
    # A named target, never a capacity: copied as reviewed, with no share of
    # it computed here (ADR-112, ADR-159).
    return [dict(target) for target in entry.get("targets") or []]


def summarize_lake(entry: dict, elevation: pd.DataFrame, volume: pd.DataFrame | None,
                   today: pd.Timestamp) -> dict:
    """Turn a lake's daily series into the record the payload publishes.

    `elevation` is [date, elevation_ft] and `volume` is [date, volume_af], as
    `fetch_usgs_parameter_series` returns them. `volume` is None for a lake
    whose roster entry has no reviewed volume; its record carries
    `volume: null` and says nothing it has not measured (ADR-159).
    """
    elevation_block, volume_block, as_of, first_obs = _gauge_blocks(
        entry["name"], entry, elevation, volume)
    return {
        **_lake_envelope(entry, as_of, today),
        # --- the measurements, each with its own provenance ---
        "elevation": elevation_block,
        "volume": volume_block,
        "arms": [],
        "targets": _targets(entry),

        # --- provenance ---
        "first_obs": first_obs.date().isoformat(),
        "years_of_record": _round((as_of - first_obs).days / 365.25, 1),
    }


def summarize_armed_lake(entry: dict, series: dict[str, tuple[pd.DataFrame,
                                                              pd.DataFrame | None]],
                         today: pd.Timestamp) -> dict:
    """A lake measured by arm: a named list of arms, and no combined level.

    `series` maps each arm's site to its (elevation, volume) frames. The
    arms stand at different levels behind the causeway, so the lake record
    carries no level, volume or point of its own (ADR-159). The lake is as
    current as its oldest arm: a reader comparing the arms is comparing
    readings no older than the record's `as_of`, and one quiet arm makes the
    whole lake late rather than half of it silently old.
    """
    arms, dates, firsts = [], [], []
    for arm in entry["arms"]:
        elevation, volume = series[arm["station"]]
        elevation_block, volume_block, as_of, first_obs = _gauge_blocks(
            f"{entry['name']}, {arm['name']}", arm, elevation, volume)
        dates.append(as_of)
        firsts.append(first_obs)
        arms.append({
            "name": arm["name"],
            "source_station_id": arm["station"],
            "lat": arm["lat"],
            "lon": arm["lon"],
            "elevation": elevation_block,
            "volume": volume_block,
            "first_obs": first_obs.date().isoformat(),
        })
    as_of, first_obs = min(dates), min(firsts)
    return {
        **_lake_envelope(entry, as_of, today),
        "elevation": None,
        "volume": None,
        "arms": arms,
        "targets": _targets(entry),
        "first_obs": first_obs.date().isoformat(),
        "years_of_record": _round((as_of - first_obs).days / 365.25, 1),
    }


#: The drainage fields a lake measured by arm takes from its arms when every
#: arm agrees, and omits when they do not.
_SHARED_WATERSHED_FIELDS = ("in_utah", "intersects_utah", "huc6", "huc6_name", "huc8",
                            "huc8_name", "connected_states", "huc_assignment_source")


def attach_watersheds(records: list[dict]) -> None:
    """Drainage membership from the published lake point, and only that.

    The reservoir path assigns from the dam where it has one, because a dam
    is where stored water leaves. A terminal lake's water leaves nowhere, so
    the lake point is the assignment point and the record says so; no outlet
    is invented for it (ADR-112). A lake measured by arm is assigned at each
    arm's point, and the lake takes the drainage fields only where every arm
    agrees (ADR-159). Both levels come from the committed geometry, and a
    missing boundary file costs the fields, not the day.
    """
    try:
        units = huc.load_units()
        fine_units = huc.load_units_at(8)
    except (OSError, ValueError, KeyError) as exc:
        print(f"WARNING: no watershed boundaries ({type(exc).__name__}: {exc}); "
              "publishing lakes without HUC fields")
        return

    def assign(target: dict) -> None:
        lat, lon = target.get("lat"), target.get("lon")
        if lat is None or lon is None:
            return
        target.update(huc.describe(
            lat, lon, units, station=str(target.get("source_station_id")),
            source="published_point", fine_units=fine_units))

    for record in records:
        arms = record.get("arms") or []
        if not arms:
            assign(record)
            continue
        for arm in arms:
            assign(arm)
        for field in _SHARED_WATERSHED_FIELDS:
            values = [arm.get(field) for arm in arms]
            if all(value == values[0] for value in values) and values[0] is not None:
                record[field] = values[0]


def build_payload(records: list[dict], today: pd.Timestamp, fetched_at: str,
                  carried_notices: list[dict] | None = None) -> dict:
    """The envelope, with the late and the withdrawn told apart (ADR-056).

    `carried_notices` are yesterday's notices for lakes that fetched nothing
    today; `withdrawal_notice` passes one through with its fields unchanged.
    """
    published, withdrawn = partition_by_age(records)
    withdrawn.extend(carried_notices or ())
    withdrawn.sort(key=lambda r: -(r.get("days_stale") or 0))
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


def _check_gauge(where: str, gauge: dict) -> None:
    """An elevation block is required; a volume block is a block or null."""
    if not isinstance(gauge.get("elevation"), dict) or "current" not in gauge["elevation"]:
        raise ValueError(f"{where}: the elevation block is required")
    volume = gauge.get("volume", "missing")
    if volume is not None and (not isinstance(volume, dict) or "current" not in volume):
        raise ValueError(f"{where}: the volume block is a measurement or null")
    for block in (gauge["elevation"], volume or {}):
        shares = [key for key in block if "target" in key]
        if shares:
            raise ValueError(f"{where}: a target is never a denominator; refusing {shares}")


def validate_payload(payload: dict, roster: dict[str, dict]) -> None:
    """Refuse a payload that claims what a terminal lake cannot have.

    Each check is a sentence of ADR-112 or ADR-159 made mechanical: no lake
    record carries a reservoir-only field; a lake has its own elevation or a
    list of arms that each have one, never both; a volume is a measurement or
    null; a target is never a capacity or a denominator; no withdrawal notice
    carries a measurement; and every lake on the roster is either published
    or withdrawn, so a silently failed fetch cannot look like a decision.
    """
    for record in payload["lakes"]:
        name = record.get("name")
        if record.get("water_type") != WATER_TYPE:
            raise ValueError(f"{name}: a lake record must say what it is")
        spilled = RESERVOIR_ONLY_FIELDS & set(record)
        if spilled:
            raise ValueError(
                f"{name}: a terminal lake has no full level; refusing {sorted(spilled)}")
        shares = [key for key in record if "target" in key and key != "targets"]
        if shares:
            raise ValueError(f"{name}: a target is never a denominator; refusing {shares}")
        arms = record.get("arms")
        if not isinstance(arms, list):
            raise ValueError(f"{name}: arms must be a list, empty when there are none")
        if arms:
            if record.get("elevation") is not None or record.get("volume") is not None:
                raise ValueError(
                    f"{name}: a lake measured by arm publishes no combined level or volume")
            for arm in arms:
                _check_gauge(f"{name}, {arm.get('name')}", arm)
        else:
            _check_gauge(name, record)
        arm_names = {arm.get("name") for arm in arms}
        for target in record.get("targets") or []:
            if any(word in key.lower() for key in target for word in TARGET_SHARE_WORDS):
                raise ValueError(f"{name}: a target is never a capacity or a denominator")
            if arms and target.get("arm") not in arm_names:
                raise ValueError(f"{name}: a target on a lake measured by arm names its arm")
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
