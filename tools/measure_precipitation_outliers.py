#!/usr/bin/env python3
"""Where precipitation has been highest, and where this water year is unusual.

Reads the committed `precipitation.json` (this water year, daily) and
`precipitation_history.json` (every water year from 1991, weekly) and reports:

* the stations and areas with the most precipitation since 1 October, and over
  the last 7 and 30 days;
* each station with a full history placed against its own past years on the
  same date: rank, percentile, percent of median, difference from median and a
  robust z-score;
* the outliers -- stations and areas in the lowest or highest tenth of years
  (NCEI's ranking classes, the map's own, ADR-170), records included, once
  the median for the date reaches `MEANINGFUL_NORMAL_INCHES`;
* readings worth a second look before anyone believes them (far outside every
  past year, or an accumulation that falls).

    python tools/measure_precipitation_outliers.py
    python tools/measure_precipitation_outliers.py --markdown report.md --csv stations.csv
    python tools/measure_precipitation_outliers.py --level state --top 15

It is a measurement: it writes nothing unless `--markdown`, `--csv` or `--json`
names a path, and never a committed file. The published card's rules are kept
where they apply (ADR-125): history curves are read on a straight line between
weekly steps, quantiles are type 7, a rank is one plus the years strictly above
to a tenth of an inch, an area is a mean over one fixed set of stations, and a
percent of median is printed only once the median reaches
`MEANINGFUL_NORMAL_INCHES`. The classes and the mid-rank percentile are the map's (ADR-170);
the robust z-score is this tool's own.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import sys
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRECIPITATION_PATH = ROOT / "precipitation.json"
HISTORY_PATH = ROOT / "precipitation_history.json"
SNOWPACK_PATH = ROOT / "snowpack.json"

#: The snow curve's floor for printing a ratio (src/snow-model.ts).
MEANINGFUL_NORMAL_INCHES = 1.0
#: Share of on-time stations that must report for a day to be the common date
#: (SET_SHARE in src/precip-model.ts).
SET_SHARE = 0.9
#: Lower and upper percentiles of the "usual" band: NCEI's "much below" and
#: "much above" deciles. Measured by holding out each past year at every
#: station: about a quarter of ordinary years fall outside, and the old
#: half-inch floor changed nothing after mid-October, so the floor is now the
#: median's own (`MEANINGFUL_NORMAL_INCHES`).
OUTLIER_LOW, OUTLIER_HIGH = 0.10, 0.90
#: A robust z-score this far out, beyond every past year, asks for a check.
SUSPECT_ROBUST_Z = 6.0
#: The fewest past years a station needs to be placed (the map's, ADR-170).
MIN_RECORD_YEARS = 10
#: The fewest stations behind an area figure (the snow reporting floor's spirit).
MIN_AREA_STATIONS = 3
#: A day-to-day drop larger than this is a falling gauge, not rounding noise.
FALLING_INCHES = 0.15
#: MAD to standard deviation for a normal distribution.
MAD_SCALE = 1.4826

LEVELS = ("huc6", "state")


def quantile(sorted_values: list[float], p: float) -> float:
    """Type 7: linear between neighbours in the sorted list."""
    if not sorted_values:
        raise ValueError("quantile of nothing")
    position = (len(sorted_values) - 1) * p
    below, above = math.floor(position), math.ceil(position)
    low, high = sorted_values[below], sorted_values[above]
    return low + (high - low) * (position - below)


def tenth(value: float) -> int:
    return int(round(value * 10))


def rank(value: float, past: list[float]) -> int:
    """One plus the years strictly above, compared to a tenth of an inch."""
    return 1 + sum(1 for year in past if tenth(year) > tenth(value))


def percentile(value: float, past: list[float]) -> float:
    """Mid-rank percentile, 0-100: years below plus half the ties, to a tenth."""
    below = sum(1 for year in past if tenth(year) < tenth(value))
    ties = sum(1 for year in past if tenth(year) == tenth(value))
    return 100.0 * (below + 0.5 * ties) / len(past)


def robust_z(value: float, past: list[float]) -> float | None:
    """Distance from the median in scaled median absolute deviations."""
    median = statistics.median(past)
    mad = statistics.median(abs(year - median) for year in past) * MAD_SCALE
    if mad < 0.05:
        return None
    return (value - median) / mad


def step_date(water_year: int, month_day: str) -> date:
    month, day = (int(part) for part in month_day.split("-"))
    return date(water_year - 1 if month >= 10 else water_year, month, day)


def decode(encoded: list[int]) -> list[float]:
    """First step, then each change, in tenths -> accumulated inches."""
    total, out = 0, []
    for change in encoded:
        total += change
        out.append(total / 10)
    return out


def value_on_day(curve: list[float], water_year: int, month_days: list[str],
                 target: date) -> float | None:
    """A year's weekly curve read on a straight line at the same calendar day."""
    month_day = target.strftime("%m-%d")
    if month_day == "02-29":
        month_day = "02-28"
    day = step_date(water_year, month_day)
    steps = [step_date(water_year, md) for md in month_days]
    for index, at in enumerate(steps):
        if at == day:
            return curve[index]
        if at > day:
            if index == 0:
                return None
            before = steps[index - 1]
            fraction = (day - before).days / (at - before).days
            return curve[index - 1] + (curve[index] - curve[index - 1]) * fraction
    return None


def water_year_of(day: date) -> int:
    return day.year + 1 if day.month >= 10 else day.year


@dataclass
class Standing:
    inches: float
    years: int
    median: float
    low10: float
    high90: float
    lowest: float
    highest: float
    rank: int
    percentile: float
    anomaly_inches: float
    percent_of_median: float | None
    robust_z: float | None
    category: str
    outlier: bool


def standing(value: float, past: list[float]) -> Standing:
    ordered = sorted(past)
    median = quantile(ordered, 0.5)
    low10, high90 = quantile(ordered, OUTLIER_LOW), quantile(ordered, OUTLIER_HIGH)
    anomaly = value - median
    pct = percentile(value, past)
    comparable = median >= MEANINGFUL_NORMAL_INCHES
    # NCEI's ranking classes (ADR-170), the map's own: deciles and terciles.
    if tenth(value) > tenth(ordered[-1]):
        category = "record high"
    elif tenth(value) < tenth(ordered[0]):
        category = "record low"
    elif pct < 10:
        category = "much below"
    elif pct < 100 / 3:
        category = "below"
    elif pct < 200 / 3:
        category = "near"
    elif pct < 90:
        category = "above"
    else:
        category = "much above"
    if not comparable:
        category = f"{category} (median under {MEANINGFUL_NORMAL_INCHES:g} in)"
    return Standing(
        inches=round(value, 2), years=len(past), median=round(median, 2),
        low10=round(low10, 2), high90=round(high90, 2),
        lowest=ordered[0], highest=ordered[-1],
        rank=rank(value, past), percentile=round(pct, 1),
        anomaly_inches=round(anomaly, 2),
        percent_of_median=(round(100 * value / median)
                           if median >= MEANINGFUL_NORMAL_INCHES else None),
        robust_z=(None if (z := robust_z(value, past)) is None else round(z, 2)),
        category=category,
        outlier=comparable and (pct < OUTLIER_LOW * 100 or pct >= OUTLIER_HIGH * 100
                                or category.startswith("record")),
    )


@dataclass
class StationRow:
    station: str
    name: str = ""
    state: str = ""
    huc6: str = ""
    huc6_name: str = ""
    elevation_feet: float | None = None
    late: bool = False
    record_years: int = 0
    since_oct1: float | None = None
    last7: float | None = None
    last30: float | None = None
    falling_days: int = 0
    standing: Standing | None = None
    flags: list[str] = field(default_factory=list)


def series_by_date(site: dict, dates: list[str]) -> dict[str, float]:
    return {dates[day]: value for day, value in
            zip(site["series_days"], site["series_values"]) if value is not None}


def common_day(sites: list[dict], dates: list[str]) -> str | None:
    """The newest day on which `SET_SHARE` of on-time stations have a value."""
    on_time = [series_by_date(site, dates) for site in sites if not site.get("late")]
    if not on_time:
        return None
    for day in reversed(dates):
        if sum(1 for values in on_time if day in values) >= SET_SHARE * len(on_time):
            return day
    return None


def window_total(values: dict[str, float], end: date, days: int) -> float | None:
    start = (end - timedelta(days=days)).isoformat()
    if end.isoformat() not in values or start not in values:
        return None
    total = values[end.isoformat()] - values[start]
    return None if total < 0 else round(total, 2)


def analyse(precipitation: dict, history: dict, metadata: dict[str, dict]
            ) -> tuple[str, list[StationRow], dict[str, list[dict]]]:
    dates = precipitation["series_dates"]
    day_text = common_day(precipitation["sites"], dates)
    if day_text is None:
        raise SystemExit("no day with enough stations reporting")
    day = date.fromisoformat(day_text)
    water_year = water_year_of(day)
    month_days = history["step_month_days"]
    first = history["first_water_year"]
    last = min(history["last_water_year"], water_year - 1)
    # Full records and, since ADR-170, shorter ones with null for a gap year.
    curves = {site["station"]: [None if year is None else decode(year) for year in site["years"]]
              for site in history["sites"] if site.get("years")}
    full = {site["station"] for site in history["sites"] if site.get("available")}

    rows: list[StationRow] = []
    past_by_station: dict[str, list[float]] = {}
    for site in precipitation["sites"]:
        meta = metadata.get(site["station"], {})
        row = StationRow(
            station=site["station"], name=meta.get("name", ""),
            state=meta.get("state", site["station"].split(":")[1]),
            huc6=meta.get("huc6", ""), huc6_name=meta.get("huc6_name", ""),
            elevation_feet=meta.get("elevation_feet"), late=bool(site.get("late")))
        values = series_by_date(site, dates)
        ordered = [values[d] for d in dates if d in values]
        row.falling_days = sum(1 for a, b in zip(ordered, ordered[1:]) if b < a - FALLING_INCHES)
        if row.falling_days:
            row.flags.append(f"accumulation falls on {row.falling_days} day(s)")
        if day_text in values:
            row.since_oct1 = values[day_text]
            row.last7 = window_total(values, day, 7)
            row.last30 = window_total(values, day, 30)
        station_curves = curves.get(site["station"])
        if station_curves and row.since_oct1 is not None and not row.late:
            past = []
            for offset, curve in enumerate(station_curves):
                year = first + offset
                if year > last:
                    break
                if curve is None:
                    continue
                value = value_on_day(curve, year, month_days, day)
                if value is not None:
                    past.append(value)
            row.record_years = len(past)
            if len(past) >= MIN_RECORD_YEARS:
                if row.station in full:
                    past_by_station[row.station] = past
                row.standing = standing(row.since_oct1, past)
                z = row.standing.robust_z
                if (row.standing.category in ("record high", "record low")
                        and z is not None and abs(z) >= SUSPECT_ROBUST_Z):
                    row.flags.append("far outside every past year: check the gauge")
        rows.append(row)

    areas: dict[str, list[dict]] = {}
    for level in LEVELS:
        groups: dict[str, list[StationRow]] = {}
        for row in rows:
            # Areas are a fixed set: full records only, so every year is the same stations.
            if row.station in past_by_station and getattr(row, level):
                groups.setdefault(getattr(row, level), []).append(row)
        out = []
        for key, members in groups.items():
            if len(members) < MIN_AREA_STATIONS:
                continue
            years = min(len(past_by_station[m.station]) for m in members)
            mean_now = statistics.fmean(m.since_oct1 for m in members)
            mean_past = [statistics.fmean(past_by_station[m.station][i] for m in members)
                         for i in range(years)]
            name = members[0].huc6_name if level == "huc6" else key
            out.append({"level": level, "area": key, "name": name,
                        "stations": len(members),
                        **asdict(standing(mean_now, mean_past))})
        areas[level] = out
    return day_text, rows, areas


def fmt(value, suffix="") -> str:
    return "—" if value is None else f"{value}{suffix}"


def markdown(day: str, rows: list[StationRow], areas: dict[str, list[dict]],
             top: int, level: str) -> str:
    lines = [f"# Precipitation highs and outliers, water year to {day}", ""]
    ranked = [r for r in rows if r.standing]
    lines.append(f"{len(rows)} stations; {len(ranked)} with {MIN_RECORD_YEARS} or more past years placed "
                 f"against their own record ('Years' is its length). Areas use only stations "
                 f"with the full record. "
                 f"on the same date. Outlier: lowest or highest tenth of years, once "
                 f"the median reaches {MEANINGFUL_NORMAL_INCHES:g} in.")
    lines.append("")

    def station_table(title: str, subset: list[StationRow], cols: list[str]) -> None:
        lines.extend([f"## {title}", ""])
        if not subset:
            lines.extend(["None.", ""])
            return
        header = ["Station", "Name", "State", "Basin"] + cols
        lines.append("| " + " | ".join(header) + " |")
        lines.append("|" + "---|" * len(header))
        for r in subset:
            s = r.standing
            cells = {
                "Since 1 Oct (in)": fmt(r.since_oct1), "Last 7 d": fmt(r.last7),
                "Last 30 d": fmt(r.last30),
                "Median (in)": fmt(s and s.median), "% of median": fmt(s and s.percent_of_median, "%"),
                "Diff (in)": fmt(s and s.anomaly_inches), "Pctile": fmt(s and s.percentile),
                "Rank": (f"{s.rank}/{s.years + 1}" if s else "—"),
                "Years": str(r.record_years or "—"),
                "Class": fmt(s and s.category), "Flags": "; ".join(r.flags) or "",
            }
            lines.append("| " + " | ".join([r.station, r.name, r.state, r.huc6_name]
                                           + [cells[c] for c in cols]) + " |")
        lines.append("")

    std = ["Since 1 Oct (in)", "Median (in)", "% of median", "Diff (in)", "Pctile", "Rank",
           "Years", "Class"]
    with_total = [r for r in rows if r.since_oct1 is not None]
    station_table(f"Most precipitation since 1 October (top {top})",
                  sorted(with_total, key=lambda r: -r.since_oct1)[:top], std)
    station_table(f"Most in the last 7 days (top {top})",
                  sorted([r for r in rows if r.last7 is not None], key=lambda r: -r.last7)[:top],
                  ["Last 7 d", "Since 1 Oct (in)", "Class"])
    station_table(f"Most in the last 30 days (top {top})",
                  sorted([r for r in rows if r.last30 is not None], key=lambda r: -r.last30)[:top],
                  ["Last 30 d", "Since 1 Oct (in)", "Class"])
    high = sorted([r for r in ranked if r.standing.outlier and r.standing.anomaly_inches > 0],
                  key=lambda r: (-r.standing.percentile, -r.standing.anomaly_inches))
    low = sorted([r for r in ranked if r.standing.outlier and r.standing.anomaly_inches < 0],
                  key=lambda r: (r.standing.percentile, r.standing.anomaly_inches))
    station_table(f"Unusually wet stations ({len(high)}; top {top})", high[:top], std)
    station_table(f"Unusually dry stations ({len(low)}; top {top})", low[:top], std)
    flagged = [r for r in rows if r.flags]
    station_table(f"Readings to check ({len(flagged)})", flagged[:top * 2],
                  ["Since 1 Oct (in)", "Class", "Flags"])

    level_rows = areas.get(level, [])
    lines.extend([f"## Areas by {level} (mean over stations with a full history, "
                  f"at least {MIN_AREA_STATIONS})", ""])
    header = ["Area", "Name", "Stations", "Mean since 1 Oct (in)", "Median (in)",
              "% of median", "Diff (in)", "Pctile", "Rank", "Class", "Outlier"]
    lines.append("| " + " | ".join(header) + " |")
    lines.append("|" + "---|" * len(header))
    for a in sorted(level_rows, key=lambda a: -a["percentile"]):
        lines.append("| " + " | ".join(str(x) for x in [
            a["area"], a["name"], a["stations"], a["inches"], a["median"],
            fmt(a["percent_of_median"], "%"), a["anomaly_inches"], a["percentile"],
            f"{a['rank']}/{a['years'] + 1}", a["category"], "yes" if a["outlier"] else ""]) + " |")
    lines.append("")
    return "\n".join(lines)


def flat_row(row: StationRow) -> dict:
    out = {k: v for k, v in asdict(row).items() if k not in ("standing", "flags")}
    out["flags"] = "; ".join(row.flags)
    for key, value in (asdict(row.standing) if row.standing else {}).items():
        out[key] = value
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--precipitation", type=Path, default=PRECIPITATION_PATH)
    parser.add_argument("--history", type=Path, default=HISTORY_PATH)
    parser.add_argument("--snowpack", type=Path, default=SNOWPACK_PATH,
                        help="station names, states and basins")
    parser.add_argument("--top", type=int, default=20)
    parser.add_argument("--level", choices=LEVELS, default="huc6")
    parser.add_argument("--markdown", type=Path, help="write the report here")
    parser.add_argument("--csv", type=Path, help="write one row per station here")
    parser.add_argument("--json", type=Path, help="write stations and areas here")
    args = parser.parse_args(argv)

    precipitation = json.loads(args.precipitation.read_text())
    history = json.loads(args.history.read_text())
    metadata = {}
    if args.snowpack.exists():
        metadata = {s["station"]: s for s in json.loads(args.snowpack.read_text())["sites"]}
    day, rows, areas = analyse(precipitation, history, metadata)
    report = markdown(day, rows, areas, args.top, args.level)
    if args.markdown:
        args.markdown.write_text(report)
    else:
        print(report)
    if args.csv:
        flat = [flat_row(r) for r in rows]
        keys = list(dict.fromkeys(k for r in flat for k in r))
        with args.csv.open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=keys)
            writer.writeheader()
            writer.writerows(flat)
    if args.json:
        args.json.write_text(json.dumps(
            {"date": day, "stations": [flat_row(r) for r in rows], "areas": areas}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
