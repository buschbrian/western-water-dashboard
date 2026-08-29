"""Build compact, public fact indexes for the dashboard question service.

The Worker fetches one topic per question, so this builder keeps reservoir,
snow and drought facts separate.  It writes temporary files, validates their
shape and size, then replaces all three outputs.  A failure leaves the last
accepted indexes untouched.
"""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "data" / "assistant"
SCHEMA_VERSION = 1
MAX_BYTES = {
    "reservoirs.json": 2_000_000,
    "snow.json": 1_000_000,
    "drought.json": 600_000,
}


def read(path: str) -> dict:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def latest_value(site: dict) -> dict:
    days = site.get("series_days") or []
    values = site.get("series_values") or []
    normals = site.get("series_normals") or []
    for index in range(min(len(days), len(values)) - 1, -1, -1):
        if values[index] is not None:
            return {
                "date": days[index], "snow_water_equivalent_inches": values[index],
                "normal_inches": normals[index] if index < len(normals) else None,
            }
    return {"date": None, "snow_water_equivalent_inches": None,
            "normal_inches": None}


def latest_rollup(rollup: dict) -> dict:
    for item in reversed(rollup.get("series") or []):
        if item.get("mean_percent_of_normal_median") is not None:
            return item
    return {"date": None, "reporting_site_count": 0,
            "mean_percent_of_normal_median": None}


def reservoir_index() -> dict:
    payload = read("reservoirs.json")
    records = []
    for item in payload["reservoirs"]:
        records.append({key: item.get(key) for key in (
            "name", "source_key", "source_label", "source_url",
            "source_station_id", "rise_item_id", "operator", "data_frequency",
            "as_of", "days_stale", "is_stale", "lat", "lon",
            "current_storage_af", "capacity_af", "capacity_basis",
            "pct_of_capacity", "record_max_af", "pct_of_record_max",
            "baselines", "seasonal_percentile", "seasonal_rank",
            "seasonal_rank_of", "change_7d_af", "change_7d_pct",
            "change_30d_af", "change_30d_pct", "change_365d_af",
            "change_365d_pct", "monthly", "first_obs", "years_of_record",
            "huc6", "huc6_name", "county_fips", "county_name", "state",
            "waterbody_states"
        )})
    return {
        "schema_version": SCHEMA_VERSION,
        "topic": "reservoirs",
        "as_of": max((item["as_of"] for item in records), default=None),
        "generated_at": payload["generated_at"],
        "record_count": len(records),
        "records": records,
    }


def snow_index() -> dict:
    payload = read("snowpack.json")
    upstream = read("upstream_index.json")
    sites = [{
        "station": site["station"], "name": site["name"],
        "state": site.get("state"), "county": site.get("county"),
        "huc6": site.get("huc6"), "huc6_name": site.get("huc6_name"),
        "late": site.get("late"), **latest_value(site)
    } for site in payload["sites"]]
    rollups = [{
        "huc6": item["huc6"], "huc6_name": item["huc6_name"],
        "site_count": item["site_count"],
        "minimum_reporting_sites": item["minimum_reporting_sites"],
        **latest_rollup(item)
    } for item in payload["rollups"]]
    joins = [{
        "reservoir_station_id": station,
        "reservoir_name": trace.get("name"),
        "upstream_snow_sites": trace.get("upstream_snow_sites", []),
        "screen": trace.get("screen")
    } for station, trace in upstream["traces"].items()]
    return {
        "schema_version": SCHEMA_VERSION,
        "topic": "snow",
        "as_of": payload["as_of"],
        "generated_at": payload["generated_at"],
        "site_count": len(sites), "rollup_count": len(rollups),
        "sites": sites, "rollups": rollups, "upstream": joins,
        "source": payload["source"], "normal_period": payload["normal_period"],
    }


def drought_index() -> dict:
    levels = {}
    histories = {}
    for level in (2, 4, 6, 8):
        current = read(f"data/drought/usdm-huc{level}.json")
        levels[str(level)] = {
            "map_date": current["map_date"],
            "release_date": current["release_date"],
            "units": current["units"],
        }
        if level != 8:
            history = read(f"data/drought/usdm-huc{level}-history.json")
            histories[str(level)] = history["weeks"]
    return {
        "schema_version": SCHEMA_VERSION,
        "topic": "drought",
        "as_of": levels["6"]["release_date"],
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "levels": levels, "histories": histories,
    }


def encoded(payload: dict) -> bytes:
    return (json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            + "\n").encode("utf-8")


def main() -> int:
    documents = {
        "reservoirs.json": reservoir_index(),
        "snow.json": snow_index(),
        "drought.json": drought_index(),
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    temporary = []
    for name, payload in documents.items():
        if payload["schema_version"] != SCHEMA_VERSION or not payload.get("as_of"):
            raise ValueError(f"{name} has no usable schema version or as-of date")
        body = encoded(payload)
        if len(body) > MAX_BYTES[name]:
            raise ValueError(f"{name} is {len(body):,} bytes; budget is {MAX_BYTES[name]:,}")
        path = OUTPUT_DIR / f".{name}.tmp"
        path.write_bytes(body)
        temporary.append((path, OUTPUT_DIR / name, len(body)))
    for source, target, _size in temporary:
        source.replace(target)
    for _source, target, size in temporary:
        print(f"wrote {target.relative_to(ROOT)} ({size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
