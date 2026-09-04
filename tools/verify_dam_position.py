"""Ask the dam inventory about the points the water sources could not settle.

`verify_water_body_points.py` asks five water publications where a point is,
and `classify_water_body_points.py` turns their answers into a verdict. Nine
points survive both: no publication names the claimed water inside the
reviewer's one-kilometre threshold, and four of the nine have no water of any
name within four kilometres.

Those four are not a tolerance problem. A reservoir large enough to publish
that no national polygon layer carries is either mapped nowhere or standing
somewhere other than where it is published, and no amount of re-asking the
same five sources separates the two.

A sixth source can. The National Inventory of Dams is a register of
structures rather than of water, so it carries the small impoundments the
polygon layers drop, and it is already the project's capacity authority
(ADR-003) read through the same public service as
`audit_candidate_capacity.py`. A dam carrying the claimed name standing at
the point says the point is right and the water is merely unmapped. The same
dam standing kilometres away says the coordinate is wrong.

Two distances, and only one of them settles anything:

- **1 km, the reviewer's threshold.** A dam inside it is evidence about this
  point. The column it lands in is read by the classifier.
- **10 km, reported only.** A named dam outside the threshold settles
  nothing, but it is the fact that tells a wrong coordinate apart from
  unmapped water, so it is written down rather than discarded.

The inventory names a project, not a structure (ADR-057), so a point can
answer with a dike or a saddle dam beside the main embankment. Every dam
inside the threshold is recorded and the name test is left to the classifier,
which already knows that a subsidiary word on one side names different water.

This tool merges: it fills two columns for the rows it asked about and
touches nothing else. A row the service did not answer for keeps the evidence
an earlier run recorded, and the run exits non-zero, because writing nothing
into those columns would read as "no dam is there" and would demote a row this
tool has already settled. Run it after `verify_water_body_points.py`, which
rebuilds the file, and before `classify_water_body_points.py`, which reads
what this wrote.

    python tools/verify_dam_position.py
"""

import csv
import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

#: The USACE public service, the same one the capacity audit reads.
NID_LAYER = ("https://geospatial.sec.usace.army.mil/dls/rest/services/NID/"
             "National_Inventory_of_Dams_Public_Service/FeatureServer/0")
USER_AGENT = ("western-water-dashboard/dam-position-probe "
              "(+https://github.com/buschbrian)")
TIMEOUT = 120
POLITENESS_SECONDS = 0.25

#: The reviewer's threshold, and the wider radius that is reported only.
SETTLE_KM, REPORT_METRES = 1.0, 10000
#: Dams per answer. The service truncates silently, so the flag is checked.
PAGE_SIZE = 25

NAME_FIELD, ID_FIELD = "NAME", "NIDID"
#: The verdicts that mean a water publication already named this water.
#:
#: Both spellings are here because two tools write this column:
#: `verify_water_body_points.py` says "verified" and the classifier says
#: "confirmed". Selecting on anything else -- "human review", "point
#: suspect", or a dam confirmation from an earlier run -- keeps this tool
#: idempotent: a row it settled last time is asked again and refreshed,
#: rather than keeping whatever it was told first.
SETTLED_BY_WATER = {"confirmed", "verified"}
EARTH_RADIUS_KM = 6371.0088


def get_json(url: str, params: dict):
    request = urllib.request.Request(
        f"{url}?{urllib.parse.urlencode(params)}",
        headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        print(f"    !! {exc}", file=sys.stderr)
        return None


def kilometres(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance. The service answers in degrees, not metres."""
    radians = math.radians
    half = (math.sin((radians(lat2) - radians(lat1)) / 2) ** 2
            + math.cos(radians(lat1)) * math.cos(radians(lat2))
            * math.sin((radians(lon2) - radians(lon1)) / 2) ** 2)
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(half))


def evidence(distance: float, name: str, identifier: str) -> str:
    """One dam, as the classifier reads it and a reviewer checks it."""
    return f"{name} ({identifier}) at {distance:.2f} km"


def dams_near(lat: float, lon: float) -> list[tuple[float, str, str]] | None:
    """Every dam within the reporting radius, nearest first.

    `None` means the service did not answer, which is not the same fact as an
    empty list. A refusal that means "not looked for" must not read like a
    refusal that means "looked for and not found".
    """
    payload = get_json(f"{NID_LAYER}/query", {
        "f": "json", "geometry": f"{lon},{lat}",
        "geometryType": "esriGeometryPoint", "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects", "distance": REPORT_METRES,
        "units": "esriSRUnit_Meter", "outFields": f"{NAME_FIELD},{ID_FIELD}",
        "returnGeometry": "true", "outSR": 4326,
        "resultRecordCount": PAGE_SIZE,
    })
    time.sleep(POLITENESS_SECONDS)
    if (not isinstance(payload, dict) or payload.get("error")
            or not isinstance(payload.get("features"), list)):
        print("    !! service did not return a feature list", file=sys.stderr)
        return None
    if payload.get("exceededTransferLimit"):
        # More dams than one answer carries, and the service does not sort by
        # distance, so the nearest may not be among them.
        print(f"    !! more than {PAGE_SIZE} dams within "
              f"{REPORT_METRES / 1000:.0f} km; answer truncated",
              file=sys.stderr)
        return None
    found = []
    for feature in payload.get("features", []):
        point = feature.get("geometry") or {}
        name = (feature.get("attributes") or {}).get(NAME_FIELD)
        identifier = (feature.get("attributes") or {}).get(ID_FIELD) or "?"
        if point.get("y") is None or not name:
            continue
        found.append((kilometres(lat, lon, point["y"], point["x"]),
                      str(name).strip(), str(identifier)))
    return sorted(found)


def main() -> int:
    roster = json.loads((ROOT / "reservoirs.json").read_text(encoding="utf-8"))
    index = {r["name"].strip().lower(): r for r in roster["reservoirs"]}

    source = ROOT / "point-verification.csv"
    rows = list(csv.DictReader(source.open(encoding="utf-8")))
    columns = list(rows[0].keys())
    for column in ("dam_1km", "dam_beyond_1km"):
        if column not in columns:
            columns.append(column)
    for row in rows:
        row.setdefault("dam_1km", "")
        row.setdefault("dam_beyond_1km", "")

    asked = [r for r in rows if r["verdict"] not in SETTLED_BY_WATER]
    unanswered: list[str] = []
    for number, row in enumerate(asked, 1):
        reservoir = index.get(row["reservoir"].strip().lower())
        if not reservoir:
            # A point that was never looked for must not read like a point
            # that was looked for and not found.
            print(f"  {number:2}/{len(asked)} {row['reservoir'][:28]:28} "
                  "not in today's payload; not asked", file=sys.stderr)
            unanswered.append(row["reservoir"])
            continue
        found = dams_near(reservoir["lat"], reservoir["lon"])
        if found is None:
            # The service did not answer. Keep what an earlier run recorded:
            # overwriting it with nothing would read as "no dam is there" and
            # would demote a row this tool has already settled.
            unanswered.append(row["reservoir"])
            print(f"  {number:2}/{len(asked)} {row['reservoir'][:28]:28} "
                  "no answer; evidence left as it was", file=sys.stderr)
            continue
        inside = [f for f in found if f[0] <= SETTLE_KM]
        outside = [f for f in found if f[0] > SETTLE_KM]
        # The name, the inventory identifier and the distance: the evidence
        # ADR-015 requires be recorded for any decision made from a dam.
        row["dam_1km"] = "; ".join(evidence(d, n, i) for d, n, i in inside)
        row["dam_beyond_1km"] = "; ".join(evidence(d, n, i)
                                          for d, n, i in outside[:3])
        print(f"  {number:2}/{len(asked)} {row['reservoir'][:28]:28} "
              f"{(inside[0][1] if inside else '-')[:24]:24} "
              f"{(f'{found[0][0]:.2f} km' if found else 'no dam within 10 km'):>20}",
              file=sys.stderr)

    with source.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
    print(f"\nwrote {source}", file=sys.stderr)
    if unanswered:
        # A partial run must not look like a clean one.
        print(f"{len(unanswered)} of {len(asked)} unanswered: "
              f"{', '.join(unanswered)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
