"""Build `data/assistant/places.json`, the names the shared header's "Find a
place" search offers.

No other published file holds them small enough to fetch on a page that does
not need the full payloads.  It writes a temporary file, validates its shape
and size, then replaces the output.  A failure leaves the last accepted index
untouched.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "data" / "assistant"
SCHEMA_VERSION = 1
MAX_BYTES = {"places.json": 250_000}


def read(path: str) -> dict:
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def places_index() -> dict:
    """Names only: what a reader can search for and nothing they could add up.

    The search fetches this on every page, so it carries no measurement.
    Reservoirs keep the point's own `state`, which is what the link label
    uses to tell two reservoirs of one name apart (ADR-066).  Areas come
    from the drawn roster at every level the export publishes, and snow
    sites from the current payload, which is what the snow page resolves a
    `site` link against.
    """
    reservoirs = read("reservoirs.json")
    snow = read("snowpack.json")
    watersheds = read("reference.json")["geography"]["watersheds"]
    areas = []
    for level, scope in sorted(watersheds["drawn_scopes"].items(),
                               key=lambda item: int(item[0])):
        field = f"huc{level}"
        for unit in watersheds["scopes"][scope]["units"]:
            areas.append({
                "level": int(level), "code": unit[field],
                "name": unit.get("name") or unit[field],
                "states": unit.get("states") or "",
            })
    return {
        "schema_version": SCHEMA_VERSION,
        "topic": "places",
        "as_of": str(reservoirs["generated_at"])[:10],
        "generated_at": reservoirs["generated_at"],
        "reservoirs": [{"name": item["name"], "state": item.get("state")}
                       for item in reservoirs["reservoirs"]],
        "areas": areas,
        "sites": [{"station": site["station"], "name": site["name"],
                   "state": site.get("state")} for site in snow["sites"]],
    }


def encoded(payload: dict) -> bytes:
    return (json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            + "\n").encode("utf-8")


def main() -> int:
    documents = {"places.json": places_index()}
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    temporary = []
    for name, payload in documents.items():
        if payload["schema_version"] != SCHEMA_VERSION or not payload.get("as_of"):
            raise ValueError(f"{name} has no usable schema version or as-of date")
        body = encoded(payload)
        if len(body) > MAX_BYTES[name]:
            raise ValueError(f"{name} is {len(body):,} bytes; budget is {MAX_BYTES[name]:,}")
        path = OUTPUT_DIR / f".{name}.tmp"
        path.write_bytes(body)
        temporary.append((path, OUTPUT_DIR / name, len(body)))
    for source, target, _size in temporary:
        source.replace(target)
    for _source, target, size in temporary:
        print(f"wrote {target.relative_to(ROOT)} ({size:,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
