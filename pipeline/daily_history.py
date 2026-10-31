"""Shared mechanics for daily history files that grow by one day at a time.

`river_history.json` and `soil_moisture_history.json` (ADR-146) keep a column
of values for each day from a `start` date, the layout `elevation_history.json`
uses: the value at position n belongs to the date n days after `start`, and a
day with no value is null. A run merges its own days into the file by date:

- a day the run reports replaces the same day already stored, so a provider's
  revision of a past day reaches the history;
- a day the run does not report stays as it was, so a gap in a window never
  erases a reading;
- running again with the same data changes nothing.
"""

import datetime as dt
import json
import os
import tempfile
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict:
    """The file's object, or an empty one when it is absent or unreadable."""
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return payload if isinstance(payload, dict) else {}


def write_compact(path: Path, payload: dict) -> None:
    """Replace the file whole, so a failed write leaves the last complete one."""
    body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n"
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            handle.write(body)
        os.replace(temporary, path)
        os.chmod(path, 0o644)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def decode(entry: dict | None, columns: tuple[str, ...]) -> dict[str, dict[str, Any]]:
    """An entry's dense columns as {date: {column: value}}; empty for no entry."""
    if not entry or not entry.get("start"):
        return {}
    start = dt.date.fromisoformat(entry["start"])
    days = {}
    for index in range(len(entry[columns[0]])):
        days[(start + dt.timedelta(days=index)).isoformat()] = {
            column: entry[column][index] for column in columns}
    return days


def encode(days: dict[str, dict[str, Any]], columns: tuple[str, ...]) -> dict:
    """{date: {column: value}} as `start`, `end` and one dense column each."""
    if not days:
        raise ValueError("a history needs at least one day")
    first = dt.date.fromisoformat(min(days))
    last = dt.date.fromisoformat(max(days))
    count = (last - first).days + 1
    out: dict[str, Any] = {"start": first.isoformat(), "end": last.isoformat()}
    for column in columns:
        out[column] = [None] * count
    for day, row in days.items():
        index = (dt.date.fromisoformat(day) - first).days
        for column in columns:
            out[column][index] = row.get(column)
    return out


def merge(previous: dict[str, dict[str, Any]], reported: dict[str, dict[str, Any]],
          primary: str) -> dict[str, dict[str, Any]]:
    """`previous` with each reported day replaced; a day with no primary value is skipped."""
    merged = {day: dict(row) for day, row in previous.items()}
    for day, row in reported.items():
        if row.get(primary) is not None:
            merged[day] = dict(row)
    return merged


def check_dense(label: str, entry: dict, columns: tuple[str, ...]) -> None:
    """Refuse an entry whose columns do not span exactly start to end."""
    try:
        first = dt.date.fromisoformat(entry["start"])
        last = dt.date.fromisoformat(entry["end"])
    except (KeyError, ValueError, TypeError) as exc:
        raise ValueError(f"{label}: start and end must be dates ({exc})") from exc
    days = (last - first).days + 1
    if days < 1:
        raise ValueError(f"{label}: the end is before the start")
    for column in columns:
        values = entry.get(column)
        if not isinstance(values, list) or len(values) != days:
            raise ValueError(f"{label}: {column} must hold {days} values, one for each day")
