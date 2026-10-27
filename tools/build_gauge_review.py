"""Build a river-gauge review worksheet for the recent-conditions pilot.

Step 2 of docs/RECENT-CONDITIONS-PILOT.md: a small reviewed gauge roster,
with its regulation context, before anything is fetched daily. This tool
gathers the evidence; the ruling is a person's (ADR-124). It writes
`gauge-review.csv` (Utah) or, with `--state`, `gauge-review-<state>.csv`, and
nothing else.

    .venv/bin/python tools/build_gauge_review.py              # screen, then trace every row
    .venv/bin/python tools/build_gauge_review.py --no-trace   # screen only
    .venv/bin/python tools/build_gauge_review.py --missing    # trace rows not yet traced
    .venv/bin/python tools/build_gauge_review.py --only 10163000
    .venv/bin/python tools/build_gauge_review.py --state CO    # gauge-review-co.csv

**The screen.** Two U.S. Geological Survey OGC v1 queries: the daily mean
discharge series (parameter 00060, statistic 00003) inside the state's
bounding box, joined to the stream monitoring locations whose state is that
state (`STATES`: Utah, Colorado, New Mexico, Arizona). A gauge
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
row says so: the trace may be the wrong basin. A published reservoir inside the basin makes the gauge
shaped, whatever else is found (ADR-137).

**The storage evidence** (`--evidence`, offline apart from two services).
Every dam the National Inventory of Dams places inside a gauge's basin, not
only the reservoirs this site publishes, and their summed storage as a share
of one year's mean flow at the gauge (the degree of regulation). The share
sorts rows; it does not rule them. With no published reservoir in the basin, a
share under `SMALL_STORAGE_SHARE` (10%, ADR-137) suggests natural; a share at
or above it suggests shaped and, when nothing else is in doubt, puts the row in the
`bulk` queue: a natural river wrongly ruled shaped loses only a comparison
with normal, the other mistake publishes a wrong one. Basin outlines come
from the review page's bundle (`--basins`), the simplified outlines the
reviewer sees, so a dam within a few hundred metres of an edge can fall
either side.

**Display names.** `proposed_display_name`, `name_patterns` and `name_check`
come from `tools/gauge_names.py` on every write: proper case, the agency's
abbreviations spelled out, the state suffix dropped. A token the rules cannot
settle stays as written and is named in `name_check`. It is a proposal for a
person to accept; nothing published is renamed.

**Every run merges.** `reviewer_ruling` and `notes` are never touched. A
gauge that has stopped reporting keeps its row and its older `screened_on`
date. The file is rewritten after every trace, so an interrupted run keeps
what it finished and `--missing` resumes it.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import NamedTuple

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build_upstream_index as upstream  # noqa: E402
import gauge_names  # noqa: E402

OUTPUT_PATH = ROOT / "gauge-review.csv"

USGS_BASE = "https://api.waterdata.usgs.gov/ogcapi/v1/collections"
USGS_TIMEOUT = 120

class State(NamedTuple):
    code: str
    #: West, south, east, north, padded slightly past the state line; the
    #: monitoring-location state code decides membership, not the box.
    bbox: str
    output: Path


#: Utah keeps `gauge-review.csv`: the importer and the review page read it.
STATES = {
    "UT": State("49", "-114.06,36.99,-109.04,42.01", OUTPUT_PATH),
    "CO": State("08", "-109.06,36.99,-102.04,41.01", ROOT / "gauge-review-co.csv"),
    "NM": State("35", "-109.06,31.33,-103.00,37.01", ROOT / "gauge-review-nm.csv"),
    "AZ": State("04", "-114.82,31.33,-109.04,37.01", ROOT / "gauge-review-az.csv"),
}
DISCHARGE_PARAMETER = "00060"
DAILY_MEAN_STATISTIC = "00003"
ACTIVE_WITHIN_DAYS = 7
CLIMATE_START = dt.date(1991, 1, 1)

#: Measured 2026-10-23: one basin answered in 13 to 150 seconds, against the
#: half second the upstream scoping measured in August.
NLDI_TIMEOUT = 300
NLDI_GAUGE_URL = f"{upstream.NLDI_BASE}/linked-data/nwissite"
AREA_CHECK_RATIO = 0.25

NID_LAYER = ("https://geospatial.sec.usace.army.mil/dls/rest/services/NID/"
             "National_Inventory_of_Dams_Public_Service/FeatureServer/0")
NID_BATCH = 250
#: The legacy statistics service: keyless, and the only one serving
#: annual means per water year today.
ANNUAL_STATS_URL = "https://waterservices.usgs.gov/nwis/stat/"
#: The service refuses more than ten sites per request.
STATS_BATCH = 10
FLOW_START_WATER_YEAR = 1991
MIN_FLOW_YEARS = 5
#: One cubic foot per second for a year, in acre-feet.
ACRE_FEET_PER_CFS_YEAR = 1.983471 * 365.25
#: Brian's ruling of 2026-10-27 (ADR-137): inventoried storage under this
#: share of a year's flow, with no published reservoir in the basin, is
#: natural. At or above it the gauge is shaped.
SMALL_STORAGE_SHARE = 10.0
#: A dam this close to the gauge may sit in the part of the gauge's own
#: catchment that lies below it, so the row is not bulk-ruled.
NEAR_GAUGE_KM = 1.0
#: The inventory lists a reservoir's dikes and saddle dams as dams of their
#: own, each carrying the whole reservoir's storage (Granby Dam and Granby
#: Dike 1, 539,760 acre-feet each). Equal storage this close is one pool.
SAME_POOL_KM = 10.0
HUC8_PATH = ROOT / "data" / "watersheds" / "west-huc8.geojson"

#: A trace that ended in a finding about the river. Anything else was the
#: service, and `--missing` tries it again.
TRACE_FINAL = {"traced", "not_indexed", "no_basin"}

FIELDS = [
    "usgs_site_no", "site_name", "county", "huc8", "latitude", "longitude",
    "drainage_area_sq_mi", "record_begin", "last_daily_value",
    "covers_1991_2020", "screened_on", "trace_screen", "nldi_basin_sq_mi",
    "trace_check", "upstream_reservoirs", "upstream_snow_sites",
    "mean_flow_cfs", "flow_years", "dams_upstream", "dam_storage_af",
    "storage_share_pct", "largest_dams", "irrigation_dams", "dams_near_gauge",
    "huc8_name", "usgs_page", "proposed_display_name", "name_patterns",
    "name_check", "suggested_ruling", "suggestion_reason",
    "review_queue", "reviewer_ruling", "notes",
]
SCREEN_FIELDS = FIELDS[:FIELDS.index("trace_screen")]
TRACE_FIELDS = ["trace_screen", "nldi_basin_sq_mi", "trace_check",
                "upstream_reservoirs", "upstream_snow_sites"]
EVIDENCE_FIELDS = ["mean_flow_cfs", "flow_years", "dams_upstream",
                   "dam_storage_af", "storage_share_pct", "largest_dams",
                   "irrigation_dams", "dams_near_gauge"]

#: The tiers a suggestion can name, strongest finding first. A suggestion is
#: arithmetic over the columns beside it; the ruling is still a person's.
SUGGESTIONS = ("exclude", "check", "shaped", "short", "natural")
CONDUIT_NAME = re.compile(r"\b(TUNNEL|DRAIN|CANAL|DITCH)\s+(NEAR|NR|AT)\b")
LOCATOR_WORD = re.compile(r"\b(AT|AB|ABV|ABOVE|BL|BLW|BEL|BELOW)\b")
BELOW_DIVERSION_NAME = re.compile(
    r"\b(BL|BLW|BEL|BELOW)\b.*\b(DIV|DIVERSION|CANAL|DITCH|POWERPLANT|TUNNEL)\b")
USGS_PAGE_URL = "https://waterdata.usgs.gov/monitoring-location/USGS-{site}/"


def _share(row: dict) -> float | None:
    value = row.get("storage_share_pct")
    return None if value in ("", None) else float(value)


def findings(row: dict) -> list[tuple[str, str]]:
    """Every finding behind a suggestion, as (tier, reason)."""
    name = row["site_name"].upper()
    found: list[tuple[str, str]] = []
    conduit = CONDUIT_NAME.search(name)
    if conduit and not LOCATOR_WORD.search(name[:conduit.start()]):
        found.append(("exclude", "the gauge measures a tunnel, drain or canal"))
    if row["trace_screen"] != "traced":
        found.append(("check", f"basin not traced ({row['trace_screen'] or 'not run'})"))
    elif row["trace_check"]:
        found.append(("check", row["trace_check"]))
    reservoirs = [r for r in row["upstream_reservoirs"].split("; ") if r]
    share = _share(row)
    dams = int(row.get("dams_upstream") or 0)
    storage = float(row.get("dam_storage_af") or 0)
    held = f"{dams} inventoried dam{'s' if dams != 1 else ''} upstream"
    if dams and share is not None:
        found.append(("shaped" if share >= SMALL_STORAGE_SHARE else "natural",
                      f"{held} hold {share:g}% of a year's flow"))
    elif dams and storage:
        found.append(("shaped", f"{held} hold {storage:,.0f} acre-feet; "
                      "no mean flow to compare"))
    elif dams:
        found.append(("natural", f"{held} list no storage"))
    if reservoirs:
        found.append(("shaped", f"{len(reservoirs)} published reservoir"
                      f"{'s' if len(reservoirs) != 1 else ''} upstream"))
    if BELOW_DIVERSION_NAME.search(name):
        found.append(("shaped", "the name places it below a diversion"))
    irrigation = int(row.get("irrigation_dams") or 0)
    if irrigation:
        found.append(("natural", f"{irrigation} irrigation dam"
                      f"{'s' if irrigation != 1 else ''} upstream: look for diversions"))
    if row.get("dams_near_gauge"):
        found.append(("natural", f"dam within {NEAR_GAUGE_KM:g} km of the gauge, "
                      f"perhaps below it: {row['dams_near_gauge']}"))
    if row["covers_1991_2020"] != "yes":
        found.append(("short", f"record starts {row['record_begin'] or 'unknown'}"))
    if not any(tier != "natural" for tier, _ in found):
        snow = "snow sites upstream" if row["upstream_snow_sites"] else "no snow site upstream"
        what = "large storage" if dams else "reservoir"
        found.append(("natural", f"no {what} or named diversion upstream; {snow}"))
    return found


def suggest(row: dict) -> tuple[str, str]:
    """A suggested ruling and every finding behind it, from the row alone."""
    found = findings(row)
    tier = min((tier for tier, _ in found), key=SUGGESTIONS.index)
    return tier, "; ".join(reason for _, reason in found)


def review_queue(row: dict, tier: str) -> str:
    """Which pile a row sits in: `bulk` may be agreed as a group.

    Only the safe direction is bulk: an exclusion by the gauge's own name,
    or shaped by storage holding at least the small share or by a named
    diversion, with no dam near the gauge that could sit below it.
    """
    if tier == "check":
        return "check"
    if tier == "exclude":
        return "bulk"
    if tier == "shaped" and not row.get("dams_near_gauge"):
        share = _share(row)
        strong = ((share is not None and share >= SMALL_STORAGE_SHARE)
                  or BELOW_DIVERSION_NAME.search(row["site_name"].upper()))
        if strong:
            return "bulk"
    return "review"


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


def fetch_screen_inputs(state: State = STATES["UT"]) -> tuple[list[dict], list[dict]]:
    series = usgs_features(
        f"{USGS_BASE}/time-series-metadata/items?" + urllib.parse.urlencode({
            "f": "json", "parameter_code": DISCHARGE_PARAMETER,
            "statistic_id": DAILY_MEAN_STATISTIC, "bbox": state.bbox,
            "limit": 10000}))
    locations = usgs_features(
        f"{USGS_BASE}/monitoring-locations/items?" + urllib.parse.urlencode({
            "f": "json", "state_code": state.code,
            "site_type_code": "ST", "limit": 10000}))
    return series, locations


def _date(value: str | None) -> dt.date | None:
    return dt.datetime.fromisoformat(value).date() if value else None


def screen(series: list[dict], locations: list[dict],
           today: dt.date) -> dict[str, dict]:
    """Active stream gauges, keyed by site number, screen fields only."""
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


def fetch_dams(box: tuple[float, float, float, float]) -> list[dict]:
    """Every inventoried dam in the box.

    Offset paging on this service overlaps and ends pages early (measured
    2026-10-26: six pages, 3,492 rows, 2,473 distinct), so the dams are
    named by object id first and then fetched by id.
    """
    west, south, east, north = box
    where = {"where": "1=1", "geometry": f"{west},{south},{east},{north}",
             "geometryType": "esriGeometryEnvelope", "inSR": 4326,
             "spatialRel": "esriSpatialRelIntersects", "f": "json"}
    ids = sorted(upstream.get_json(f"{NID_LAYER}/query?" + urllib.parse.urlencode(
        {**where, "returnIdsOnly": "true"}), timeout=USGS_TIMEOUT).get("objectIds") or [])
    features: dict[int, dict] = {}
    for start in range(0, len(ids), NID_BATCH):
        payload = upstream.get_json(f"{NID_LAYER}/query?" + urllib.parse.urlencode({
            "objectIds": ",".join(map(str, ids[start:start + NID_BATCH])),
            "outFields": "OBJECTID,NIDID,NAME,NID_STORAGE,PURPOSES,LATITUDE,LONGITUDE",
            "returnGeometry": "false", "f": "json"}), timeout=USGS_TIMEOUT)
        if "error" in payload:
            raise RuntimeError(f"the dam inventory refused the query: {payload['error']}")
        for feature in payload.get("features") or []:
            attributes = feature.get("attributes") or {}
            features[attributes.get("OBJECTID")] = attributes
    if len(features) != len(ids):
        raise RuntimeError(f"the dam inventory named {len(ids)} dams and returned {len(features)}")
    dams = (dam_record(features[i]) for i in sorted(features))
    return [dam for dam in dams if dam is not None]


def dam_record(attributes: dict) -> dict | None:
    lat, lon = attributes.get("LATITUDE"), attributes.get("LONGITUDE")
    if lat is None or lon is None:
        return None
    return {"id": attributes.get("NIDID") or "",
            "name": (attributes.get("NAME") or "unnamed").strip(),
            "lon": float(lon), "lat": float(lat),
            "storage_af": float(attributes.get("NID_STORAGE") or 0),
            "irrigation": "irrigation" in (attributes.get("PURPOSES") or "").lower()}


def parse_annual_means(rdb: str) -> dict[str, dict[int, float]]:
    """Site number to {water year: mean discharge} from the RDB answer."""
    means: dict[str, dict[int, float]] = {}
    header: list[str] | None = None
    for line in rdb.splitlines():
        if not line or line.startswith("#"):
            continue
        cells = line.split("\t")
        if header is None:
            header = cells
            continue
        if cells[0].endswith("s") and cells[0][:-1].isdigit():
            continue
        row = dict(zip(header, cells))
        try:
            means.setdefault(row["site_no"], {})[int(row["year_nu"])] = float(row["mean_va"])
        except (KeyError, ValueError):
            continue
    return means


def mean_flow(years: dict[int, float]) -> tuple[float | None, int]:
    """The mean of water-year means from 1991 on, or the whole record when
    fewer than `MIN_FLOW_YEARS` fall there."""
    recent = [value for year, value in years.items() if year >= FLOW_START_WATER_YEAR]
    chosen = recent if len(recent) >= MIN_FLOW_YEARS else list(years.values())
    if not chosen:
        return None, 0
    return round(sum(chosen) / len(chosen), 1), len(chosen)


def fetch_annual_means(sites: list[str]) -> dict[str, dict[int, float]]:
    means: dict[str, dict[int, float]] = {}
    for start in range(0, len(sites), STATS_BATCH):
        query = urllib.parse.urlencode({
            "format": "rdb", "sites": ",".join(sites[start:start + STATS_BATCH]),
            "statReportType": "annual", "statYearType": "water",
            "statTypeCd": "mean", "parameterCd": DISCHARGE_PARAMETER})
        request = urllib.request.Request(f"{ANNUAL_STATS_URL}?{query}",
                                         headers={"User-Agent": upstream.USER_AGENT})
        with urllib.request.urlopen(request, timeout=USGS_TIMEOUT) as response:
            means.update(parse_annual_means(response.read().decode("utf-8")))
    return means


def _km(a: tuple[float, float], b: tuple[float, float]) -> float:
    (lon1, lat1), (lon2, lat2) = a, b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = (math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2)
         * math.sin(math.radians(lon2 - lon1) / 2) ** 2)
    return 2 * upstream.EARTH_RADIUS_M / 1000 * math.asin(math.sqrt(h))


def distinct_pools(dams: list[dict]) -> list[dict]:
    """The dams that hold storage, one per pool, largest first.

    A dam whose storage equals a kept dam's within `SAME_POOL_KM` is that
    pool's dike; the kept one is the structure not named a dike.
    """
    ordered = sorted((d for d in dams if d["storage_af"] > 0), key=lambda d: (
        -d["storage_af"], "DIKE" in d["name"].upper(), d["name"]))
    kept: list[dict] = []
    for dam in ordered:
        if not any(k["storage_af"] == dam["storage_af"]
                   and _km((k["lon"], k["lat"]), (dam["lon"], dam["lat"])) <= SAME_POOL_KM
                   for k in kept):
            kept.append(dam)
    return kept


def storage_evidence(row: dict, polygons: list, dams: list[dict],
                     years: dict[int, float] | None) -> dict:
    """The evidence fields for one row; blank where an input is missing."""
    result = dict.fromkeys(EVIDENCE_FIELDS, "")
    flow, count = mean_flow(years or {})
    if flow is not None:
        result.update(mean_flow_cfs=flow, flow_years=count)
    if not polygons:
        return result
    box = upstream.bounds_of(upstream.polygons_to_rings(polygons))
    inside = [d for d in dams
              if upstream.points_in_basin((d["lon"], d["lat"]), polygons, box)]
    pools = distinct_pools(inside)
    storage = sum(d["storage_af"] for d in pools)
    gauge = (float(row["longitude"]), float(row["latitude"]))
    near = sorted(d["name"] for d in inside if _km(gauge, (d["lon"], d["lat"])) <= NEAR_GAUGE_KM)
    largest = pools[:3]
    result.update(
        dams_upstream=len(inside), dam_storage_af=round(storage),
        largest_dams="; ".join(f"{d['name']} ({d['storage_af']:,.0f} AF)" for d in largest),
        irrigation_dams=sum(d["irrigation"] for d in inside),
        dams_near_gauge="; ".join(near))
    if flow:
        result["storage_share_pct"] = round(storage / (flow * ACRE_FEET_PER_CFS_YEAR) * 100, 1)
    return result


def load_page_basins(path: Path) -> dict[str, list]:
    """Basin outlines from the review page's bundle, as polygons.

    The bundle stores each basin as a list of rings and the page draws and
    exports every ring as a polygon of its own, so this reads them the same
    way: what the reviewer sees is what was counted.
    """
    bundle = json.loads(path.read_text(encoding="utf-8"))
    return {gauge["site"]: [[[(float(x), float(y)) for x, y in ring]]
                            for ring in gauge["shape"]]
            for gauge in bundle.get("gauges") or [] if gauge.get("shape")}


def huc8_names(path: Path = HUC8_PATH) -> dict[str, str]:
    if not path.exists():
        return {}
    features = json.loads(path.read_text(encoding="utf-8")).get("features") or []
    return {f["properties"]["huc8"]: f["properties"]["name"] for f in features}


def read_rows(path: Path = OUTPUT_PATH) -> dict[str, dict]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        return {row["usgs_site_no"]: {field: row.get(field, "") for field in FIELDS}
                for row in csv.DictReader(handle)}


def write_rows(rows: dict[str, dict], path: Path = OUTPUT_PATH) -> None:
    names = huc8_names()
    for row in rows.values():
        row["usgs_page"] = USGS_PAGE_URL.format(site=row["usgs_site_no"])
        row["huc8_name"] = names.get(row["huc8"], row.get("huc8_name", ""))
        (row["proposed_display_name"], row["name_patterns"],
         row["name_check"]) = gauge_names.propose(row["site_name"])
        row["suggested_ruling"], row["suggestion_reason"] = suggest(row)
        row["review_queue"] = review_queue(row, row["suggested_ruling"])
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
    parser.add_argument("--state", choices=sorted(STATES), default="UT",
                        help="the state to screen; Utah writes gauge-review.csv, "
                        "the others gauge-review-<state>.csv")
    parser.add_argument("--only", action="append", default=[], metavar="SITE",
                        help="screen and trace only these site numbers")
    parser.add_argument("--missing", action="store_true",
                        help="trace only rows with no final trace screen")
    parser.add_argument("--no-trace", action="store_true",
                        help="refresh the screen fields and stop")
    parser.add_argument("--suggest", action="store_true",
                        help="recompute the suggestions offline and stop")
    parser.add_argument("--evidence", action="store_true",
                        help="add dam storage and mean flow, then stop")
    parser.add_argument("--basins", type=Path, metavar="GAUGES_JSON",
                        help="the review page's gauges.json, for --evidence")
    args = parser.parse_args(argv)
    only = set(args.only) or None
    state = STATES[args.state]
    output = state.output

    rows = read_rows(output)
    if args.evidence:
        if not args.basins:
            parser.error("--evidence needs --basins")
        basins = load_page_basins(args.basins)
        rings = [ring for polygons in basins.values()
                 for ring in upstream.polygons_to_rings(polygons)]
        dams = fetch_dams(upstream.bounds_of(rings))
        targets = sorted(site for site in rows if not only or site in only)
        means = fetch_annual_means(targets)
        for site in targets:
            rows[site].update(storage_evidence(rows[site], basins.get(site, []),
                                               dams, means.get(site)))
        write_rows(rows, output)
        print(f"{len(dams)} inventoried dams; evidence for {len(targets)} rows; "
              f"{sum(1 for s in targets if rows[s]['mean_flow_cfs'] != '')} with a mean flow")
        return 0
    if args.suggest:
        write_rows(rows, output)
        print(f"suggested a ruling for {len(rows)} rows in {output.name}")
        return 0
    if not args.missing:
        series, locations = fetch_screen_inputs(state)
        screened = screen(series, locations, dt.date.today())
        rows = merge_screen(rows, screened, only)
        write_rows(rows, output)
        print(f"screened {len(screened)} active {args.state} gauges; "
              f"{len(rows)} rows in {output.name}")
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
        write_rows(rows, output)
        print(f"[{count}/{len(targets)}] {site} {result['trace_screen']}"
              f" {result['upstream_reservoirs']}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
