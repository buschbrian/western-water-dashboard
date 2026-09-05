"""Census: how is each published reservoir run, and is it a reservoir at all?

ADR-114 publishes an `operating_character` on the exceptions only --
`restricted`, `run_of_river`, `flood_space`, and nothing at all for ordinary
target-filled storage -- and it says plainly where the value may not come
from: not from the observed series, and not from a hydrographic lookup on its
own. What it does allow is evidence *toward* a reviewed character. This tool
assembles that evidence for all 404 published reservoirs and proposes a
character for each. It proposes; a person decides.

Nothing here is applied. The output is one review file under `data/reviews/`,
and no roster, payload, capacity or normal is touched by it. That is the whole
of the writing this audit does, and it is why an `audit_*` tool writes a file
at all: the deliverable is reviewed-evidence candidates, not repository data
the site reads.

What is asked of which service, per reservoir:

  National Inventory of Dams   purposes, primary purpose, dam type, locks,
  (the layer capacities.json    the storage figures already committed, and
  names in `source_layer`)      the nearest dam to the published point --
                                which is what the natural-lake flag needs and
                                what a reservoir with no `nid_id` has instead
                                of an inventory record. Downloaded once for
                                the eleven states the roster touches and
                                answered offline, rather than 404 queries.

  NHDPlus HR NHDWaterbody      FType/FCode, GNIS name, area, and the polygon,
  (MapServer layer 9)          generalized, so elongation is measured from
                               the shape rather than guessed from a bounding
                               box. A riverine pool is long and narrow.

  NHDPlus HR NetworkNHDFlowline  the mainstem through the pool: GNIS name,
  (MapServer layer 3)            stream order, total upstream drainage area
                                 (`totdasqkm`) and EROM mean annual flow
                                 (`qama`, cubic feet per second). This layer
                                 carries the value-added and EROM columns
                                 itself, so no separate table is needed and
                                 the EPA WATERS fallback is never reached.

  the repository               huc6/huc8, the upstream set from
                               upstream_index.json, the reviewed dam point,
                               the Corps roster's offices and operators, and
                               the Division of Safety of Dams restriction
                               dates from docs/OPERATING-RESTRICTION-REVIEW.md.

The residence-time proxy is `capacity_af / (mean annual flow in cfs x 1.9835
acre-feet per cfs-day)`, in days. It is a proxy and is labelled one
everywhere: it divides a full pool by an annual mean, so it says how long the
water would take to replace itself in an average year, and nothing about how
the operator actually runs the gates. A navigation pool turns over in days; a
storage reservoir in months or years.

**The observed series is corroboration and never a reason** (ADR-114). Each
row carries the percent-full range over its twelve monthly records and its
365-day change beside the proposal, marked as agreeing or disagreeing with it.
No rule reads them.

    python tools/audit_operating_character.py             # fetch, propose, write
    python tools/audit_operating_character.py --dry-run   # write nothing
    python tools/audit_operating_character.py --only "Lake Wallula"
    python tools/audit_operating_character.py --cache-dir /tmp/census-cache
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from admission import NEAR_RADIUS_KM, distance_km, normalize_name  # noqa: E402
from huc import in_ring  # noqa: E402

OUTPUT_PATH = ROOT / "data" / "reviews" / "operating-character-census.json"
RESERVOIRS_PATH = ROOT / "reservoirs.json"
CAPACITIES_PATH = ROOT / "capacities.json"
UPSTREAM_PATH = ROOT / "upstream_index.json"

USER_AGENT = ("western-water-dashboard/operating-character-census "
              "(+https://github.com/buschbrian)")
TIMEOUT = 90
POLITENESS_SECONDS = 0.25
RETRIES = 3

#: NHDPlus HR, the project's reviewed hydrography (tools/probe_nhd_waterbody.py).
NHD_BASE = ("https://hydro.nationalmap.gov/arcgis/rest/services/"
            "NHDPlus_HR/MapServer")
NHD_WATERBODY_LAYER = f"{NHD_BASE}/9"
NHD_FLOWLINE_LAYER = f"{NHD_BASE}/3"

#: The waterbody search tolerance is the project's measurement default, the
#: same 100 metres tools/probe_nhd_waterbody.py asks with.
WATERBODY_TOLERANCE_M = 100
#: The polygon is asked for generalized: about 50 metres of offset, which is
#: far below the length scale elongation measures and keeps a 200 sq km
#: Columbia pool inside one small response.
WATERBODY_OFFSET_DEGREES = 0.0005
#: Flowlines are looked for at the published point, widening until the row
#: found is plausibly the mainstem. A point on a dam finds it at the first
#: radius; a point beside a tributary mouth -- Lake Celilo's is 300 metres
#: from Fifteenmile Creek and rather further from the Columbia -- needs the
#: second or the third.
FLOWLINE_RADII_M = (300, 1000, 3000)
#: How little of the inventory's own drainage area a flowline may carry
#: before it is read as the wrong river. The two agencies measure the same
#: quantity from different sides, so this is a cross-check rather than a
#: tolerance: The Dalles drains 237,000 square miles by the inventory, and
#: Fifteenmile Creek drains 945 square kilometres.
FLOWLINE_DRAINAGE_AGREEMENT = 0.5
SQ_KM_PER_SQ_MI = 2.58999

#: NID FType names for the two codes the water-type question turns on.
FTYPE_NAMES = {390: "LakePond", 436: "Reservoir", 361: "Playa",
               493: "Estuary", 466: "SwampMarsh", 378: "Ice Mass"}

#: Acre-feet delivered by one cubic foot per second flowing for one day.
AF_PER_CFS_DAY = 1.9835

#: The states the published roster touches, in the full spelling the owner
#: service uses; two-letter codes return zero rows rather than an error
#: (tools/build_capacity_table.py measured that).
STATE_NAMES = {
    "AZ": "Arizona", "CA": "California", "CO": "Colorado", "ID": "Idaho",
    "MT": "Montana", "NM": "New Mexico", "NV": "Nevada", "OR": "Oregon",
    "UT": "Utah", "WA": "Washington", "WY": "Wyoming",
}

NID_FIELDS = [
    "NIDID", "NAME", "PRIMARY_PURPOSE", "PURPOSES", "PRIMARY_DAM_TYPE",
    "DAM_TYPES", "NORMAL_STORAGE", "MAX_STORAGE", "NID_STORAGE",
    "DRAINAGE_AREA", "SURFACE_AREA", "NUMBER_OF_LOCKS", "OPERATIONAL_STATUS",
    "CONDITION_ASSESSMENT", "RIVER_OR_STREAM", "YEAR_COMPLETED",
    "PRIMARY_OWNER_TYPE", "OWNER_TYPES", "FED_AGENCY_OWNERS",
    "FED_AGENCY_OPERATIONS", "STATE", "LATITUDE", "LONGITUDE",
    "IS_ASSOCIATED_STRUCTURE", "WEBSITE_URL",
]
NID_PAGE_SIZE = 1000
NID_DAM_PAGE = "https://nid.sec.usace.army.mil/#/dams/system/{nid_id}/summary"

#: A dike is a secondary embankment holding the same pool, so the row that
#: describes the project is the one the inventory does not call associated.
#: The name tie-break is tools/add_dam_points.py's rule, kept identical so two
#: tools reading the same identifier name the same structure.
SECONDARY_STRUCTURE = re.compile(r"\b(dike|dyke|saddle|auxiliary|levee)\b",
                                 re.IGNORECASE)

#: NID purpose words, as the service spells them out. It publishes the words
#: rather than the single-letter codes the inventory documentation lists, so
#: these are matched on the words and the codes are recorded for the reader.
PURPOSE_NAVIGATION = "Navigation"
PURPOSE_HYDROELECTRIC = "Hydroelectric"
PURPOSE_FLOOD = "Flood Risk Reduction"

# --- thresholds, each named and each reported in the output header ---------

#: A mainstem large enough that a pool on it is a river reach rather than a
#: headwater impoundment. Lowered from 5,000 after the first full run, which
#: is what the census was for: 5,000 sq km cut off eleven waters that pass
#: both other legs, and the ones it cut are re-regulating pools directly
#: below larger dams -- Dexter below Lookout Point at 2,590 sq km, Foster
#: below Green Peter at 1,274 -- which are held at a steady level in exactly
#: the sense ADR-114 describes. There is no gap in the data to put the
#: threshold in, so it is set where a mainstem stops being a river: the
#: largest water it now excludes is Lyons Reservoir on a 174 sq km creek.
RUN_OF_RIVER_MIN_DRAINAGE_SQ_KM = 1_000.0
#: A pool that replaces its own volume inside a month is not storing water
#: between seasons. Ten days is the confident case.
RUN_OF_RIVER_MAX_RESIDENCE_DAYS = 30.0
RUN_OF_RIVER_CONFIDENT_RESIDENCE_DAYS = 10.0
#: ADR-072's gross-versus-conservation pattern: a normal pool this far below
#: the maximum pool is a project with room kept above its supply pool.
FLOOD_SPACE_NORMAL_SHARE = 0.5
#: Where the water NHD maps is this small a share of the pool the inventory
#: describes, the reservoir is normally far below its own pool -- which is
#: what a dam operated empty looks like from above. Measured across the 315
#: reservoirs answering both figures: the median is 0.90, Detroit and Green
#: Peter sit at 1.03 and 0.95, and Martis Creek and Howard Hanson -- the two
#: this census is trying to separate from them -- sit at 0.08 and 0.04.
FLOOD_SPACE_MAPPED_POOL_SHARE = 0.25

#: The Division of Safety of Dams restrictions, from
#: docs/OPERATING-RESTRICTION-REVIEW.md, which read them off the state's
#: September 2025 report. Keyed by station rather than by name (ADR-066).
DSOD_SOURCE = ("California Division of Safety of Dams, September 2025 "
               "restricted-dams report, as reviewed in "
               "docs/OPERATING-RESTRICTION-REVIEW.md")
RESTRICTED = {
    ("cdec", "TNM"): ("Tinemaha", "1993-03-03", "Seismic"),
    ("cdec", "HWE"): ("Haiwee", "2002-07-23", "Seismic"),
    ("cdec", "CRO"): ("Calero", "2013-02-08", "Seismic"),
    ("cdec", "GLK"): ("Gem Lake", "2013-02-14", "Seismic"),
    ("cdec", "ELC"): ("El Capitan", "2015-05-27", "Seismic"),
    ("cdec", "MCO"): ("McCloud", "2020-01-09", "Other"),
    ("cdec", "SGC"): ("Santiago Creek", "2020-05-08", "Other"),
    ("cdec", "SNN"): ("San Andreas", "2020-08-03", "Other"),
    ("cdec", "MOR"): ("Morena", "2021-11-10", "Hydraulic"),
    ("cdec", "HDG"): ("Lake Hodges", "2023-02-02", "Seismic"),
    ("cdec", "LPY"): ("Scott", "2023-04-12", "Seismic"),
    ("cdec", "MRR"): ("Murray", "2023-07-19", "Seismic"),
    ("cdec", "RLF"): ("Relief", "2024-06-02", "Other"),
    ("cdec", "CNV"): ("Crane Valley Storage", "2024-10-06", "Other"),
}
#: Restricted by its operator and absent from the state list, so it has no
#: effective date. ADR-111 needs one before a restricted level may divide a
#: reading; the character does not divide anything, so it is proposed here
#: with the date recorded as missing.
RESTRICTED_WITHOUT_A_DATE = {
    ("cdec", "CYC"): ("Coyote", "Valley Water publishes a restriction; the "
                      "state's September 2025 list does not carry the dam, "
                      "so no effective date is established."),
}

#: Words that make a GNIS name a lake's rather than a reservoir's. The flag
#: needs all three of its legs, because ADR-078 measured that FType alone
#: typed 25 of 26 dammed impoundments as LakePond.
#: The agency the inventory names as operating a dam, where that agency runs
#: flood-control projects. Kept to the Corps of Engineers deliberately:
#: Reclamation also owns dams whose primary purpose is flood risk reduction
#: and runs them as storage -- Grand Coulee is one -- so a broader test would
#: propose flood space for reservoirs that fill every year on purpose.
FLOOD_CONTROL_OPERATOR = re.compile(r"corps of engineers", re.IGNORECASE)

LAKE_WORD = re.compile(r"\blake\b", re.IGNORECASE)
RESERVOIR_WORD = re.compile(r"\b(reservoir|dam|forebay|afterbay|pool)\b",
                            re.IGNORECASE)

ROSTER_PATHS = {
    "rise": "admitted_rise_reservoirs.json",
    "awdb": "admitted_reservoirs.json",
    "cdec": "admitted_cdec_reservoirs.json",
    "cdss": "admitted_cdss_reservoirs.json",
    "usgs": "admitted_usgs_reservoirs.json",
    "srp": "admitted_srp_reservoirs.json",
    "dnrc": "admitted_dnrc_reservoirs.json",
    "cwms": "admitted_cwms_reservoirs.json",
    "cap": "admitted_cap_reservoirs.json",
}


# --------------------------------------------------------------------------
# Pure functions. Everything below this line up to `fetch_json` is arithmetic
# on rows, takes no network and is what tests/test_operating_character_census.py
# drives with synthetic evidence.
# --------------------------------------------------------------------------

def residence_time_days(capacity_af: float | None,
                        mean_annual_flow_cfs: float | None) -> float | None:
    """How long the pool would take to replace itself in an average year.

    A proxy, and only that: it divides a full pool by an annual mean flow, so
    it knows nothing about the season the water arrives in or what the
    operator does with the gates. Returns None where either figure is missing
    or the flow is not positive -- a zero-flow denominator is not an infinite
    residence time, it is an unanswered question.
    """
    if not capacity_af or not mean_annual_flow_cfs:
        return None
    if capacity_af <= 0 or mean_annual_flow_cfs <= 0:
        return None
    return capacity_af / (mean_annual_flow_cfs * AF_PER_CFS_DAY)


SQ_KM_IN_ACRES = 247.105

#: Stated once in the file header rather than on all 404 rows.
MAPPED_POOL_BASIS = ("NHDPlus HR mapped water area divided by the inventory's "
                     "pool surface area. Evidence about how full a pool "
                     "normally is, not a storage figure.")
RESIDENCE_TIME_BASIS = (
    "proxy: capacity_af / (mean annual flow in cfs x 1.9835 acre-feet per "
    "cfs-day), in days. Not a measurement of how the water is operated.")


def mapped_pool_share(waterbody: dict | None, nid: dict | None) -> dict | None:
    """How much of the inventory's pool NHD actually maps as water.

    Two agencies measuring the same reservoir from different sides: the
    inventory publishes the surface area of the pool the dam can hold, and
    NHD maps the water that is normally there. A dam operated empty shows the
    difference from above, without reading a single reading.

    It is evidence and not a measurement of storage. A waterbody match that
    landed on a side pond reads as a near-zero share for a full reservoir, so
    the share is reported with whether the polygon contains the published
    point, and only a contained polygon is allowed to raise a proposal's
    confidence.
    """
    if not waterbody or not nid:
        return None
    area_sq_km = waterbody.get("area_sq_km")
    pool_acres = nid.get("surface_area_acres")
    if not area_sq_km or not pool_acres or pool_acres <= 0:
        return None
    mapped_acres = area_sq_km * SQ_KM_IN_ACRES
    share = mapped_acres / pool_acres
    # A dam point sits outside its own pool more often than in it -- 124 of
    # the 356 polygons found here -- so containment is not the test of a good
    # match. One candidate inside the tolerance is: two would mean the
    # neighbouring pool is as close as this one. A share under a hundredth is
    # a polygon that is not this reservoir at all.
    plausible = (share >= 0.01
                 and (bool(waterbody.get("contains_the_point"))
                      or waterbody.get("candidates_within_tolerance") == 1))
    return {
        "mapped_water_acres": round(mapped_acres),
        "inventory_pool_acres": pool_acres,
        "share": round(share, 3),
        "polygon_contains_the_point": bool(waterbody.get("contains_the_point")),
        "polygon_is_a_plausible_match": plausible,
    }


def _to_metres(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Longitude/latitude to a local equirectangular plane, in metres.

    Good to a fraction of a percent over a lake, which is far inside what a
    long-to-short ratio needs.
    """
    if not points:
        return []
    lat0 = sum(p[1] for p in points) / len(points)
    scale = math.cos(math.radians(lat0))
    metres_per_degree = 111_320.0
    return [((x * scale) * metres_per_degree, y * metres_per_degree)
            for x, y in points]


def convex_hull(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """Andrew's monotone chain. Counter-clockwise, no repeated endpoint."""
    unique = sorted(set(points))
    if len(unique) <= 2:
        return unique

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower: list[tuple[float, float]] = []
    for point in unique:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper: list[tuple[float, float]] = []
    for point in reversed(unique):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def oriented_extent(points: list[tuple[float, float]]) -> tuple[float, float]:
    """Long and short side of the smallest rectangle around the points.

    Rotating calipers over the convex hull's edges: the minimum-area
    rectangle around a convex shape has a side flush with one of its edges,
    so testing every edge finds it. An axis-aligned box would call a diagonal
    reservoir square, which is the answer this measurement exists to avoid.
    """
    hull = convex_hull(points)
    if len(hull) < 3:
        if len(hull) < 2:
            return 0.0, 0.0
        (x0, y0), (x1, y1) = hull[0], hull[-1]
        return math.hypot(x1 - x0, y1 - y0), 0.0
    best = None
    for index in range(len(hull)):
        ax, ay = hull[index]
        bx, by = hull[(index + 1) % len(hull)]
        length = math.hypot(bx - ax, by - ay)
        if length == 0:
            continue
        ux, uy = (bx - ax) / length, (by - ay) / length
        alongs = [(px - ax) * ux + (py - ay) * uy for px, py in hull]
        acrosses = [-(px - ax) * uy + (py - ay) * ux for px, py in hull]
        width = max(alongs) - min(alongs)
        height = max(acrosses) - min(acrosses)
        area = width * height
        if best is None or area < best[0]:
            best = (area, max(width, height), min(width, height))
    if best is None:
        return 0.0, 0.0
    return best[1], best[2]


def elongation_from_rings(rings: list[list[list[float]]]) -> dict | None:
    """Long-to-short ratio of the polygon, measured from its own shape."""
    points = [(float(vertex[0]), float(vertex[1]))
              for ring in rings or [] for vertex in ring]
    if len(points) < 3:
        return None
    long_m, short_m = oriented_extent(_to_metres(points))
    if long_m <= 0:
        return None
    return {
        "elongation": round(long_m / short_m, 2) if short_m > 0 else None,
        "long_axis_km": round(long_m / 1000, 3),
        "short_axis_km": round(short_m / 1000, 3),
        "basis": "oriented bounding box of the generalized polygon",
    }


def elongation_from_bbox(extent: dict | None) -> dict | None:
    """The fallback, labelled as one: a north-south bounding-box ratio.

    Reported when the service returns an extent and no polygon. It measures
    the box and not the water, so a reservoir lying north-east reads rounder
    than it is.
    """
    if not extent:
        return None
    try:
        xmin, ymin = float(extent["xmin"]), float(extent["ymin"])
        xmax, ymax = float(extent["xmax"]), float(extent["ymax"])
    except (KeyError, TypeError, ValueError):
        return None
    corners = [(xmin, ymin), (xmax, ymin), (xmax, ymax), (xmin, ymax)]
    (x0, y0), (x1, _), (_, y2), _ = _to_metres(corners)
    width, height = abs(x1 - x0), abs(y2 - y0)
    long_m, short_m = max(width, height), min(width, height)
    if long_m <= 0:
        return None
    return {
        "elongation": round(long_m / short_m, 2) if short_m > 0 else None,
        "long_axis_km": round(long_m / 1000, 3),
        "short_axis_km": round(short_m / 1000, 3),
        "basis": "bounding-box ratio (fallback: no polygon was returned)",
    }


def point_in_rings(point: tuple[float, float],
                   rings: list[list[list[float]]]) -> bool:
    """Even-odd across every ring, so islands and parts both count.

    `huc.in_polygon` reads ring 0 as the outer boundary and the rest as its
    holes, which is right for a watershed and wrong for a reservoir published
    as forty-six rings of pool and island.
    """
    return sum(1 for ring in rings or [] if in_ring(point, ring)) % 2 == 1


def purpose_list(purposes: str | None) -> list[str]:
    """The inventory's comma-separated purposes, as a list."""
    return [part.strip() for part in (purposes or "").split(",") if part.strip()]


def principal_structure(rows: list[dict]) -> dict | None:
    """The row of a dam identifier that describes the project.

    A dam identifier names a project: McNary answers with a lock and dam and
    thirteen levees, and the levees carry their own purposes. The row wanted
    is the one the inventory does not mark as an associated structure, that
    publishes a storage figure, and whose name is not a dike's -- in that
    order, and sorted rather than filtered so a project whose rows are all
    associated still resolves to one of them.
    """
    if not rows:
        return None

    def rank(row: dict) -> tuple:
        associated = str(row.get("IS_ASSOCIATED_STRUCTURE") or "").lower() == "yes"
        storage = any(row.get(field) for field in
                      ("NID_STORAGE", "MAX_STORAGE", "NORMAL_STORAGE"))
        secondary = bool(SECONDARY_STRUCTURE.search(row.get("NAME") or ""))
        return (associated, not storage, secondary, row.get("NAME") or "")

    return sorted(rows, key=rank)[0]


def observed_signature(record: dict) -> dict:
    """Percent full across the twelve monthly records, and the year's change.

    Corroboration only (ADR-114): no rule below reads this, and every
    proposal states whether the series agrees with it or not.
    """
    capacity = record.get("capacity_af")
    shares = []
    if capacity:
        for month in record.get("monthly") or []:
            mean = month.get("mean_af")
            if mean is not None:
                shares.append(100.0 * mean / capacity)
    signature = {
        "months": len(shares),
        "pct_full_min": round(min(shares), 1) if shares else None,
        "pct_full_max": round(max(shares), 1) if shares else None,
        "pct_full_range": round(max(shares) - min(shares), 1) if shares else None,
        "change_365d_pct": record.get("change_365d_pct"),
        "note": "corroboration only; no rule reads these (ADR-114)",
    }
    return signature


def agreement(character: str | None, observed: dict) -> str:
    """Whether the series looks like the proposed character. Never a reason."""
    spread = observed.get("pct_full_range")
    change = observed.get("change_365d_pct")
    high = observed.get("pct_full_max")
    if character is None or spread is None:
        return "not assessed"
    if character == "run_of_river":
        steady = spread <= 15 and (change is None or abs(change) <= 5)
        return "agrees" if steady else "disagrees"
    if character == "flood_space":
        return "agrees" if (high is not None and high <= 50) else "disagrees"
    if character == "restricted":
        return "not assessed"
    return "not assessed"


def propose_restricted(key: tuple[str, str]) -> dict | None:
    """The established restrictions, carried through for completeness."""
    if key in RESTRICTED:
        dam, effective, reason = RESTRICTED[key]
        return {
            "operating_character": "restricted",
            "confidence": "high",
            "rule": "restricted: a dated dam-safety order",
            "evidence": [
                {"what": "restricted dam", "value": dam, "source": DSOD_SOURCE},
                {"what": "effective date", "value": effective, "source": DSOD_SOURCE},
                {"what": "reason for restriction", "value": reason,
                 "source": DSOD_SOURCE},
            ],
        }
    if key in RESTRICTED_WITHOUT_A_DATE:
        dam, why = RESTRICTED_WITHOUT_A_DATE[key]
        return {
            "operating_character": "restricted",
            "confidence": "medium",
            "rule": "restricted: an operator-published restriction with no state date",
            "evidence": [
                {"what": "restricted dam", "value": dam, "source": DSOD_SOURCE},
                {"what": "effective date", "value": None, "source": why},
            ],
        }
    return None


def propose_run_of_river(nid: dict | None, flowline: dict | None,
                         residence_days: float | None,
                         waterbody: dict | None = None) -> dict | None:
    """A pool on a large river, held for navigation or power, turning over fast.

    Three legs and all three are required. Purposes alone would take every
    hydroelectric headwater dam in the Sierra; a large river alone would take
    every storage reservoir on a trunk stream; a short residence time alone
    would take a small pond on a big creek.
    """
    if not nid or not flowline:
        return None
    purposes = nid.get("purposes") or []
    wanted = [p for p in purposes
              if p in (PURPOSE_NAVIGATION, PURPOSE_HYDROELECTRIC)]
    drainage = flowline.get("total_drainage_area_sq_km")
    if not wanted:
        return None
    if drainage is None or drainage < RUN_OF_RIVER_MIN_DRAINAGE_SQ_KM:
        return None
    if residence_days is None or residence_days > RUN_OF_RIVER_MAX_RESIDENCE_DAYS:
        return None
    navigation = PURPOSE_NAVIGATION in wanted or bool(nid.get("number_of_locks"))
    fast = residence_days <= RUN_OF_RIVER_CONFIDENT_RESIDENCE_DAYS
    confidence = "high" if (navigation and fast) else (
        "medium" if (navigation or fast) else "low")
    return {
        "operating_character": "run_of_river",
        "confidence": confidence,
        "rule": ("run_of_river: inventory purposes include navigation or "
                 "hydroelectric, a mainstem of at least "
                 f"{RUN_OF_RIVER_MIN_DRAINAGE_SQ_KM:,.0f} sq km runs through "
                 "the water, and the residence-time proxy is at most "
                 f"{RUN_OF_RIVER_MAX_RESIDENCE_DAYS:.0f} days"),
        "evidence": [
            {"what": "inventory purposes", "value": ", ".join(purposes),
             "source": nid.get("source_url")},
            {"what": "navigation locks", "value": nid.get("number_of_locks"),
             "source": nid.get("source_url")},
            {"what": "mainstem", "value": flowline.get("gnis_name"),
             "source": flowline.get("source_url")},
            {"what": "upstream drainage area (sq km)", "value": drainage,
             "source": flowline.get("source_url")},
            {"what": "mean annual flow (cfs)",
             "value": flowline.get("mean_annual_flow_cfs"),
             "source": flowline.get("source_url")},
            {"what": "residence-time proxy (days)", "value": round(residence_days, 2),
             "source": "capacity_af / (cfs x 1.9835); a proxy"},
            {"what": "shape (long-to-short ratio)",
             "value": ((waterbody or {}).get("shape") or {}).get("elongation"),
             "source": (waterbody or {}).get("source_url")},
        ],
    }


def propose_flood_space(nid: dict | None,
                        mapped_pool: dict | None = None) -> dict | None:
    """A flood-control project with room it does not intend to fill.

    The primary purpose is required, and it is not enough on its own: Grand
    Coulee's primary purpose is flood risk reduction and it is an ordinary
    storage reservoir with a conservation pool 98% of its maximum. What
    separates the two is what the inventory publishes underneath the flood
    pool -- a conservation pool far below it, or none at all -- or, where the
    figures do not separate them, who runs the project. Martis Creek is the
    case that needs the last leg: its conservation pool is 64% of its maximum,
    which no storage test catches, and it is a Corps of Engineers flood-risk
    project. Grand Coulee is why the leg names the operating agency rather
    than the ownership: it is federal too, and Reclamation runs it as storage.
    """
    if not nid:
        return None
    if nid.get("primary_purpose") != PURPOSE_FLOOD:
        return None
    purposes = nid.get("purposes") or []
    normal = nid.get("normal_storage_af")
    maximum = nid.get("max_storage_af") or nid.get("nid_storage_af")
    share = (normal / maximum) if (normal and maximum) else None
    flood_only = purposes == [PURPOSE_FLOOD]
    no_conservation_pool = bool(maximum) and not normal
    below = share is not None and share <= FLOOD_SPACE_NORMAL_SHARE
    corps = FLOOD_CONTROL_OPERATOR.search(
        f"{nid.get('federal_operator') or ''} {nid.get('federal_owner') or ''}")
    if not (flood_only or no_conservation_pool or below or corps):
        return None
    normally_empty = bool(
        mapped_pool and mapped_pool.get("polygon_is_a_plausible_match")
        and mapped_pool.get("share") is not None
        and mapped_pool["share"] <= FLOOD_SPACE_MAPPED_POOL_SHARE)
    if flood_only or no_conservation_pool or normally_empty:
        confidence = "high"
    elif below:
        confidence = "medium"
    else:
        confidence = "low"
    return {
        "operating_character": "flood_space",
        "confidence": confidence,
        "rule": ("flood_space: the inventory's primary purpose is flood risk "
                 "reduction and it publishes either no conservation pool, or "
                 "flood control as the only purpose, or a conservation pool at "
                 f"most {FLOOD_SPACE_NORMAL_SHARE:.0%} of the maximum pool "
                 "(ADR-072's pattern), or the Corps of Engineers operates it"),
        "evidence": [
            {"what": "primary purpose", "value": nid.get("primary_purpose"),
             "source": nid.get("source_url")},
            {"what": "inventory purposes", "value": ", ".join(purposes),
             "source": nid.get("source_url")},
            {"what": "normal (conservation) pool, acre-feet", "value": normal,
             "source": nid.get("source_url")},
            {"what": "maximum pool, acre-feet", "value": maximum,
             "source": nid.get("source_url")},
            {"what": "conservation pool as a share of maximum",
             "value": round(share, 3) if share is not None else None,
             "source": nid.get("source_url")},
            {"what": "federal operator", "value": nid.get("federal_operator"),
             "source": nid.get("source_url")},
            {"what": "mapped water as a share of the inventory's pool",
             "value": (mapped_pool or {}).get("share"),
             "source": MAPPED_POOL_BASIS},
        ],
    }


def natural_lake_flag(waterbody: dict | None, nid: dict | None,
                      nearest_dam: dict | None) -> dict | None:
    """Three legs, because FType has already been measured to fail alone.

    ADR-078 found NHD's FType typed twenty-five of twenty-six dammed
    impoundments as LakePond, Courtright and Ice House among them. So a
    LakePond code is one leg of three: the roster must also hold no inventory
    record, no dam may stand within the radius that confirms one by position,
    and the GNIS name must be a lake's.
    """
    if not waterbody or waterbody.get("ftype") != 390:
        return None
    if nid:
        return None
    if nearest_dam and nearest_dam.get("distance_km") is not None \
            and nearest_dam["distance_km"] <= NEAR_RADIUS_KM:
        return None
    name = waterbody.get("gnis_name") or ""
    if not LAKE_WORD.search(name) or RESERVOIR_WORD.search(name):
        return None
    return {
        "flag": "review as natural lake",
        "axis": "water_type (ADR-112)",
        "confidence": "low",
        "rule": ("natural lake: NHD FType LakePond AND no inventory record on "
                 f"the roster AND no dam within {NEAR_RADIUS_KM:g} km of the "
                 "published point AND a GNIS name that is a lake's. FType "
                 "alone is refused: ADR-078 measured it typing 25 of 26 "
                 "dammed impoundments as LakePond."),
        "evidence": [
            {"what": "NHD FType", "value": "390 LakePond",
             "source": waterbody.get("source_url")},
            {"what": "GNIS name", "value": name,
             "source": waterbody.get("source_url")},
            {"what": "inventory record on the roster", "value": None,
             "source": "the reservoir's admitted roster entry"},
            {"what": "nearest inventory dam",
             "value": (f"{nearest_dam['name']} at "
                       f"{nearest_dam['distance_km']} km"
                       if nearest_dam else "none within the search"),
             "source": nearest_dam.get("source_url") if nearest_dam else None},
        ],
    }


def propose(key: tuple[str, str], nid: dict | None, flowline: dict | None,
            residence_days: float | None, observed: dict,
            waterbody: dict | None = None,
            mapped_pool: dict | None = None) -> dict:
    """Run every rule in order and take the first that fires.

    Order is precedence, and it is stated rather than discovered: a dam-safety
    order is a fact about a reservoir that outranks how it would otherwise be
    run, and a navigation pool that also has flood purposes is run as a
    navigation pool.
    """
    proposal = (propose_restricted(key)
                or propose_run_of_river(nid, flowline, residence_days, waterbody)
                or propose_flood_space(nid, mapped_pool))
    if proposal is None:
        proposal = {
            "operating_character": None,
            "confidence": "medium",
            "rule": ("none: no rule fired, so this reads as ordinary "
                     "target-filled storage, which ADR-114 leaves unlabelled"),
            "evidence": [],
        }
    proposal["needs_review"] = True
    proposal["observed_agreement"] = agreement(
        proposal["operating_character"], observed)
    return proposal


def review_links(record: dict, nid_id: str | None,
                 waterbody_id: str | None) -> dict:
    lat, lon = record["lat"], record["lon"]
    links = {
        "national_map_hydrography": (
            f"{NHD_WATERBODY_LAYER}/query?geometry={lon},{lat}"
            "&geometryType=esriGeometryPoint&inSR=4326"
            f"&distance={WATERBODY_TOLERANCE_M}&units=esriSRUnit_Meter"
            "&spatialRel=esriSpatialRelIntersects&outFields=*"
            "&returnGeometry=false&f=html"),
        "map_view": f"https://www.openstreetmap.org/#map=14/{lat}/{lon}",
        "satellite_view": ("https://www.google.com/maps/@?api=1"
                           f"&map_action=map&center={lat},{lon}"
                           "&zoom=15&basemap=satellite"),
    }
    if nid_id:
        links["nid_dam_page"] = NID_DAM_PAGE.format(nid_id=nid_id)
    if waterbody_id:
        links["nhd_waterbody_record"] = (
            f"{NHD_WATERBODY_LAYER}/query?where=permanent_identifier="
            f"'{waterbody_id}'&outFields=*&returnGeometry=false&f=html")
    return links


# --------------------------------------------------------------------------
# The network half.
# --------------------------------------------------------------------------

class Service:
    """A counted service, so the review can say what answered and what did not."""

    def __init__(self, name: str, url: str, answers: str):
        self.name, self.url, self.answers = name, url, answers
        self.asked = self.answered = self.silent = self.failed = 0

    def as_dict(self) -> dict:
        return {"service": self.name, "url": self.url,
                "what it was asked": self.answers, "asked": self.asked,
                "answered": self.answered, "silent": self.silent,
                "failed": self.failed}


def fetch_json(url: str, params: dict, cache_dir: Path,
               refresh: bool = False) -> dict | None:
    """A cached, polite, retrying GET. None means the service did not answer."""
    query = urllib.parse.urlencode(params)
    digest = hashlib.sha1(f"{url}?{query}".encode()).hexdigest()[:20]
    cached = cache_dir / f"{digest}.json"
    if cached.exists() and not refresh:
        try:
            return json.loads(cached.read_text(encoding="utf-8"))["payload"]
        except (ValueError, KeyError):
            pass
    payload = None
    for attempt in range(1, RETRIES + 1):
        request = urllib.request.Request(
            f"{url}?{query}", headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                payload = json.loads(response.read().decode("utf-8"))
            break
        except (urllib.error.URLError, TimeoutError, ValueError) as exc:
            print(f"    !! attempt {attempt}/{RETRIES}: {exc}", file=sys.stderr)
            if attempt == RETRIES:
                return None
            time.sleep(2 * attempt)
    time.sleep(POLITENESS_SECONDS)
    if isinstance(payload, dict) and payload.get("error"):
        print(f"    !! service error: {payload['error'].get('message')}",
              file=sys.stderr)
        return None
    cache_dir.mkdir(parents=True, exist_ok=True)
    cached.write_text(json.dumps({"url": url, "params": params,
                                  "payload": payload}), encoding="utf-8")
    return payload


def fetch_nid_rows(layer: str, states: list[str], cache_dir: Path,
                   service: Service, refresh: bool) -> list[dict]:
    """Every inventory row in the states the roster touches, once.

    Downloaded whole and answered offline: 404 point queries would ask the
    same service the same question four hundred times, and the nearest-dam
    question needs the rows anyway.
    """
    where = "STATE IN ({})".format(
        ",".join(f"'{STATE_NAMES[state]}'" for state in sorted(states)))
    rows: list[dict] = []
    offset = 0
    while True:
        service.asked += 1
        payload = fetch_json(f"{layer}/query", {
            "where": where, "outFields": ",".join(NID_FIELDS),
            "returnGeometry": "false", "orderByFields": "OBJECTID",
            "resultOffset": offset, "resultRecordCount": NID_PAGE_SIZE,
            "f": "json"}, cache_dir, refresh)
        if payload is None:
            service.failed += 1
            break
        features = payload.get("features") or []
        rows.extend(feature["attributes"] for feature in features)
        service.answered += 1
        print(f"  inventory: {len(rows)} rows", file=sys.stderr)
        if len(features) < NID_PAGE_SIZE and not payload.get("exceededTransferLimit"):
            break
        offset += len(features)
        if not features:
            break
    return rows


def nid_record(rows: list[dict], layer: str) -> dict:
    """One dam identifier's rows, reduced to the row that is the project."""
    principal = principal_structure(rows)
    if principal is None:
        return {}
    return {
        "lookup": "by nid_id from the roster",
        "nid_id": principal.get("NIDID"),
        "dam_name": principal.get("NAME"),
        "primary_purpose": principal.get("PRIMARY_PURPOSE"),
        "purposes": purpose_list(principal.get("PURPOSES")),
        "primary_dam_type": principal.get("PRIMARY_DAM_TYPE"),
        "dam_types": purpose_list(principal.get("DAM_TYPES")),
        "normal_storage_af": principal.get("NORMAL_STORAGE"),
        "max_storage_af": principal.get("MAX_STORAGE"),
        "nid_storage_af": principal.get("NID_STORAGE"),
        "drainage_area_sq_mi": principal.get("DRAINAGE_AREA"),
        "surface_area_acres": principal.get("SURFACE_AREA"),
        "number_of_locks": principal.get("NUMBER_OF_LOCKS"),
        "operational_status": principal.get("OPERATIONAL_STATUS"),
        "condition_assessment": principal.get("CONDITION_ASSESSMENT"),
        "river_or_stream": (principal.get("RIVER_OR_STREAM") or "").strip() or None,
        "year_completed": principal.get("YEAR_COMPLETED"),
        "primary_owner_type": principal.get("PRIMARY_OWNER_TYPE"),
        "owner_types": purpose_list(principal.get("OWNER_TYPES")),
        "federal_owner": principal.get("FED_AGENCY_OWNERS"),
        "federal_operator": principal.get("FED_AGENCY_OPERATIONS"),
        "structures_under_this_id": len(rows),
        "source_url": layer,
    }


def nearest_dam(rows: list[dict], lon: float, lat: float, layer: str,
                within_km: float = 25.0) -> dict | None:
    """The closest inventory dam to the published point, whatever the roster says."""
    best = None
    for row in rows:
        row_lat, row_lon = row.get("LATITUDE"), row.get("LONGITUDE")
        if row_lat is None or row_lon is None:
            continue
        try:
            away = distance_km((lon, lat), (float(row_lon), float(row_lat)))
        except (TypeError, ValueError):
            continue
        if best is None or away < best[0]:
            best = (away, row)
    if best is None or best[0] > within_km:
        return None
    away, row = best
    return {
        "nid_id": row.get("NIDID"), "name": row.get("NAME"),
        "distance_km": round(away, 3),
        "purposes": purpose_list(row.get("PURPOSES")),
        "source_url": layer,
    }


def choose_waterbody(features: list[dict], lon: float, lat: float,
                     name: str) -> tuple[dict, str]:
    """Which of the polygons at the point is this reservoir.

    Containment first, then the name. A dam sitting between two pools is
    inside neither and 100 metres from both: McNary's point answers with Lake
    Wallula and Lake Umatilla, and taking the larger hands Wallula its
    neighbour's shape. The name is the same weak evidence `admission.py`
    treats it as -- it is asked only after position has failed to decide, and
    only between polygons the point is already beside.
    """
    wanted = normalize_name(name)
    containing = [f for f in features
                  if point_in_rings((lon, lat),
                                    (f.get("geometry") or {}).get("rings"))]
    for pool, how in ((containing, "the polygon holds the published point"),
                      (features,
                       f"the closest match within {WATERBODY_TOLERANCE_M} m; "
                       "the published point falls outside it, which is where "
                       "a dam point usually falls")):
        if not pool:
            continue
        named = [f for f in pool
                 if normalize_name(f["attributes"].get("gnis_name")) == wanted]
        if named:
            chosen = max(named,
                         key=lambda f: f["attributes"].get("areasqkm") or 0)
            return chosen, f"{how}, and its name is the reservoir's"
        chosen = max(pool, key=lambda f: f["attributes"].get("areasqkm") or 0)
        return chosen, how
    raise ValueError("choose_waterbody needs at least one feature")


def fetch_waterbody(lon: float, lat: float, name: str, cache_dir: Path,
                    service: Service, refresh: bool) -> dict | None:
    """The NHD waterbody at the published point, with its shape."""
    service.asked += 1
    payload = fetch_json(f"{NHD_WATERBODY_LAYER}/query", {
        "geometry": f"{lon},{lat}", "geometryType": "esriGeometryPoint",
        "inSR": "4326", "spatialRel": "esriSpatialRelIntersects",
        "distance": WATERBODY_TOLERANCE_M, "units": "esriSRUnit_Meter",
        "outFields": "permanent_identifier,gnis_name,ftype,fcode,areasqkm",
        "returnGeometry": "true", "outSR": "4326",
        "maxAllowableOffset": WATERBODY_OFFSET_DEGREES,
        "resultRecordCount": 10, "f": "json"}, cache_dir, refresh)
    if payload is None:
        service.failed += 1
        return None
    features = payload.get("features") or []
    if not features:
        service.silent += 1
        return None
    chosen, match = choose_waterbody(features, lon, lat, name)
    contains = point_in_rings((lon, lat), (chosen.get("geometry") or {}).get("rings"))
    service.answered += 1
    attributes = chosen["attributes"]
    geometry = chosen.get("geometry") or {}
    shape = (elongation_from_rings(geometry.get("rings"))
             or elongation_from_bbox(payload.get("extent")))
    ftype = attributes.get("ftype")
    return {
        "permanent_identifier": attributes.get("permanent_identifier"),
        "gnis_name": attributes.get("gnis_name"),
        "ftype": ftype,
        "ftype_name": FTYPE_NAMES.get(ftype, str(ftype)),
        "fcode": attributes.get("fcode"),
        "area_sq_km": attributes.get("areasqkm"),
        "match": match,
        "contains_the_point": bool(contains),
        "candidates_within_tolerance": len(features),
        "shape": shape,
        "source_url": NHD_WATERBODY_LAYER,
    }


def choose_mainstem(rows: list[dict]) -> dict | None:
    """The largest river among coincident flowlines, and its own flow.

    Two things sit on top of each other at a dam. NHDPlus splits a reach into
    a main path and a minor divergence path carrying the same drainage area
    and almost none of the water: at Little Goose the Snake River's 57,640
    cubic feet per second and an unnamed path's 0.004 both claim 212,415
    square kilometres. Taking the largest drainage area alone picks whichever
    of them the service listed first with a rounding advantage, which is how
    the Lower Snake's second-largest navigation pool came back with a
    residence time of five hundred years.

    So the drainage area chooses the river, and the flow chooses between
    paths of the same river.
    """
    measured = [row for row in rows if row.get("totdasqkm") is not None]
    if not measured:
        return None
    largest = max(row["totdasqkm"] for row in measured)
    same_river = [row for row in measured if row["totdasqkm"] >= largest * 0.99]
    return max(same_river, key=lambda row: row.get("qama") or 0)


def flowline_carries_the_dams_drainage(flowline: dict, nid: dict | None) -> bool | None:
    """Whether the river found agrees with the drainage area the dam claims."""
    if not nid or not nid.get("drainage_area_sq_mi"):
        return None
    inventory_sq_km = nid["drainage_area_sq_mi"] * SQ_KM_PER_SQ_MI
    found = flowline.get("totdasqkm") or 0
    return found >= inventory_sq_km * FLOWLINE_DRAINAGE_AGREEMENT


def fetch_flowline(lon: float, lat: float, waterbody_id: str | None,
                   nid: dict | None, cache_dir: Path, service: Service,
                   refresh: bool) -> dict | None:
    """The mainstem at the published point, widened until it is plausible.

    Asked spatially rather than by the pool's identifier. Every flowline whose
    `wbarea_permanent_identifier` is the pool returns the same mainstem row
    and takes twenty times as long, because that column is not indexed.

    The search stops at the first radius answering with a river the inventory
    recognizes -- a reach carrying at least half the drainage area it gives
    the dam -- and widens while that fails. Where the inventory publishes no
    drainage area there is nothing to check against and the first answer
    stands, which is recorded rather than hidden. A point beside a tributary
    mouth answers at 300 metres with the tributary, and that is the case this
    widening exists for.
    """
    fields = ("permanent_identifier,gnis_name,ftype,fcode,streamorde,"
              "totdasqkm,qama,qema,lengthkm,wbarea_permanent_identifier")
    best: dict | None = None
    for radius in FLOWLINE_RADII_M:
        service.asked += 1
        payload = fetch_json(f"{NHD_FLOWLINE_LAYER}/query", {
            "geometry": f"{lon},{lat}", "geometryType": "esriGeometryPoint",
            "inSR": "4326", "spatialRel": "esriSpatialRelIntersects",
            "distance": radius, "units": "esriSRUnit_Meter",
            "outFields": fields, "returnGeometry": "false",
            "resultRecordCount": 50, "f": "json"}, cache_dir, refresh)
        if payload is None:
            service.failed += 1
            return None
        features = payload.get("features") or []
        attributes = choose_mainstem([f["attributes"] for f in features])
        if attributes is None:
            continue
        through = bool(waterbody_id and attributes.get(
            "wbarea_permanent_identifier") == waterbody_id)
        agrees = flowline_carries_the_dams_drainage(attributes, nid)
        candidate = {
            "permanent_identifier": attributes.get("permanent_identifier"),
            "gnis_name": attributes.get("gnis_name"),
            "stream_order": attributes.get("streamorde"),
            "total_drainage_area_sq_km": attributes.get("totdasqkm"),
            "mean_annual_flow_cfs": attributes.get("qama"),
            "mean_annual_flow_field": "qama (EROM mean annual flow, cfs)",
            "gauge_adjusted_flow_cfs": attributes.get("qema"),
            "through_the_waterbody": through,
            "carries_the_inventorys_drainage_area": agrees,
            "search_radius_m": radius,
            "candidates": len(features),
            "source_url": NHD_FLOWLINE_LAYER,
        }
        if best is None or (candidate["total_drainage_area_sq_km"] or 0) > \
                (best["total_drainage_area_sq_km"] or 0):
            best = candidate
        # The inventory's drainage area is a veto and the pool's own path is
        # not a defence against it: Lake Celilo's point sits on Fifteenmile
        # Creek's mapped water, so the creek is both "through the waterbody"
        # and the wrong river by a factor of six hundred.
        if agrees is not False:
            break
    if best is None:
        service.silent += 1
        return None
    service.answered += 1
    return best


# --------------------------------------------------------------------------
# Assembly.
# --------------------------------------------------------------------------

def load_roster_index() -> dict:
    index = {}
    for source_key, filename in ROSTER_PATHS.items():
        payload = json.loads((ROOT / filename).read_text(encoding="utf-8"))
        for station, entry in (payload.get("reservoirs") or {}).items():
            index[(source_key, str(station))] = {
                "entry": entry, "file": filename,
                "reviewed": payload.get("reviewed"),
                "storage_source": payload.get("storage_source"),
            }
    return index


def roster_capacity(key: tuple[str, str], roster: dict,
                    capacities: dict) -> dict:
    """The reviewed capacity evidence for a station, from wherever it lives.

    The original Reclamation and Conservation Service stations carry theirs in
    capacities.json; every admitted station carries its own beside its
    configuration. A station in neither -- the twenty-five original Utah
    Conservation Service reservoirs -- has a capacity in the pipeline's
    constants and no inventory row, which is a fact this census reports rather
    than repairs.
    """
    held = roster.get(key)
    if held and held["entry"].get("capacity"):
        return held["entry"]["capacity"]
    return capacities.get(key[1], {})


def census_row(record: dict, roster: dict, capacities: dict, upstream: dict,
               nid_rows_by_id: dict, nid_rows_by_state: dict, nid_layer: str,
               cache_dir: Path, services: dict, refresh: bool) -> dict:
    key = (record["source_key"], str(record["source_station_id"]))
    lon, lat = record["lon"], record["lat"]
    capacity = roster_capacity(key, roster, capacities)
    held = roster.get(key)
    entry = held["entry"] if held else {}

    nid_id = capacity.get("nid_id")
    nid = None
    inventory_note = None
    if not nid_id:
        inventory_note = ("no inventory record: the roster carries no nid_id "
                          "for this station")
    else:
        rows = nid_rows_by_id.get(nid_id) or []
        if rows:
            nid = nid_record(rows, nid_layer)
        else:
            inventory_note = (f"no inventory record: nid_id {nid_id} answered "
                              "no row in the downloaded states")

    states = set(record.get("waterbody_states") or [])
    if record.get("state"):
        states.add(record["state"])
    candidates = [row for state in (states or set(STATE_NAMES))
                  for row in nid_rows_by_state.get(state, [])]
    closest = nearest_dam(candidates, lon, lat, nid_layer)

    waterbody = fetch_waterbody(lon, lat, record["name"], cache_dir,
                                services["nhd_waterbody"], refresh)
    flowline = fetch_flowline(
        lon, lat, (waterbody or {}).get("permanent_identifier"), nid,
        cache_dir, services["nhd_flowline"], refresh)
    residence = residence_time_days(
        record.get("capacity_af"), (flowline or {}).get("mean_annual_flow_cfs"))

    trace = upstream.get(str(record["source_station_id"])) or {}
    observed = observed_signature(record)
    mapped_pool = mapped_pool_share(waterbody, nid)
    proposal = propose(key, nid, flowline, residence, observed, waterbody,
                       mapped_pool)
    flag = natural_lake_flag(waterbody, nid, closest)

    return {
        "source_key": record["source_key"],
        "source_station_id": record["source_station_id"],
        "name": record["name"],
        "lat": lat, "lon": lon,
        "capacity_af": record.get("capacity_af"),
        "capacity_basis": record.get("capacity_basis"),
        "pct_of_capacity": record.get("pct_of_capacity"),
        "inventory": nid,
        "inventory_note": inventory_note,
        "nearest_inventory_dam": closest,
        "nhd_waterbody": waterbody,
        "nhd_flowline": flowline,
        "mapped_pool": mapped_pool,
        "residence_time_days": round(residence, 2) if residence else None,
        "committed_geography": {
            "huc6": record.get("huc6"), "huc6_name": record.get("huc6_name"),
            "huc8": record.get("huc8"), "huc8_name": record.get("huc8_name"),
            "upstream_basin_sq_mi": trace.get("basin_area_sq_mi"),
            "upstream_reservoirs": len(trace.get("upstream_reservoirs") or []),
            "upstream_snow_sites": len(trace.get("upstream_snow_sites") or []),
            "reviewed_dam_point": (
                [capacity.get("dam_lon"), capacity.get("dam_lat")]
                if capacity.get("dam_lon") is not None else None),
            "dam_match_confirmed_by": capacity.get("match_confirmed_by"),
            "dam_match_distance_km": capacity.get("match_distance_km"),
        },
        "operator": {
            "operator": record.get("operator") or entry.get("operator"),
            "corps_office": entry.get("office"),
            "capacity_basis": capacity.get("capacity_basis"),
            "capacity_source": capacity.get("capacity_source"),
            "roster_file": held["file"] if held else None,
            "roster_reviewed": held["reviewed"] if held else None,
        },
        "observed": observed,
        "proposal": proposal,
        "water_type_flag": flag,
        "review_links": review_links(
            record, nid_id, (waterbody or {}).get("permanent_identifier")),
    }


def build(args) -> dict:
    payload = json.loads(RESERVOIRS_PATH.read_text(encoding="utf-8"))
    records = payload["reservoirs"]
    if args.only:
        wanted = {name.lower() for name in args.only}
        records = [r for r in records if r["name"].lower() in wanted]
    if args.limit:
        records = records[:args.limit]

    capacities_file = json.loads(CAPACITIES_PATH.read_text(encoding="utf-8"))
    nid_layer = capacities_file["source_layer"]
    capacities = capacities_file["capacities"]
    roster = load_roster_index()
    upstream = json.loads(UPSTREAM_PATH.read_text(encoding="utf-8"))["traces"] \
        if UPSTREAM_PATH.exists() else {}

    services = {
        "nid": Service(
            "U.S. Army Corps of Engineers, National Inventory of Dams",
            nid_layer,
            "purposes, primary purpose, dam type, locks, storage figures, and "
            "the nearest dam to each published point"),
        "nhd_waterbody": Service(
            "U.S. Geological Survey NHDPlus HR, NHDWaterbody",
            NHD_WATERBODY_LAYER,
            "FType/FCode, GNIS name, area and the polygon the elongation is "
            "measured from"),
        "nhd_flowline": Service(
            "U.S. Geological Survey NHDPlus HR, NetworkNHDFlowline",
            NHD_FLOWLINE_LAYER,
            "the mainstem's GNIS name, stream order, total upstream drainage "
            "area and EROM mean annual flow"),
    }

    states = sorted({state for record in records
                     for state in ((record.get("waterbody_states") or [])
                                   + ([record["state"]] if record.get("state") else []))
                     if state in STATE_NAMES})
    print(f"inventory: downloading {len(states)} states", file=sys.stderr)
    nid_rows = fetch_nid_rows(nid_layer, states, args.cache_dir,
                              services["nid"], args.refresh)
    nid_rows_by_id: dict[str, list[dict]] = {}
    nid_rows_by_state: dict[str, list[dict]] = {}
    reverse_states = {name: code for code, name in STATE_NAMES.items()}
    for row in nid_rows:
        nid_rows_by_id.setdefault(row.get("NIDID"), []).append(row)
        code = reverse_states.get(row.get("STATE"))
        if code:
            nid_rows_by_state.setdefault(code, []).append(row)

    rows = []
    for index, record in enumerate(records, start=1):
        rows.append(census_row(record, roster, capacities, upstream,
                               nid_rows_by_id, nid_rows_by_state, nid_layer,
                               args.cache_dir, services, args.refresh))
        if index % 25 == 0 or index == len(records):
            print(f"  [{index:>3}/{len(records)}] {record['name']}",
                  file=sys.stderr)

    counts: dict[str, int] = {}
    for row in rows:
        character = row["proposal"]["operating_character"] or "none"
        counts[character] = counts.get(character, 0) + 1
    return {
        "$comment": [
            "A census, not a decision. Every row proposes an operating "
            "character (ADR-114) from geospatial and inventory evidence and "
            "carries needs_review: true. Nothing here is applied to a roster "
            "or a payload; a reviewer approves or refuses each row.",
            "The observed series is recorded beside each proposal as "
            "agreement or disagreement, and no rule reads it (ADR-114).",
        ],
        "generated_at": dt.date.today().isoformat(),
        "generated_by": "tools/audit_operating_character.py",
        "published_payload": {
            "generated_at": payload.get("generated_at"),
            "reservoir_count": payload.get("reservoir_count"),
            "as_of_rows": len(rows),
        },
        "keyed_by": "source_key and source_station_id (ADR-066)",
        "services": [service.as_dict() for service in services.values()],
        "rules": {
            "restricted": ("the dated dam-safety orders established in "
                           "docs/OPERATING-RESTRICTION-REVIEW.md, plus one "
                           "operator-published restriction with no state date"),
            "run_of_river": (
                "inventory purposes include navigation or hydroelectric AND "
                f"the mainstem at the point drains at least "
                f"{RUN_OF_RIVER_MIN_DRAINAGE_SQ_KM:,.0f} sq km AND the "
                f"residence-time proxy is at most "
                f"{RUN_OF_RIVER_MAX_RESIDENCE_DAYS:.0f} days "
                f"(high confidence below "
                f"{RUN_OF_RIVER_CONFIDENT_RESIDENCE_DAYS:.0f} days with a lock "
                "or a navigation purpose)"),
            "flood_space": (
                "the inventory's primary purpose is flood risk reduction AND "
                "it publishes no conservation pool, or flood control as its "
                "only purpose, or a conservation pool at most "
                f"{FLOOD_SPACE_NORMAL_SHARE:.0%} of the maximum pool, or the "
                "Corps of Engineers operates it. Confidence rises to high "
                "where NHD maps the water at no more than "
                f"{FLOOD_SPACE_MAPPED_POOL_SHARE:.0%} of the inventory's pool "
                "surface"),
            "none": "no rule fired; ordinary target-filled storage is unlabelled",
            "natural_lake_flag": (
                "NHD FType LakePond AND no inventory record on the roster AND "
                f"no dam within {NEAR_RADIUS_KM:g} km AND a GNIS name that is "
                "a lake's. FType alone is refused (ADR-078)"),
            "precedence": "restricted, then run_of_river, then flood_space",
            "residence_time_proxy": RESIDENCE_TIME_BASIS,
            "mapped_pool_share": MAPPED_POOL_BASIS,
        },
        "counts": counts,
        "natural_lake_flags": sum(1 for row in rows if row["water_type_flag"]),
        "rows": rows,
    }


def summarize(report: dict) -> None:
    print("\n=== Proposed operating characters")
    for character, count in sorted(report["counts"].items()):
        print(f"  {character:<14} {count:>4}")
    print(f"  natural-lake flags: {report['natural_lake_flags']}")
    for service in report["services"]:
        print(f"  {service['service'][:58]:<60} asked {service['asked']:>4} "
              f"answered {service['answered']:>4} silent {service['silent']:>3} "
              f"failed {service['failed']:>3}")
    for character in ("restricted", "run_of_river", "flood_space"):
        rows = [r for r in report["rows"]
                if r["proposal"]["operating_character"] == character]
        if not rows:
            continue
        print(f"\n--- {character} ({len(rows)})")
        for row in sorted(rows, key=lambda r: r["name"]):
            print(f"  {row['name']:<34} {row['proposal']['confidence']:<7}"
                  f" {row['proposal']['observed_agreement']:<12}"
                  f" residence={row['residence_time_days']}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path,
                        default=Path("/tmp/operating-character-census-cache"),
                        help="where raw service responses are kept")
    parser.add_argument("--refresh", action="store_true",
                        help="ask the services again rather than reading the cache")
    parser.add_argument("--only", nargs="*", help="published names to census")
    parser.add_argument("--limit", type=int, help="first N reservoirs only")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the summary and write nothing")
    args = parser.parse_args()

    report = build(args)
    summarize(report)
    if args.dry_run:
        print(f"\n(dry run: {OUTPUT_PATH.relative_to(ROOT)} not written)")
        return 0
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")
    print(f"\nwrote {OUTPUT_PATH.relative_to(ROOT)} ({len(report['rows'])} rows)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
