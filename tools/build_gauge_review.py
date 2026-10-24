"""Build the Utah river-gauge review worksheet for the recent-conditions pilot.

Step 2 of docs/RECENT-CONDITIONS-PILOT.md: a small reviewed gauge roster,
with its regulation context, before anything is fetched daily. This tool
gathers the evidence; the ruling is a person's (ADR-124). It writes
`gauge-review.csv` and nothing else.

    .venv/bin/python tools/build_gauge_review.py              # screen, then trace every row
    .venv/bin/python tools/build_gauge_review.py --no-trace   # screen only
    .venv/bin/python tools/build_gauge_review.py --missing    # trace rows not yet traced
    .venv/bin/python tools/build_gauge_review.py --only 10163000

**The screen.** Two U.S. Geological Survey OGC v1 queries: the daily mean
discharge series (parameter 00060, statistic 00003) inside Utah's bounding
box, joined to the stream monitoring locations whose state is Utah. A gauge
is listed when its primary series has a value within `ACTIVE_WITHIN_DAYS`
of the run. `covers_1991_2020` says whether the record starts by 1 January
1991, the start of the closed period ADR-041 publishes; it does not check
for gaps inside the record, and a water-year baseline is a method decision
the pilot has not made.

**The regulation context.** For each gauge, the NLDI basin indexed to that
gauge (the `nwissite` source, not a position snap, so a gauge cannot land on
the wrong flowline), then which published reservoirs and inventoried snow
sites sit inside it. A listed reservoir is evidence that storage is
upstream, not a finding that the flow is regulated, and never a statement
that the gauge measures the reservoir's inflow. When the traced area and the
gauge's published drainage area differ by more than `AREA_CHECK_RATIO`, the
row says so: the trace may be the wrong basin.

**Every run merges.** `reviewer_ruling` and `notes` are never touched. A
gauge that has stopped reporting keeps its row and its older `screened_on`
date. The file is rewritten after every trace, so an interrupted run keeps
what it finished and `--missing` resumes it.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import os
import re
import sys
import urllib.error
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build_upstream_index as upstream  # noqa: E402

OUTPUT_PATH = ROOT / "gauge-review.csv"

USGS_BASE = "https://api.waterdata.usgs.gov/ogcapi/v1/collections"
USGS_TIMEOUT = 120
#: West, south, east, north, padded slightly past the state line; the
#: monitoring-location state code decides membership, not the box.
UTAH_BBOX = "-114.06,36.99,-109.04,42.01"
UTAH_STATE_CODE = "49"
DISCHARGE_PARAMETER = "00060"
DAILY_MEAN_STATISTIC = "00003"
ACTIVE_WITHIN_DAYS = 7
CLIMATE_START = dt.date(1991, 1, 1)

#: Measured 2026-10-23: one basin answered in 13 to 150 seconds, against the
#: half second the upstream scoping measured in August.
NLDI_TIMEOUT = 300
NLDI_GAUGE_URL = f"{upstream.NLDI_BASE}/linked-data/nwissite"
AREA_CHECK_RATIO = 0.25

#: A trace that ended in a finding about the river. Anything else was the
#: service, and `--missing` tries it again.
TRACE_FINAL = {"traced", "not_indexed", "no_basin"}

FIELDS = [
    "usgs_site_no", "site_name", "county", "huc8", "latitude", "longitude",
    "drainage_area_sq_mi", "record_begin", "last_daily_value",
    "covers_1991_2020", "screened_on", "trace_screen", "nldi_basin_sq_mi",
    "trace_check", "upstream_reservoirs", "upstream_snow_sites",
    "usgs_page", "suggested_ruling", "suggestion_reason",
    "reviewer_ruling", "notes",
]
SCREEN_FIELDS = FIELDS[:FIELDS.index("trace_screen")]
TRACE_FIELDS = ["trace_screen", "nldi_basin_sq_mi", "trace_check",
                "upstream_reservoirs", "upstream_snow_sites"]

#: The tiers a suggestion can name, strongest finding first. A suggestion is
#: arithmetic over the columns beside it; the ruling is still a person's.
SUGGESTIONS = ("exclude", "check", "shaped", "short", "natural")
CONDUIT_NAME = re.compile(r"\b(TUNNEL|DRAIN|CANAL|DITCH)\s+(NEAR|NR|AT)\b")
LOCATOR_WORD = re.compile(r"\b(AT|AB|ABV|ABOVE|BL|BLW|BEL|BELOW)\b")
BELOW_DIVERSION_NAME = re.compile(
    r"\b(BL|BLW|BEL|BELOW)\b.*\b(DIV|DIVERSION|CANAL|DITCH|POWERPLANT|TUNNEL)\b")
USGS_PAGE_URL = "https://waterdata.usgs.gov/monitoring-location/USGS-{site}/"


def suggest(row: dict) -> tuple[str, str]:
    """A suggested ruling and every finding behind it, from the row alone."""
    name = row["site_name"].upper()
    findings: list[tuple[str, str]] = []
    conduit = CONDUIT_NAME.search(name)
    if conduit and not LOCATOR_WORD.search(name[:conduit.start()]):
        findings.append(("exclude", "the gauge measures a tunnel, drain or canal"))
    if row["trace_screen"] != "traced":
        findings.append(("check", f"basin not traced ({row['trace_screen'] or 'not run'})"))
    elif row["trace_check"]:
        findings.append(("check", row["trace_check"]))
    reservoirs = [r for r in row["upstream_reservoirs"].split("; ") if r]
    if reservoirs:
        findings.append(("shaped", f"{len(reservoirs)} published reservoir"
                         f"{'s' if len(reservoirs) != 1 else ''} upstream"))
    if BELOW_DIVERSION_NAME.search(name):
        findings.append(("shaped", "the name places it below a diversion"))
    if row["covers_1991_2020"] != "yes":
        findings.append(("short", f"record starts {row['record_begin'] or 'unknown'}"))
    if not findings:
        snow = "snow sites upstream" if row["upstream_snow_sites"] else "no snow site upstream"
        findings.append(("natural", f"no published reservoir or named diversion upstream; {snow}"))
    tier = min((tier for tier, _ in findings), key=SUGGESTIONS.index)
    return tier, "; ".join(reason for _, reason in findings)


def usgs_features(url: str) -> list[dict]:
    """Every feature across the collection's `next` links.

    The key is sent when the environment has one (ADR-098); the screen is
    two paged queries, inside the anonymous allowance.
    """
    key = os.environ.get("USGS_API_KEY", "").strip()
    headers = {"X-Api-Key": key} if key else None
    features: list[dict] = []
    pages = 0
    next_url: str | None = url
    while next_url:
        pages += 1
        if pages > 50:
            raise RuntimeError("USGS OGC pagination exceeded 50 pages")
        payload = upstream.get_json(next_url, timeout=USGS_TIMEOUT,
                                    headers=headers)
        features.extend(payload.get("features") or [])
        next_url = next((link["href"] for link in payload.get("links") or []
                         if link.get("rel") == "next"), None)
    return features


def fetch_screen_inputs() -> tuple[list[dict], list[dict]]:
    series = usgs_features(
        f"{USGS_BASE}/time-series-metadata/items?" + urllib.parse.urlencode({
            "f": "json", "parameter_code": DISCHARGE_PARAMETER,
            "statistic_id": DAILY_MEAN_STATISTIC, "bbox": UTAH_BBOX,
            "limit": 10000}))
    locations = usgs_features(
        f"{USGS_BASE}/monitoring-locations/items?" + urllib.parse.urlencode({
            "f": "json", "state_code": UTAH_STATE_CODE,
            "site_type_code": "ST", "limit": 10000}))
    return series, locations


def _date(value: str | None) -> dt.date | None:
    return dt.datetime.fromisoformat(value).date() if value else None


def screen(series: list[dict], locations: list[dict],
           today: dt.date) -> dict[str, dict]:
    """Active Utah stream gauges, keyed by site number, screen fields only."""
    by_id = {feature["id"]: feature for feature in locations
             if str(feature.get("id", "")).startswith("USGS-")}
    rows: dict[str, dict] = {}
    for feature in series:
        props = feature.get("properties") or {}
        location = by_id.get(props.get("monitoring_location_id"))
        if location is None or props.get("primary") != "Primary":
            continue
        begin, end = _date(props.get("begin")), _date(props.get("end"))
        if end is None or (today - end).days > ACTIVE_WITHIN_DAYS:
            continue
        place = location.get("properties") or {}
        lon, lat = (location.get("geometry") or {}).get("coordinates") or (None, None)
        site_no = props["monitoring_location_id"].removeprefix("USGS-")
        area = place.get("drainage_area")
        rows[site_no] = {
            "usgs_site_no": site_no,
            "site_name": place.get("monitoring_location_name") or "",
            "county": place.get("county_name") or "",
            "huc8": (place.get("hydrologic_unit_code") or "")[:8],
            "latitude": lat, "longitude": lon,
            "drainage_area_sq_mi": "" if area is None else area,
            "record_begin": begin.isoformat() if begin else "",
            "last_daily_value": end.isoformat(),
            "covers_1991_2020": "yes" if begin and begin <= CLIMATE_START else "no",
            "screened_on": today.isoformat(),
        }
    return rows


def gauge_basin(site_no: str) -> list:
    payload = upstream.get_json(f"{NLDI_GAUGE_URL}/USGS-{site_no}/basin?f=json",
                                timeout=NLDI_TIMEOUT)
    polygons = []
    for feature in payload.get("features") or []:
        geometry = feature.get("geometry") or {}
        if geometry.get("type") == "Polygon":
            polygons.append(geometry.get("coordinates") or [])
        elif geometry.get("type") == "MultiPolygon":
            polygons.extend(geometry.get("coordinates") or [])
    return [[[(float(x), float(y)) for x, y in ring] for ring in polygon]
            for polygon in polygons]


def trace(row: dict, reservoirs: list[dict], sites: list[dict],
          fetch=gauge_basin) -> dict:
    """The trace fields for one row; a service failure is not a finding."""
    blank = dict.fromkeys(TRACE_FIELDS, "")
    try:
        polygons = fetch(row["usgs_site_no"])
    except urllib.error.HTTPError as error:
        screen_name = "not_indexed" if error.code == 404 else "service_error"
        return {**blank, "trace_screen": screen_name,
                "trace_check": f"HTTP {error.code} from the basin service"}
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        return {**blank, "trace_screen": "service_unavailable",
                "trace_check": f"the basin service failed: {error}"}
    if not polygons:
        return {**blank, "trace_screen": "no_basin",
                "trace_check": "the basin service answered no geometry"}

    area = round(upstream.basin_area_sq_km(polygons) * 1_000_000
                 / upstream.SQ_METERS_PER_SQ_MILE)
    box = upstream.bounds_of(upstream.polygons_to_rings(polygons))
    inside = [r["name"] for r in reservoirs
              if upstream.points_in_basin((r["lon"], r["lat"]), polygons, box)]
    snow = [s["station"] for s in sites
            if upstream.points_in_basin((s["lon"], s["lat"]), polygons, box)]
    check = ""
    published = row.get("drainage_area_sq_mi")
    if published not in ("", None) and float(published) > 0:
        if abs(area / float(published) - 1) > AREA_CHECK_RATIO:
            check = (f"traced about {area:,} sq mi; the gauge publishes "
                     f"{float(published):,.0f} sq mi")
    return {"trace_screen": "traced", "nldi_basin_sq_mi": area,
            "trace_check": check,
            "upstream_reservoirs": "; ".join(sorted(set(inside))),
            "upstream_snow_sites": "; ".join(sorted(snow))}


def read_rows(path: Path = OUTPUT_PATH) -> dict[str, dict]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        return {row["usgs_site_no"]: {field: row.get(field, "") for field in FIELDS}
                for row in csv.DictReader(handle)}


def write_rows(rows: dict[str, dict], path: Path = OUTPUT_PATH) -> None:
    for row in rows.values():
        row["usgs_page"] = USGS_PAGE_URL.format(site=row["usgs_site_no"])
        row["suggested_ruling"], row["suggestion_reason"] = suggest(row)
    ordered = sorted(rows.values(), key=lambda r: (r["huc8"], r["usgs_site_no"]))
    temporary = path.with_suffix(".csv.tmp")
    with temporary.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(ordered)
    temporary.replace(path)


def merge_screen(existing: dict[str, dict], screened: dict[str, dict],
                 only: set[str] | None = None) -> dict[str, dict]:
    """Fresh screen fields over the old rows; trace, ruling and notes kept."""
    merged = {site: dict(row) for site, row in existing.items()}
    for site, fresh in screened.items():
        if only and site not in only:
            continue
        row = merged.setdefault(site, dict.fromkeys(FIELDS, ""))
        row.update({field: fresh[field] for field in SCREEN_FIELDS})
    return merged


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--only", action="append", default=[], metavar="SITE",
                        help="screen and trace only these site numbers")
    parser.add_argument("--missing", action="store_true",
                        help="trace only rows with no final trace screen")
    parser.add_argument("--no-trace", action="store_true",
                        help="refresh the screen fields and stop")
    parser.add_argument("--suggest", action="store_true",
                        help="recompute the suggestions offline and stop")
    args = parser.parse_args(argv)
    only = set(args.only) or None

    rows = read_rows()
    if args.suggest:
        write_rows(rows)
        print(f"suggested a ruling for {len(rows)} rows in {OUTPUT_PATH.name}")
        return 0
    if not args.missing:
        series, locations = fetch_screen_inputs()
        screened = screen(series, locations, dt.date.today())
        rows = merge_screen(rows, screened, only)
        write_rows(rows)
        print(f"screened {len(screened)} active Utah gauges; "
              f"{len(rows)} rows in {OUTPUT_PATH.name}")
    if args.no_trace:
        return 0

    reservoirs, sites = upstream.load_roster_and_sites()
    targets = [site for site, row in sorted(rows.items())
               if (not only or site in only)
               and (not args.missing or row["trace_screen"] not in TRACE_FINAL)]
    for count, site in enumerate(targets, 1):
        try:
            result = trace(rows[site], reservoirs, sites)
        except upstream.RateLimited as error:
            print(f"stopped at {site}: {error}; rerun with --missing later")
            return 1
        rows[site].update(result)
        write_rows(rows)
        print(f"[{count}/{len(targets)}] {site} {result['trace_screen']}"
              f" {result['upstream_reservoirs']}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
