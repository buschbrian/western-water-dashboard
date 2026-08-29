#!/usr/bin/env python3
"""Compare the legacy and OGC USGS storage series without writing files.

The modern series is selected by the statistic identifier committed beside
each admitted station. A migration passes only when every overlapping day has
the same value and neither service omits a day the other returned.
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


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=365)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
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
