#!/usr/bin/env python3
"""Compare the legacy and OGC USGS storage series without writing files.

The modern series is selected by the statistic identifier committed beside
each admitted station. A migration passes only when every overlapping day has
the same value and neither service omits a day the other returned.

Two modes, because they need different things:

`--full-series` (the default) asks both services and compares every day. It
is the comparison ADR-098 requires and it needs `USGS_API_KEY`, because the
modern half of it does.

`--against-published` asks only the retired service, and compares its answers
with the figures already published in `reservoirs.json` -- which the modern
service produced. It needs no key, so it is the half that can be run by
anyone, on any morning, without a secret. It is a sample rather than a
series: each station's own reading date, plus the three dates its 7, 30 and
365-day changes are measured from. That is enough to catch a wrong site, a
wrong statistic or a wrong unit on real published values, and not enough to
stand in for the full run.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pipeline.providers import USGS_LEGACY_DV_URL, fetch_usgs_series  # noqa: E402
from pipeline.roster import ADMITTED_USGS_RESERVOIRS  # noqa: E402


def legacy_series(site_no: str, statistic_id: str,
                  start: str, end: str) -> pd.DataFrame:
    response = requests.get(USGS_LEGACY_DV_URL, params={
        "sites": site_no, "parameterCd": "00054", "statCd": statistic_id,
        "startDT": dt.datetime.strptime(start, "%Y%m%d").date().isoformat(),
        "endDT": dt.datetime.strptime(end, "%Y%m%d").date().isoformat(),
        "format": "json",
    }, timeout=120, headers={"User-Agent": "western-water-dashboard/usgs-parity"})
    response.raise_for_status()
    rows = []
    for series in response.json().get("value", {}).get("timeSeries", []):
        for block in series.get("values", []):
            for reading in block.get("value", []):
                try:
                    value = float(reading.get("value"))
                except (TypeError, ValueError):
                    continue
                if value >= 0:
                    rows.append({"date": reading.get("dateTime"), "legacy": value})
    if not rows:
        return pd.DataFrame(columns=["date", "legacy"])
    frame = pd.DataFrame(rows)
    frame["date"] = pd.to_datetime(frame["date"], errors="coerce").dt.normalize()
    return frame.dropna().sort_values("date").drop_duplicates("date", keep="last")


def compare(legacy: pd.DataFrame, modern: pd.DataFrame) -> dict:
    modern = modern.rename(columns={"storage_af": "modern"})
    joined = legacy.merge(modern, on="date", how="outer", indicator=True)
    differences = joined[(joined["_merge"] != "both") |
                         (joined["legacy"] != joined["modern"])]
    return {
        "legacy_days": len(legacy), "modern_days": len(modern),
        "different_days": len(differences),
        "examples": [{
            "date": row.date.strftime("%Y-%m-%d"),
            "legacy": None if pd.isna(row.legacy) else row.legacy,
            "modern": None if pd.isna(row.modern) else row.modern,
        } for row in differences.head(10).itertuples()],
    }


def published_records() -> dict[str, dict]:
    """The published U.S. Geological Survey records, keyed by station."""
    payload = json.loads((ROOT / "reservoirs.json").read_text(encoding="utf-8"))
    return {record["source_station_id"]: record
            for record in payload["reservoirs"] if record["source_key"] == "usgs"}


def published_points(record: dict) -> list[tuple[str, float]]:
    """The days this record states a storage figure for, and that figure.

    The reading date carries its own value. Each change carries the date it
    was measured from and the difference since, so the storage on that day is
    the difference undone -- four dates spread across a year from one record,
    with no second request to the service that produced it.
    """
    points = [(record["as_of"], record["current_storage_af"])]
    for span in ("7d", "30d", "365d"):
        reference = record.get(f"change_{span}_reference_date")
        delta = record.get(f"change_{span}_af")
        if reference and delta is not None:
            points.append((reference, record["current_storage_af"] - delta))
    return [(day, value) for day, value in points if day and value is not None]


def compare_against_published() -> list[dict]:
    """Ask the retired service for each published day, and compare."""
    published = published_records()
    results = []
    for site_no, row in ADMITTED_USGS_RESERVOIRS.items():
        record = published.get(site_no)
        if record is None:
            results.append({"site": site_no, "name": row["name"],
                            "checked": 0, "different_days": 0,
                            "note": "not published"})
            continue
        differences = []
        points = published_points(record)
        for day, expected in points:
            stamp = day.replace("-", "")
            legacy = legacy_series(site_no, row["statistic_id"], stamp, stamp)
            actual = float(legacy["legacy"].iloc[-1]) if len(legacy) else None
            if actual is None or abs(actual - expected) >= 1.0:
                differences.append({"date": day, "published": expected,
                                    "legacy": actual})
        results.append({"site": site_no, "name": row["name"],
                        "statistic_id": row["statistic_id"],
                        "checked": len(points),
                        "different_days": len(differences),
                        "examples": differences[:10]})
    return results


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=365)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--against-published", action="store_true",
                        help="compare the retired service with the figures already "
                             "published, which needs no API key")
    args = parser.parse_args()
    if args.against_published:
        results = compare_against_published()
        if args.json:
            print(json.dumps(results, indent=2))
        else:
            for result in results:
                print(f"{result['site']} {result['name']}: "
                      f"{result['different_days']} of {result['checked']} "
                      "published days differ")
            checked = sum(result["checked"] for result in results)
            differ = sum(result["different_days"] for result in results)
            print(f"\n{checked - differ} of {checked} agree with the retired service")
        return 1 if any(result["different_days"] for result in results) else 0
    end_day = dt.date.today()
    start_day = end_day - dt.timedelta(days=args.days)
    start, end = start_day.strftime("%Y%m%d"), end_day.strftime("%Y%m%d")
    results = []
    for site_no, row in ADMITTED_USGS_RESERVOIRS.items():
        legacy = legacy_series(site_no, row["statistic_id"], start, end)
        modern = fetch_usgs_series(site_no, row["statistic_id"], start, end)
        results.append({"site": site_no, "name": row["name"],
                        "statistic_id": row["statistic_id"],
                        **compare(legacy, modern)})
    if args.json:
        print(json.dumps(results, indent=2))
    else:
        for result in results:
            print(f"{result['site']} {result['name']}: "
                  f"{result['different_days']} different days")
    return 1 if any(result["different_days"] for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
