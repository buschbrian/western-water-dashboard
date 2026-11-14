"""Soil moisture compared with the station's own past years (ADR-169).

A volumetric percent is not comparable between two soils (ADR-142), but a
reading is comparable with the same sensors on the same calendar day in
earlier years. `soil_normals.json` keeps, for each station with the standard
sensors and each calendar day, the 10th, 25th, 50th, 75th and 90th percentile
of the station value (ADR-142's R4 value, frozen readings dropped) over the
years that have one, and the number of those years. The daily refresh reads
it and puts the end day's value into one of five classes, the rule the river
map uses for flow (ADR-144).

The method is the river normals' on purpose, so one rule reads on two maps:

- **One value per year.** The station value on that calendar day, in each
  year before the build year. No window of neighbouring days: the reading it
  is compared with is one day's value, and a window mean is smoother than any
  one day, which would push a day into the outer classes too often.
- **Weibull plotting position**, the U.S. Geological Survey's, with linear
  interpolation between order statistics. A percentile whose rank falls
  outside the sample is missing, not clamped.
- **More than 10 years** (`MIN_YEARS`, Brian's river floor, ADR-145), or the
  day is not compared.
- **February 29** reads February 28's percentiles. Its own day would have one
  year in four and never pass the floor.

Position n of a station's `days` is calendar day n of a 365-day year
(January 1 is 0, February 28 is 58, March 1 is 59). It is a position in a
fixed calendar, not a day-of-year count, so a leap year cannot shift March.
"""

from __future__ import annotations

import json
import math
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOIL_NORMALS_PATH = ROOT / "soil_normals.json"
SOIL_NORMALS_SCHEMA_VERSION = 1
#: The estimator behind the percentiles. A change to how a percentile is
#: computed moves this; `load` refuses a file built by another version.
SOIL_NORMALS_METHOD_VERSION = 1
PERCENTILES = (10, 25, 50, 75, 90)
BAND_KEYS = tuple(f"p{p}" for p in PERCENTILES)
#: Fewer years than this on a calendar day and the day is not compared.
MIN_YEARS = 11
CALENDAR_DAYS = 365
#: The five classes, driest first. The river classes' rule (ADR-144) with
#: words for soil.
CLASSES = ("much_drier", "drier", "normal", "wetter", "much_wetter")
NORMAL_INDEX = CLASSES.index("normal")

_MONTH_STARTS = (0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334)


def calendar_position(day: str | date) -> int:
    """Position of a date in the fixed 365-day calendar; February 29 is February 28."""
    if isinstance(day, str):
        day = date.fromisoformat(day[:10])
    if day.month == 2 and day.day == 29:
        return 58
    return _MONTH_STARTS[day.month - 1] + day.day - 1


def weibull_percentile(values: list[float], percentile: float) -> float | None:
    """The p-th percentile by the Weibull plotting position, or None outside the sample."""
    ordered = sorted(values)
    rank = percentile / 100 * (len(ordered) + 1)
    if rank < 1 or rank > len(ordered):
        return None
    low = math.floor(rank)
    fraction = rank - low
    value = ordered[low - 1]
    if fraction and low < len(ordered):
        value += fraction * (ordered[low] - value)
    return value


def _tenth(value: float) -> float:
    return math.floor(value * 10 + 0.5) / 10 + 0.0


def station_days(values_by_date: dict[str, float], before_year: int) -> list[list]:
    """A station's 365 calendar days: `[years, p10, p25, p50, p75, p90]`, or `[years]`.

    `values_by_date` holds the station value (R4, frozen dropped) by ISO date.
    Only years before `before_year` are used, so the year being compared is
    never in its own sample. February 29 is left out.
    """
    by_position: list[list[float]] = [[] for _ in range(CALENDAR_DAYS)]
    for day, value in values_by_date.items():
        moment = date.fromisoformat(day)
        if moment.year >= before_year or (moment.month == 2 and moment.day == 29):
            continue
        by_position[calendar_position(moment)].append(value)
    days = []
    for values in by_position:
        if len(values) < MIN_YEARS:
            days.append([len(values)])
            continue
        band = [weibull_percentile(values, p) for p in PERCENTILES]
        days.append([len(values), *[None if v is None else _tenth(v) for v in band]])
    return days


def band_for(entry: dict, day: str) -> dict | None:
    """The day's percentiles for a station entry, or None when the day is not compared."""
    row = entry["days"][calendar_position(day)]
    if len(row) == 1 or row[0] < MIN_YEARS or any(v is None for v in row[1:]):
        return None
    return {"years": row[0], **dict(zip(BAND_KEYS, row[1:]))}


def classify(percent: float, band: dict) -> str:
    """Where a value falls among the day's percentiles.

    Under the 10th is much drier, under the 25th drier, the 25th to the 75th
    normal, up to the 90th wetter, over it much wetter. A value on a boundary
    takes the class nearer normal, on both sides alike (the river rule).
    """
    if percent < band["p10"]:
        return "much_drier"
    if percent < band["p25"]:
        return "drier"
    if percent <= band["p75"]:
        return "normal"
    if percent <= band["p90"]:
        return "wetter"
    return "much_wetter"


def area_class(classes: list[str], floor: int) -> str | None:
    """The median of the stations' classes, or None below the floor.

    The classes are ordered, so their median is defined. With an even count
    and two different middle classes, the one nearer normal is taken: the
    boundary rule `classify` uses.
    """
    if len(classes) < floor:
        return None
    ordered = sorted(CLASSES.index(name) for name in classes)
    middle = len(ordered) // 2
    if len(ordered) % 2:
        return CLASSES[ordered[middle]]
    low, high = ordered[middle - 1], ordered[middle]
    pick = low if abs(low - NORMAL_INDEX) <= abs(high - NORMAL_INDEX) else high
    return CLASSES[pick]


def validate(document: dict) -> None:
    if document.get("schema_version") != SOIL_NORMALS_SCHEMA_VERSION:
        raise ValueError(f"soil normals schema {document.get('schema_version')} is not "
                         f"{SOIL_NORMALS_SCHEMA_VERSION}")
    if document.get("method_version") != SOIL_NORMALS_METHOD_VERSION:
        raise ValueError(f"soil normals were built by method {document.get('method_version')}, "
                         f"not {SOIL_NORMALS_METHOD_VERSION}; rebuild them")
    if tuple(document.get("percentiles") or ()) != PERCENTILES or document.get("min_years") != MIN_YEARS:
        raise ValueError("soil normals percentiles or year floor differ from this code")
    stations = document.get("stations")
    if not isinstance(stations, dict):
        raise ValueError("soil normals have no stations")
    for station, entry in stations.items():
        days = entry.get("days")
        if not isinstance(days, list) or len(days) != CALENDAR_DAYS:
            raise ValueError(f"{station}: soil normals need {CALENDAR_DAYS} calendar days")
        for position, row in enumerate(days):
            if not isinstance(row, list) or len(row) not in (1, len(PERCENTILES) + 1) \
                    or not isinstance(row[0], int) or row[0] < 0:
                raise ValueError(f"{station}: calendar day {position} is malformed")
            if len(row) == 1:
                if row[0] >= MIN_YEARS:
                    raise ValueError(f"{station}: calendar day {position} has {row[0]} years "
                                     "and no percentiles")
                continue
            band = [v for v in row[1:] if v is not None]
            if row[0] < MIN_YEARS or band != sorted(band) \
                    or any(not 0 <= v <= 100 for v in band):
                raise ValueError(f"{station}: calendar day {position} percentiles are not "
                                 "ordered percents over enough years")


def load(path: Path = SOIL_NORMALS_PATH) -> dict | None:
    """The committed normals, or None when no file has been built yet."""
    if not path.exists():
        return None
    document = json.loads(path.read_text(encoding="utf-8"))
    validate(document)
    return document


def render(document: dict) -> str:
    """One station per line block, each calendar day compact, so a diff reads by station."""
    lines = ["{"]
    header = {key: value for key, value in document.items() if key != "stations"}
    for key, value in header.items():
        lines.append(f" {json.dumps(key)}: {json.dumps(value)},")
    lines.append(' "stations": {')
    stations = sorted(document["stations"].items())
    for index, (station, entry) in enumerate(stations):
        fields = {key: value for key, value in entry.items() if key != "days"}
        lines.append(f"  {json.dumps(station)}: {{")
        for key, value in fields.items():
            lines.append(f"   {json.dumps(key)}: {json.dumps(value)},")
        lines.append('   "days": ' + json.dumps(entry["days"], separators=(",", ":")))
        lines.append("  }" + ("," if index + 1 < len(stations) else ""))
    lines.append(" }")
    lines.append("}")
    return "\n".join(lines) + "\n"
