"""Preview or explicitly merge a saved private review export into the worksheet.

No network requests, roster admissions or suggestion changes. Run without
--apply first; an existing ruling, note or accepted name requires
--replace SITE to change it. An earlier `shaped` ruling is read as `reservoir`,
or goes back to review when the row has a diversion finding (ADR-138).
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import os
import re
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_gauge_review import (  # noqa: E402
    FIELDS, LEGACY_RULINGS, OUTPUT_PATH, SUGGESTIONS, VALID_RULINGS, resolve_ruling)

EXPORT_FIELDS = ["usgs_site_no", "reviewer_ruling", "notes", "updated_at", "save_state"]
#: An export from the page before accepted names has no such column; its
#: absence leaves each row's accepted name as it is.
OPTIONAL_EXPORT_FIELDS = ["accepted_display_name"]
REVIEW_FIELDS = ("reviewer_ruling", "notes", "accepted_display_name")
SITE_NUMBER = re.compile(r"[0-9]{8,15}")
MAX_NAME_LENGTH = 120


def read_csv(content: bytes, fields: list[str],
             optional: list[str] | None = None) -> list[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig"), newline=""),
                            strict=True)
    names = sorted(reader.fieldnames or [])
    allowed = [sorted(fields)] + ([sorted(fields + optional)] if optional else [])
    if reader.fieldnames is None or names not in allowed:
        raise ValueError(f"expected columns: {', '.join(fields)}"
                         + (f" (and optionally {', '.join(optional)})" if optional else ""))
    rows = list(reader)
    seen: set[str] = set()
    for row in rows:
        if None in row or any(value is None for value in row.values()):
            raise ValueError("row has the wrong number of cells")
        site = row["usgs_site_no"]
        if not SITE_NUMBER.fullmatch(site):
            raise ValueError(f"invalid site number {site!r}; keep site numbers as text")
        if site in seen:
            raise ValueError(f"duplicate site number {site}")
        seen.add(site)
    return rows


def merge(export: Path, worksheet: Path, *, apply: bool = False,
          replace: set[str] | None = None) -> dict:
    original = worksheet.read_bytes()
    rows = read_csv(original, FIELDS)
    by_site = {row["usgs_site_no"]: row for row in rows}
    imports = read_csv(export.read_bytes(), EXPORT_FIELDS, OPTIONAL_EXPORT_FIELDS)
    replace = replace or set()
    changes, conflicts, returned = [], [], []
    for incoming in imports:
        site = incoming["usgs_site_no"]
        if site not in by_site:
            raise ValueError(f"{site}: not in the worksheet")
        if incoming["save_state"] != "saved":
            raise ValueError(f"{site}: unsaved or unknown save state; save and export again")
        try:
            updated = dt.datetime.fromisoformat(incoming["updated_at"])
        except ValueError as error:
            raise ValueError(f"{site}: invalid updated_at") from error
        if updated.tzinfo is None:
            raise ValueError(f"{site}: updated_at needs a time zone")
        ruling = incoming["reviewer_ruling"]
        if ruling and ruling not in VALID_RULINGS:
            raise ValueError(f"{site}: invalid reviewer_ruling {ruling!r}")
        name = incoming.get("accepted_display_name")
        if name is not None and (len(name) > MAX_NAME_LENGTH or name != name.strip()
                                 or any(ord(c) < 32 for c in name)):
            raise ValueError(f"{site}: accepted_display_name must be one trimmed line "
                             f"of at most {MAX_NAME_LENGTH} characters")
        current = by_site[site]
        if ruling in LEGACY_RULINGS:
            mapped, why = resolve_ruling({**current, "reviewer_ruling": ruling})
            if not mapped:
                returned.append({"usgs_site_no": site, "saved_ruling": ruling, "why": why})
            ruling = mapped or current["reviewer_ruling"]
        before = {field: current[field] for field in REVIEW_FIELDS}
        after = {"reviewer_ruling": ruling, "notes": incoming["notes"],
                 "accepted_display_name": current["accepted_display_name"] if name is None else name}
        if before == after:
            continue
        if ruling and ruling != current["suggested_ruling"] and not incoming["notes"].strip():
            raise ValueError(f"{site}: a ruling differing from the suggestion needs notes")
        existing = (any(before[f] for f in ("reviewer_ruling", "notes"))
                    or (before["accepted_display_name"]
                        and before["accepted_display_name"] != after["accepted_display_name"]))
        if existing and site not in replace:
            conflicts.append(site)
        changes.append({"usgs_site_no": site, "before": before, "after": after,
                        "updated_at": incoming["updated_at"]})
        current.update(after)

    changed_sites = {change["usgs_site_no"] for change in changes}
    unused = replace - changed_sites
    if unused:
        raise ValueError(f"--replace has no change for: {', '.join(sorted(unused))}")
    report = {"applied": False, "exported_rows": len(imports),
              "unchanged_rows": len(imports) - len(changes),
              "returned_to_review": returned,
              "conflicts": conflicts, "changes": changes}
    if apply and conflicts:
        raise ValueError("existing review would change; preview, then use --replace for: "
                         + ", ".join(conflicts))
    if apply and changes:
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="",
                                             dir=worksheet.parent, delete=False,
                                             prefix=f".{worksheet.name}.") as handle:
                temporary = Path(handle.name)
                writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
                writer.writeheader()
                writer.writerows(rows)
            if worksheet.read_bytes() != original:
                raise ValueError("worksheet changed during import; preview again")
            os.chmod(temporary, worksheet.stat().st_mode & 0o777)
            temporary.replace(worksheet)
            report["applied"] = True
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("export", type=Path, help="saved gauge-rulings.csv export")
    parser.add_argument("--worksheet", type=Path, default=OUTPUT_PATH)
    parser.add_argument("--apply", action="store_true", help="write the previewed merge")
    parser.add_argument("--replace", action="append", default=[], metavar="SITE",
                        help="explicitly replace or clear this site's existing review")
    args = parser.parse_args(argv)
    try:
        report = merge(args.export, args.worksheet, apply=args.apply, replace=set(args.replace))
    except (ValueError, OSError, csv.Error) as error:
        print(f"Import refused: {error}", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 2 if report["conflicts"] else 0


if __name__ == "__main__":
    sys.exit(main())
