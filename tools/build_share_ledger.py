"""Append permanent share addresses; a withdrawn or renamed station keeps its URL."""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
LEGACY_SLUGS = {"509": "lake-powell", "6124": "lake-mead"}


def extend_ledger(entries, payload):
    stations, slugs = set(), set()
    for entry in entries:
        station, slug = entry["source_station_id"], entry["slug"]
        if (not isinstance(station, str) or not station.strip()
                or not isinstance(entry["name"], str) or not entry["name"].strip()
                or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug)
                or station in stations or slug in slugs):
            raise ValueError("Invalid or duplicate share-ledger entry")
        stations.add(station)
        slugs.add(slug)
    result = list(entries)
    rows = [*payload["reservoirs"], *payload.get("withdrawn", []),
            *payload.get("reviewed_holds", [])]
    for row in sorted(rows, key=lambda value: value.get("source_station_id", "")):
        station, name = row.get("source_station_id"), row.get("name")
        if not isinstance(station, str) or not station.strip() or not isinstance(name, str) or not name.strip():
            raise ValueError("A share address requires a station identifier and name")
        if station in stations:
            continue
        label = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:64].rstrip("-") or "reservoir"
        suffix = hashlib.sha256(station.encode("utf-8")).hexdigest()[:12]
        slug = LEGACY_SLUGS.get(station, f"reservoir-{label}-{suffix}")
        if slug in slugs:
            raise ValueError(f"Share address already assigned: {slug}")
        result.append(dict(source_station_id=station, name=name, slug=slug))
        stations.add(station)
        slugs.add(slug)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--payload", type=Path, default=ROOT / "reservoirs.json")
    parser.add_argument("--output", type=Path, default=ROOT / "data/share-ledger.json")
    args = parser.parse_args()
    previous = json.loads(args.output.read_text()) if args.output.exists() else []
    extended = extend_ledger(previous, json.loads(args.payload.read_text()))
    if extended != previous or not args.output.exists():
        temporary = args.output.with_suffix(".tmp")
        temporary.write_text(json.dumps(extended, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        temporary.replace(args.output)
    print(f"Share ledger: {len(extended)} permanent addresses ({len(extended) - len(previous)} added)")


if __name__ == "__main__":
    main()
