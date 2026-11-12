"""Backfill storage history through the existing, reviewed provider adapters.

The daily refresh merges its already-fetched series. This on-demand builder
requests the earlier record, with at most three concurrent public-service
requests. A failed station leaves its published history intact.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import gzip
import json
from pathlib import Path
import sys

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pipeline import providers as P, roster as R, storage_history as H  # noqa: E402
from pipeline.source_history import load_source_history  # noqa: E402


def fetch(record: dict, end: str) -> pd.DataFrame:
    station, source = record["source_station_id"], record["source_key"]
    start = "19000101"
    if source == "rise":
        return P.fetch_rise_series(int(station), start, end)
    if source == "awdb":
        return P.fetch_awdb_series(station, record["data_frequency"], start, end)
    if source == "cdec":
        return P.fetch_cdec_series(station, record["data_frequency"], start, end)
    if source == "cdss":
        return P.fetch_cdss_series(station, start, end)
    if source == "usgs":
        row = R.ADMITTED_USGS_RESERVOIRS[station]
        return P.fetch_usgs_series(station, row["statistic_id"], start, end)
    if source == "cwms":
        row = R.ADMITTED_CWMS_RESERVOIRS[station]
        return P.fetch_cwms_series(row["office"], row["timeseries"], start, end)
    if source == "dnrc":
        row = R.ADMITTED_DNRC_RESERVOIRS[station]
        return P.fetch_dnrc_series(row["sensor_id"], start, end)
    if source in {"cap", "srp"}:
        cached = load_source_history(ROOT / "data/reservoir-source-history.json")
        return cached.get(f"{source}:{station}", pd.DataFrame())
    raise ValueError(f"Unknown storage provider: {source}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="+", help="station IDs or exact reservoir names")
    parser.add_argument("--missing", action="store_true")
    parser.add_argument("--source", choices=("rise", "awdb", "cdec", "cdss", "usgs", "srp", "dnrc", "cwms", "cap"))
    parser.add_argument("--import-from", type=Path, help="merge a verified backfill artifact without network requests")
    parser.add_argument("--workers", type=int, choices=range(1, 4), default=2)
    parser.add_argument("--output", type=Path, default=H.DIRECTORY)
    args = parser.parse_args()
    records = json.loads((ROOT / "reservoirs.json").read_text())["reservoirs"]
    if args.source:
        records = [r for r in records if r["source_key"] == args.source]
    if args.only:
        records = [r for r in records if r["source_station_id"] in args.only or r["name"] in args.only]
        found = {r["source_station_id"] for r in records} | {r["name"] for r in records}
        if set(args.only) - found:
            parser.error("Unknown reservoir: " + ", ".join(sorted(set(args.only) - found)))
    if args.missing:
        # Only a successful backfill has an archive. A fresh station with
        # just this season can safely be requested again.
        records = [r for r in records if not (args.output / H.archive_name(r["source_station_id"])).exists()]
    today = P.local_today()
    if args.import_from:
        import_histories(args.import_from, args.output, records, today.date().isoformat())
        return 0
    end = (today + pd.Timedelta(days=1)).strftime("%Y%m%d")
    failures = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        pending = {pool.submit(fetch, record, end): record for record in records}
        for future in as_completed(pending):
            record = pending[future]
            try:
                frame = future.result()
                if frame.empty:
                    raise ValueError("no usable storage readings")
                station = record["source_station_id"]
                H.publish([record], {station: frame}, today.date().isoformat(), args.output)
                print(f"{station} {record['name']}: {len(frame)} readings from {frame.date.min().date()}", flush=True)
            except Exception as exc:
                failures += 1
                print(f"WARNING: {record['name']}: {type(exc).__name__}: {exc}", flush=True)
    files = list(args.output.glob("*.json"))
    sizes = [len(gzip.compress(path.read_bytes(), mtime=0)) for path in files]
    print(f"History files: {len(files)}; raw {sum(p.stat().st_size for p in files):,} bytes; "
          f"gzip {sum(sizes):,} bytes; largest gzip {max(sizes, default=0):,}; failures {failures}")
    return 1 if failures else 0


def import_histories(source: Path, destination: Path, records: list[dict], run_date: str) -> None:
    index = H.read(source / "index.json")
    current = H.read(source / "current.json")
    for header in (index, current):
        if header.get("schema_version") != 1 or header.get("unit") != "acre-ft":
            raise ValueError("Unsupported storage-history artifact")
    by_station = {r["source_station_id"]: r for r in records}
    current_entries = {r["source_station_id"]: r for r in current["reservoirs"]}
    if len(current_entries) != len(current["reservoirs"]):
        raise ValueError("Duplicate current-history station in artifact")
    frames, imported = {}, []
    for station, location in index["stations"].items():
        if station not in by_station:
            print(f"Skipping artifact station no longer published: {station}")
            continue
        name = location["archive"]
        if name is not None and name != H.archive_name(station):
            raise ValueError("Unexpected storage-history archive path")
        if name and not (source / name).is_file():
            raise ValueError("Missing station archive in artifact")
        archive = H.read(source / name) if name else {}
        if archive and (archive.get("schema_version") != 1 or archive.get("unit") != "acre-ft"):
            raise ValueError("Unsupported station archive")
        entries = [entry for entry in (archive.get("reservoir"), current_entries.get(station)) if entry]
        days = {}
        for entry in entries:
            H.validate_entry(entry)
            if entry["source_station_id"] != station or entry["source_key"] != by_station[station]["source_key"]:
                raise ValueError("Artifact station or provider does not match the published reservoir")
            if entry["end"] > run_date:
                raise ValueError("Artifact has future observations")
            days.update(H.daily.decode(entry, ("values",)))
        if not days or not any(row["values"] is not None for row in days.values()):
            raise ValueError(f"{station}: artifact index has no readings")
        frames[station] = pd.DataFrame([
            {"date": pd.Timestamp(day), "storage_af": row["values"]}
            for day, row in days.items() if row["values"] is not None])
        imported.append(by_station[station])
    H.publish(imported, frames, run_date, destination)
    print(f"Imported {len(imported)} station histories; other stations retained")


if __name__ == "__main__":
    raise SystemExit(main())
