"""Assign Census place points to committed drainage areas, without a geocoder."""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import io
import json
from pathlib import Path
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import huc
import watershed_scopes

SOURCE_URL = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_place_national.zip"
STATES = frozenset("AZ CA CO ID MT NM NV OR UT WA WY".split())
MAX_GZIP_BYTES = 96 * 1024


def town_rows(content: str, units: list[dict]) -> list[dict]:
    rows = []
    seen = set()
    reader = csv.DictReader(io.StringIO(content), delimiter="|")
    for raw in reader:
        raw = {key.strip(): value.strip() for key, value in raw.items()}
        if raw["USPS"] not in STATES:
            continue
        geoid = raw["GEOID"]
        if not re.fullmatch(r"\d{7}", geoid) or geoid in seen:
            raise ValueError("Invalid or repeated Census place identifier")
        seen.add(geoid)
        point = float(raw["INTPTLONG"]), float(raw["INTPTLAT"])
        if not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90):
            raise ValueError("Invalid Census place point")
        unit = huc.assign_huc(point, units)
        if unit is None:
            continue
        name = re.sub(r" (city|town|village|CDP|municipality)$", "", raw["NAME"])
        rows.append({"id": geoid, "name": name, "state": raw["USPS"], "huc8": unit["huc6"]})
    return sorted(rows, key=lambda row: row["id"])


def publish(content: str, output: Path) -> dict:
    scope = watershed_scopes.get_scope(watershed_scopes.DRAWN_SCOPES[8])
    units = huc.load_units(ROOT / scope.output)
    rows = town_rows(content, units)
    if not rows:
        raise ValueError("No Census place points in the drawn coverage")
    previous = json.loads(output.read_text()) if output.exists() else None
    if previous and previous.get("source_url") != SOURCE_URL:
        raise ValueError("A new Census vintage needs a reviewed migration")
    # Rebuilt from the source alone: a row whose point leaves the coverage goes.
    merged = {row["id"]: row for row in rows}
    payload = {"schema_version": 1, "source_url": SOURCE_URL, "source_year": 2026,
               "checked_at": dt.date.today().isoformat(),
               "point_definition": "Census internal point; not a water-supply service area",
               "towns": sorted(merged.values(), key=lambda row: row["id"])}
    encoded = (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode()
    cost = len(gzip.compress(encoded, mtime=0))
    if cost > MAX_GZIP_BYTES:
        raise ValueError(f"Town index exceeds {MAX_GZIP_BYTES} gzip bytes: {cost}")
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp")
    temporary.write_bytes(encoded)
    temporary.replace(output)
    return {"towns": len(merged), "bytes": len(encoded), "gzip_bytes": cost}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True, help="Downloaded 2026 Census national places ZIP")
    parser.add_argument("--output", type=Path, default=ROOT / "data/assistant/towns.json")
    args = parser.parse_args()
    with zipfile.ZipFile(args.input) as archive:
        content = archive.read("2026_Gaz_place_national.txt").decode("utf-8-sig")
    print(json.dumps(publish(content, args.output)))


if __name__ == "__main__":
    main()
