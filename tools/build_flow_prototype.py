"""Build a local three-gauge Provo daily-flow preview; no public admission.

Requires the durable private gauge-review bundle for its cached topographic
maps. Only the complete, validated 30-day snapshot is replaced. --demo makes
explicitly synthetic observations without contacting the agency.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import json
import math
import os
import shutil
import sys
import tempfile
import urllib.parse
from pathlib import Path
from typing import TypedDict

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_gauge_review as review  # noqa: E402

SITES = ("10155000", "10155200", "10163000")
ASSETS = Path(__file__).parent / "flow-pilot"
DAYS = 30
MAX_GZIP_BYTES = 100 * 1024
UNIT = "ft^3/s"


class Observation(TypedDict):
    date: str
    value: float | None
    source_value: str | None
    reported: bool
    approval_status: str | None
    qualifier: str | list[str] | None


def endpoint(collection: str, **filters) -> str:
    return (f"{review.USGS_BASE}/{collection}/items?"
            + urllib.parse.urlencode({"f": "json", "limit": 1000, **filters}))


def primary_series(features: list[dict], site: str) -> dict:
    matching = [f for f in features if all((f.get("properties") or {}).get(k) == v
                for k, v in {"monitoring_location_id": f"USGS-{site}",
                             "parameter_code": "00060", "statistic_id": "00003",
                             "primary": "Primary", "unit_of_measure": UNIT}.items())]
    if len(matching) != 1 or not isinstance(matching[0].get("id"), str):
        raise ValueError(f"{site}: expected one primary daily mean discharge series in {UNIT}")
    return matching[0]


def observations(features: list[dict], site: str, series_id: str,
                 start: dt.date, end: dt.date) -> list[Observation]:
    rows: dict[str, Observation] = {}
    for feature in features:
        p = feature.get("properties") or {}
        expected = {"monitoring_location_id": f"USGS-{site}",
                    "time_series_id": series_id, "parameter_code": "00060",
                    "statistic_id": "00003", "unit_of_measure": UNIT}
        if any(p.get(k) != v for k, v in expected.items()):
            raise ValueError(f"{site}: observation identity or unit mismatch")
        day = dt.date.fromisoformat(p["time"])
        if p["time"] != day.isoformat() or not start <= day <= end:
            raise ValueError(f"{site}: observation date outside the requested window")
        raw = p.get("value")
        value = None if raw is None else float(raw)
        if isinstance(raw, bool) or (value is not None and not math.isfinite(value)):
            raise ValueError(f"{site}: non-finite or invalid discharge")
        approval, qualifier = p.get("approval_status"), p.get("qualifier")
        if approval is not None and not isinstance(approval, str):
            raise ValueError(f"{site}: invalid approval status")
        if qualifier is not None and not isinstance(qualifier, str) and not (
                isinstance(qualifier, list) and all(isinstance(q, str) for q in qualifier)):
            raise ValueError(f"{site}: invalid qualifier")
        row: Observation = {"date": day.isoformat(), "value": value,
                            "source_value": None if raw is None else str(raw), "reported": True,
                            "approval_status": approval, "qualifier": qualifier}
        if row["date"] in rows and rows[row["date"]] != row:
            raise ValueError(f"{site}: conflicting observations on {day}")
        rows[row["date"]] = row
    return [rows.get((start + dt.timedelta(days=i)).isoformat(), {
                "date": (start + dt.timedelta(days=i)).isoformat(), "value": None,
                "source_value": None,
                "reported": False, "approval_status": None, "qualifier": None})
            for i in range((end - start).days + 1)]


def synthetic_features(site: str, series_id: str, start: dt.date) -> list[dict]:
    result = []
    for i in range(DAYS):
        if i == 12:
            continue
        result.append({"properties": {
            "monitoring_location_id": f"USGS-{site}", "time_series_id": series_id,
            "parameter_code": "00060", "statistic_id": "00003", "unit_of_measure": UNIT,
            "time": (start + dt.timedelta(days=i)).isoformat(),
            "value": None if i == 18 else round(70 + SITES.index(site) * 35 + i * 1.5
                                               + 160 * math.exp(-((i - 22) / 2) ** 2), 2),
            "approval_status": "Provisional", "qualifier": "ESTIMATED" if i == 22 else None}})
        result[-1]["properties"]["source_value"] = (
            None if result[-1]["properties"]["value"] is None
            else str(result[-1]["properties"]["value"]))
    return result


def build(bundle: Path, end: dt.date, *, demo: bool = False,
          fetch=review.usgs_features) -> dict:
    start = end - dt.timedelta(days=DAYS - 1)
    cache = json.loads((bundle / "gauges.json").read_text())
    by_site = {g["site"]: g for g in cache["gauges"]}
    gauges = []
    for site in SITES:
        g = by_site[site]
        metadata_url = endpoint("time-series-metadata", monitoring_location_id=f"USGS-{site}",
                                parameter_code="00060", statistic_id="00003")
        metadata = ({"id": f"synthetic-{site}", "properties": {}} if demo
                    else primary_series(fetch(metadata_url), site))
        series_id = metadata["id"]
        daily_url = endpoint("daily", time_series_id=series_id,
                             datetime=f"{start}/{end}")
        features = synthetic_features(site, series_id, start) if demo else fetch(daily_url)
        values = observations(features, site, series_id, start, end)
        if not demo and not any(row["reported"] for row in values):
            raise ValueError(f"{site}: no observations returned; previous preview retained")
        gauges.append({"site": site, "name": g["name"], "lat": g["lat"], "lon": g["lon"],
                       "area": g["area"], "traced": g["traced"],
                       "reservoirs": g["reservoirs"], "page": g["page"],
                       "map": g["map"], "shape": g.get("shape", []),
                       "series_id": series_id, "unit": UNIT,
                       "metadata_source": metadata_url, "series_source": daily_url,
                       "observations": values})
    snapshot = {"schema_version": 1, "data_kind": "synthetic" if demo else "observed",
                "fetched_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "start": start.isoformat(), "end": end.isoformat(),
                "review_screened": cache["screened"], "gauges": gauges}
    encoded = json.dumps(snapshot, allow_nan=False).encode()
    if len(gzip.compress(encoded)) > MAX_GZIP_BYTES:
        raise ValueError("snapshot exceeds the 100 KB gzip opening-data budget")
    return snapshot


def publish_local(snapshot: dict, bundle: Path, output: Path) -> None:
    output.mkdir(parents=True, exist_ok=True)
    (output / "maps").mkdir(exist_ok=True)
    for name in ("index.html", "view.mjs", "model.mjs", "styles.css"):
        shutil.copyfile(ASSETS / name, output / name)
    for site in SITES:
        shutil.copyfile(bundle / "maps" / f"{site}.jpg", output / "maps" / f"{site}.jpg")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output,
                                         delete=False, prefix=".snapshot-") as handle:
            temporary = Path(handle.name)
            json.dump(snapshot, handle, allow_nan=False, ensure_ascii=False)
            handle.write("\n")
        temporary.replace(output / "snapshot.json")
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--review-bundle", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--end", required=True, type=dt.date.fromisoformat,
                        help="last observation date (YYYY-MM-DD)")
    parser.add_argument("--demo", action="store_true", help="use clearly labelled synthetic data")
    args = parser.parse_args(argv)
    try:
        repo = ASSETS.parents[1].resolve()
        output = args.output.resolve()
        if output == repo or repo in output.parents:
            raise ValueError("choose a local preview directory outside the repository")
        snapshot = build(args.review_bundle, args.end, demo=args.demo)
        publish_local(snapshot, args.review_bundle, output)
    except (ValueError, KeyError, TypeError, OSError, RuntimeError) as error:
        print(f"Flow preview failed: {error}", file=sys.stderr)
        return 1
    size = len(gzip.compress(json.dumps(snapshot).encode()))
    print(f"Built {snapshot['data_kind']} local preview: 3 gauges, 30 days, {size} bytes gzip")
    print(f"Serve only {output}; snapshot is not a published roster or flow feed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
