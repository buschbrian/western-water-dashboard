"""Network-free checks for the precipitation refresh and its history builder (ADR-122)."""

import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))
from refresh_station_readings import build_payload  # noqa: E402
from build_precipitation_history import (  # noqa: E402
    build_site,
    encode,
    last_finished_water_year,
    step_date,
    step_month_days,
    year_steps,
)


def inventory(*stations):
    return {"site_count": len(stations),
            "sites": [{"station": station} for station in stations]}


def record(station, values, element="PREC"):
    return {"stationTriplet": station, "data": [{
        "stationElement": {"elementCode": element, "durationName": "DAILY",
                           "storedUnitCode": "in"},
        "values": [{"date": day, "value": value} for day, value in values],
    }]}


STAMP = datetime(2026, 10, 24, 15, 0, tzinfo=timezone.utc)


def test_daily_payload_writes_the_calendar_once_and_positions_per_station():
    payload = build_payload(
        inventory("1:UT:SNTL", "2:UT:SNTL"),
        [record("1:UT:SNTL", [("2026-10-01", 0.0), ("2026-10-03", 0.4)]),
         record("2:UT:SNTL", [("2026-10-02", 0.1), ("2026-10-03", None)])],
        date(2026, 10, 4), STAMP)
    assert payload["series_dates"] == ["2026-10-01", "2026-10-02", "2026-10-03"]
    one, two = payload["sites"]
    assert one["series_days"] == [0, 2] and one["series_values"] == [0.0, 0.4]
    assert two["series_days"] == [1] and two["latest_date"] == "2026-10-02"
    assert payload["water_year"] == 2027
    assert payload["missing_site_count"] == 0


def test_a_station_with_no_precipitation_counts_against_the_tolerance():
    stations = [f"{n}:UT:SNTL" for n in range(10)]
    records = [record(s, [("2026-10-01", 0.0)]) for s in stations[1:]]
    with pytest.raises(ValueError, match="missing 1 of 10"):
        build_payload(inventory(*stations), records, date(2026, 10, 2), STAMP)


def test_late_is_measured_from_the_newest_reading():
    payload = build_payload(
        inventory("1:UT:SNTL"), [record("1:UT:SNTL", [("2026-10-01", 0.2)])],
        date(2026, 10, 10), STAMP)
    assert payload["sites"][0]["late"] is True


def test_steps_are_calendar_days_so_a_leap_year_reads_1_march_as_1_march():
    days = step_month_days()
    assert days[0] == "10-01" and days[-1] == "09-30" and len(days) == 53
    assert "04-01" in days
    assert step_date(2024, "03-04") == date(2024, 3, 4)
    assert step_date(2024, "10-01") == date(2023, 10, 1)


def full_year(water_year, value_on=lambda day: 1.0):
    start = date(water_year - 1, 10, 1)
    return {(start + timedelta(days=k)).isoformat(): value_on(start + timedelta(days=k))
            for k in range(366)}


def test_a_missing_step_borrows_only_from_the_three_days_before():
    days = step_month_days()
    readings = full_year(2001)
    del readings["2000-10-08"]
    values, borrowed = year_steps(readings, 2001, days)
    assert values is not None and borrowed == 1
    for back in range(0, 4):
        readings.pop((date(2000, 10, 8) - timedelta(days=back)).isoformat(), None)
    values, _ = year_steps(readings, 2001, days)
    assert values is None


def test_a_falling_accumulation_is_kept_as_published():
    assert encode([0, 5, 3, 9]) == [0, 5, -2, 6]


def test_a_station_enters_the_fixed_set_only_with_every_year_complete():
    days = step_month_days()
    readings = {**full_year(1991), **full_year(1992)}
    complete = build_site("1:UT:SNTL", record("1:UT:SNTL", sorted(readings.items())),
                          range(1991, 1993), days)
    assert complete["available"] and len(complete["years"]) == 2
    gap = {**full_year(1992)}
    partial = build_site("1:UT:SNTL", record("1:UT:SNTL", sorted(gap.items())),
                         range(1991, 1993), days)
    assert not partial["available"] and partial["first_gap_water_year"] == 1991


def test_no_answer_is_retryable_and_named_as_such():
    site = build_site("1:UT:SNTL", None, range(1991, 1992), step_month_days())
    assert site == {"station": "1:UT:SNTL", "available": False,
                    "reason": "the provider did not answer"}


def test_the_window_ends_at_the_last_finished_water_year():
    assert last_finished_water_year(date(2026, 10, 1)) == 2026
    assert last_finished_water_year(date(2026, 9, 30)) == 2025
