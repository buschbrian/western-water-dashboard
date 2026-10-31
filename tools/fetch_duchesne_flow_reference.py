"""Store the Duchesne River near Randlett (09302000) yearly flow once.

On 2026-10-31 the USGS OGC v1 daily service held this gauge's daily mean
discharge only from 2026-07-15, while the legacy WaterServices daily values
held it from 1942. The legacy service shuts down on 2027-02-22. Brian ruled
that the history be stored once and the legacy reads removed (2026-10-31, K2).
This tool is that one read. It writes the mean discharge of every complete
water year to `data/reference/duchesne-09302000-water-year-flow.json`, which
`tools/build_gauge_review.py` reads for the years v1 lacks.

    .venv/bin/python tools/fetch_duchesne_flow_reference.py

It cannot be run again after the legacy service ends, and it does not need to
be: the committed file is the record. Keyless.

The file holds one mean a water year, not the daily series: the worksheet's
yearly mean flow is the only thing that reads it, and 84 means are
12 kB where 31,000 days would be about 400 kB. The count of approved ('A') and
provisional ('P') days in each year stays beside the mean, so the approval
status of each figure is not lost.
"""

from __future__ import annotations

import datetime as dt
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))

from build_gauge_review import (  # noqa: E402
    DAILY_MEAN_STATISTIC, DISCHARGE_PARAMETER, annual_means_from_daily)

SITE = "09302000"
SOURCE_URL = "https://waterservices.usgs.gov/nwis/dv/"
START = "1900-01-01"
#: The end of the last water year v1 cannot yet complete; v1 serves the rest.
END = "2026-09-30"
OUTPUT_PATH = ROOT / "data" / "reference" / "duchesne-09302000-water-year-flow.json"
USER_AGENT = "western-water-dashboard/duchesne-flow-reference"


def parse_legacy_daily(payload: dict) -> tuple[dict[dt.date, float], dict[dt.date, str]]:
    """Daily means and their approval codes ('A', 'P', or '' when unstated)."""
    days: dict[dt.date, float] = {}
    approval: dict[dt.date, str] = {}
    for series in (payload.get("value") or {}).get("timeSeries") or []:
        if not str(series.get("name", "")).endswith(
                f":{DISCHARGE_PARAMETER}:{DAILY_MEAN_STATISTIC}"):
            continue
        for block in series.get("values") or []:
            for row in block.get("value") or []:
                try:
                    value = float(row["value"])
                    day = dt.date.fromisoformat(row["dateTime"][:10])
                except (KeyError, TypeError, ValueError):
                    continue
                if value < 0:
                    continue
                days[day] = value
                codes = [c for c in row.get("qualifiers") or [] if c in ("A", "P")]
                approval[day] = codes[0] if codes else ""
    return days, approval


def build_reference(days: dict[dt.date, float], approval: dict[dt.date, str],
                    fetched_at: str, url: str) -> dict:
    means = annual_means_from_daily(days)
    years = {}
    for year in sorted(means):
        in_year = [d for d in days if d.year + (d.month >= 10) == year]
        years[str(year)] = {
            "mean_cfs": means[year],
            "days": len(in_year),
            "approved_days": sum(approval.get(d) == "A" for d in in_year),
            "provisional_days": sum(approval.get(d) == "P" for d in in_year),
        }
    return {
        "site": SITE,
        "site_name": "DUCHESNE RIVER NEAR RANDLETT, UT",
        "source": "U.S. Geological Survey legacy WaterServices daily values "
                  "(shut down 2027-02-22)",
        "source_url": url,
        "fetched_at": fetched_at,
        "parameter_code": DISCHARGE_PARAMETER,
        "parameter": "Discharge, cubic feet per second",
        "statistic_code": DAILY_MEAN_STATISTIC,
        "statistic": "Daily mean",
        "approval_codes": {"A": "approved for publication", "P": "provisional"},
        "rule": "mean of the daily means in a water year (1 October to 30 "
                "September), kept only when every day of the year has a "
                "value; the same rule as annual_means_from_daily in "
                "tools/build_gauge_review.py",
        "range": {"first_day": min(days).isoformat(), "last_day": max(days).isoformat()},
        "water_years": years,
    }


def main() -> int:
    query = urllib.parse.urlencode({
        "format": "json", "sites": SITE, "parameterCd": DISCHARGE_PARAMETER,
        "statCd": DAILY_MEAN_STATISTIC, "startDT": START, "endDT": END})
    url = f"{SOURCE_URL}?{query}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=300) as response:
        payload = json.loads(response.read())
    days, approval = parse_legacy_daily(payload)
    if not days:
        print("no daily values returned; nothing written", file=sys.stderr)
        return 1
    fetched_at = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    reference = build_reference(days, approval, fetched_at, url)
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(reference, indent=2) + "\n", encoding="utf-8")
    print(f"{len(days)} days, {len(reference['water_years'])} complete water years "
          f"({min(reference['water_years'])}-{max(reference['water_years'])}) "
          f"-> {OUTPUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
