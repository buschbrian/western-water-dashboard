"""Station-keyed storage histories, separate from the summary payload."""
import hashlib
import json
import math
from pathlib import Path

import pandas as pd

from . import daily_history as daily
from . import providers

ROOT = Path(__file__).resolve().parent.parent
DIRECTORY = ROOT / "data/storage-history"


def read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def archive_name(station: str) -> str:
    return hashlib.sha256(station.encode("utf-8")).hexdigest() + ".json"


def water_year(day: str) -> int:
    return int(day[:4]) + (int(day[5:7]) >= 10)


def entry(record: dict, frame: pd.DataFrame, previous: dict | None = None) -> dict:
    reported = {}
    for row in frame.itertuples():
        value = float(row.storage_af)
        if not math.isfinite(value):
            raise ValueError(f"{record['name']}: invalid storage")
        reported[row.date.date().isoformat()] = {"values": value}
    merged = daily.merge(daily.decode(previous, ("values",)), reported, "values")
    providers.exclude_cached_storage_readings(merged, record)
    return {
        "source_station_id": str(record["source_station_id"]),
        "name": record["name"], "source_key": record["source_key"],
        "source_url": record["source_url"], "data_frequency": record["data_frequency"],
        **daily.encode(merged, ("values",)),
    }


def validate_entry(value: dict) -> None:
    for key in ("source_station_id", "name", "source_key", "source_url"):
        if not isinstance(value.get(key), str) or not value[key]:
            raise ValueError(f"storage history: missing {key}")
    if not value["source_url"].startswith("https://"):
        raise ValueError("storage history: source must use HTTPS")
    if value.get("data_frequency") not in {"daily", "monthly"}:
        raise ValueError("storage history: unknown reporting interval")
    daily.check_dense(value["name"], value, ("values",))
    if not any(v is not None for v in value["values"]):
        raise ValueError("storage history: no readings")
    for number in value["values"]:
        if number is not None and (isinstance(number, bool)
                or not isinstance(number, (int, float)) or not math.isfinite(number)):
            raise ValueError("storage history: invalid reading")


def publish(records: list[dict], frames: dict[str, pd.DataFrame], run_date: str,
            directory: Path = DIRECTORY, *, skip_failures: bool = False) -> dict:
    """Merge reported dates; leave unrequested and withdrawn histories intact.

    With ``skip_failures`` (the daily refresh), a station whose reading or
    archive is unusable keeps its published files and the others continue.

    Finished years live in one station file. It is rewritten only when new
    finished dates or a provider correction change it; no daily timestamp.
    """
    directory.mkdir(parents=True, exist_ok=True)
    current_path = directory / "current.json"
    current = read(current_path)
    stored = {e["source_station_id"]: e for e in current.get("reservoirs", [])}
    index_path = directory / "index.json"
    index = read(index_path).get("stations", {})
    year = water_year(run_date)
    frames = dict(frames)
    records = list(records)
    requested = {str(record["source_station_id"]) for record in records
                 if str(record["source_station_id"]) in frames}
    for station, previous in stored.items():
        if station not in requested and water_year(previous["start"]) < year:
            records.append(previous)
            frames[station] = pd.DataFrame([
                {"date": pd.Timestamp(day), "storage_af": row["values"]}
                for day, row in daily.decode(previous, ("values",)).items()
                if row["values"] is not None])
    for record in records:
        try:
            publish_station(record, frames, stored, index, directory, year)
        except (ValueError, OSError) as error:
            if not skip_failures:
                raise
            print(f"WARNING: {record.get('name')} storage history kept as published -- {error}")
    payload = {"schema_version": 1, "unit": "acre-ft", "water_year": year,
               "run_date": run_date, "reservoirs": sorted(stored.values(),
                                                          key=lambda e: e["source_station_id"])}
    for value in payload["reservoirs"]:
        validate_entry(value)
    daily.write_compact(current_path, payload)
    result = {"schema_version": 1, "unit": "acre-ft", "stations": dict(sorted(index.items()))}
    if read(index_path) != result:
        daily.write_compact(index_path, result)
    return result


def publish_station(record: dict, frames: dict[str, pd.DataFrame], stored: dict,
                    index: dict, directory: Path, year: int) -> None:
    station = str(record["source_station_id"])
    frame = frames.get(station)
    if frame is None or frame.empty:
        return
    path = directory / archive_name(station)
    archive = read(path).get("reservoir")
    prior = daily.decode(archive, ("values",))
    prior.update(daily.decode(stored.get(station), ("values",)))
    previous = {**record, **daily.encode(prior, ("values",))} if prior else None
    combined = entry(record, frame, previous)
    validate_entry(combined)
    days = daily.decode(combined, ("values",))
    past = {day: row for day, row in days.items() if water_year(day) < year}
    present = {day: row for day, row in days.items() if water_year(day) >= year}
    metadata = {key: value for key, value in combined.items()
                if key not in {"start", "end", "values"}}
    if past and any(row["values"] is not None for row in past.values()):
        archived = {"schema_version": 1, "unit": "acre-ft",
                    "reservoir": {**metadata, **daily.encode(past, ("values",))}}
        if read(path) != archived:
            daily.write_compact(path, archived)
    if present and any(row["values"] is not None for row in present.values()):
        stored[station] = {**metadata, **daily.encode(present, ("values",))}
    else:
        stored.pop(station, None)
    index[station] = {"archive": path.name if past and path.exists() else None,
                      "start": combined["start"], "end": combined["end"]}
