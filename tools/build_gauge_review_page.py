"""Carry the worksheet's suggestion and storage evidence into the review page.

The private review page (tools/gauge-review/) reads a `gauges.json` bundle
whose outlines, topographic map frames and nearby points were prepared once
and are not refetched to update the page. This tool rewrites only the
fields the worksheet owns -- the suggestion, its reason, the review queue,
the proposed display name and its check, the watershed name and the storage
evidence -- and leaves everything else as it was. Offline; it writes the bundle and nothing in the
repository.

    python3 tools/build_gauge_review_page.py --bundle DIR/gauges.json --output OUT/gauges.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import build_gauge_review as worksheet  # noqa: E402


def _number(value: str) -> float | int | None:
    if value in ("", None):
        return None
    number = float(value)
    return int(number) if number.is_integer() else number


def _names(value: str) -> list[str]:
    return [part for part in value.split("; ") if part]


def page_fields(row: dict) -> dict:
    """The page's names for the worksheet-owned fields of one row."""
    return {
        "tier": row["suggested_ruling"], "reason": row["suggestion_reason"],
        "queue": row["review_queue"], "huc8Name": row["huc8_name"],
        "proposedName": row["proposed_display_name"], "nameCheck": row["name_check"],
        "flow": _number(row["mean_flow_cfs"]), "flowYears": _number(row["flow_years"]),
        "dams": _number(row["dams_upstream"]), "damAf": _number(row["dam_storage_af"]),
        "share": _number(row["storage_share_pct"]),
        "largest": _names(row["largest_dams"]),
        "irrigation": _number(row["irrigation_dams"]),
        "nearDams": _names(row["dams_near_gauge"]),
    }


def refresh(bundle: dict, rows: dict[str, dict]) -> dict:
    """The bundle with each gauge's worksheet fields replaced.

    A gauge missing from either side is an error, not a silent gap: the page
    and the worksheet must describe the same gauges.
    """
    sites = {gauge["site"] for gauge in bundle["gauges"]}
    if sites != set(rows):
        missing = sorted(sites ^ set(rows))
        raise ValueError(f"the bundle and the worksheet disagree on {len(missing)} "
                         f"gauges: {', '.join(missing[:5])}")
    return {**bundle, "gauges": [{**gauge, **page_fields(rows[gauge["site"]])}
                                 for gauge in bundle["gauges"]]}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--bundle", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    bundle = json.loads(args.bundle.read_text(encoding="utf-8"))
    page = refresh(bundle, worksheet.read_rows())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(page, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(page['gauges'])} gauges to {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
