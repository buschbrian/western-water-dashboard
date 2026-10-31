"""Network-free checks for the soil-moisture refresh (ADR-142)."""

import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from refresh_soil_moisture import (  # noqa: E402
    build_payload,
    fetch_soil,
    round_tenth,
    sensor_depths,
    standard_depths,
)

AS_OF = date(2026, 10, 27)
STAMP = datetime(2026, 10, 27, 15, 0, tzinfo=timezone.utc)
DAYS = [(AS_OF - timedelta(days=14 - k)).isoformat() for k in range(15)]
END, START = "2026-10-26", "2026-10-19"


def inventory(*stations, huc6="160202"):
    return {"sites": [{"station": station, "huc6": huc6, "huc6_name": "Jordan"}
                      for station in stations]}


def series(code, depth, values, unit=None):
    return {"stationElement": {"elementCode": code, "heightDepth": depth, "durationName": "DAILY",
                               "storedUnitCode": unit or ("pct" if code == "SMS" else "degF")},
            "values": [{"date": day, "value": value} for day, value in values.items()]}


def record(station, moisture, temperature=None, depths=(-2, -8, -20)):
    """`moisture` maps depth to {date: percent}; temperature defaults to 50 F every day."""
    data = []
    for depth in depths:
        data.append(series("SMS", depth, moisture.get(depth, {})))
        temps = (temperature or {}).get(depth, {day: 50 for day in DAYS})
        data.append(series("STO", depth, temps))
    return {"stationTriplet": station, "data": data}


def steady(value, **changes):
    """A depth series at `value` every day until yesterday, with some days replaced."""
    out = {day: value for day in DAYS[:-1]}
    out.update(changes)
    return out


def build(stations, records, depths=None, huc6="160202"):
    depths = depths or {station: [-2, -8, -20] for station in stations}
    return build_payload(inventory(*stations, huc6=huc6), depths, records, AS_OF, STAMP)


def test_the_station_value_is_the_mean_of_the_three_depths_and_the_change_is_seven_days():
    payload = build(["1:UT:SNTL"], [record("1:UT:SNTL", {
        -2: steady(20.0, **{END: 30.0}), -8: steady(15.0, **{END: 18.0}), -20: steady(10.0)})])
    site = payload["sites"][0]
    assert payload["end_date"] == END and payload["start_date"] == START
    assert site["start_percent"] == 15.0
    assert site["end_percent"] == round_tenth((30 + 18 + 10) / 3)
    assert site["change_points"] == round_tenth(site["end_percent"] - 15.0)
    assert site["no_change_reason"] is None
    assert site["depths_inches"] == [2, 8, 20]


def test_four_inches_stands_in_for_two_and_a_missing_standard_depth_means_no_station():
    assert standard_depths([-4, -8, -20, -40]) == (-4, -8, -20)
    assert standard_depths([-2, -4, -8, -20]) == (-2, -8, -20)
    assert standard_depths([-2, -8, -40]) is None
    assert standard_depths([-4, -20]) is None
    payload = build(["1:MT:SNTL", "2:WA:SNTL"], [
        record("1:MT:SNTL", {-4: steady(20.0), -8: steady(20.0), -20: steady(20.0)}, depths=(-4, -8, -20))],
        depths={"1:MT:SNTL": [-4, -8, -20, -40], "2:WA:SNTL": [-2, -8, -16]})
    assert [site["station"] for site in payload["sites"]] == ["1:MT:SNTL"]
    assert payload["sites"][0]["depths_inches"] == [4, 8, 20]
    assert payload["other_depth_sites"] == [{"station": "2:WA:SNTL", "depths_inches": [2, 8, 16]}]


def test_a_depth_missing_on_either_day_leaves_the_station_without_a_change():
    deep = steady(10.0)
    del deep[START]
    payload = build(["1:UT:SNTL"], [record("1:UT:SNTL", {-2: steady(20.0), -8: steady(15.0), -20: deep})])
    site = payload["sites"][0]
    assert site["change_points"] is None and site["start_percent"] is None
    assert site["no_change_reason"] == "missing_reading"


def test_a_frozen_depth_is_not_used_and_the_reason_is_said():
    temps = {depth: {day: 50 for day in DAYS} for depth in (-2, -8, -20)}
    temps[-2][END] = 32
    payload = build(["1:UT:SNTL"], [record("1:UT:SNTL",
                                           {-2: steady(20.0), -8: steady(15.0), -20: steady(10.0)}, temps)])
    site = payload["sites"][0]
    end_index = DAYS.index(END)
    assert site["readings"][0][end_index] is None
    assert site["readings"][1][end_index] == 15.0
    assert site["frozen_days"] == [end_index]
    assert site["change_points"] is None and site["no_change_reason"] == "frozen"
    assert payload["frozen_site_count"] == 1


def test_a_reading_with_no_soil_temperature_is_not_used():
    temps = {depth: {day: 50 for day in DAYS} for depth in (-2, -8, -20)}
    del temps[-20][START]
    payload = build(["1:UT:SNTL"], [record("1:UT:SNTL",
                                           {-2: steady(20.0), -8: steady(15.0), -20: steady(10.0)}, temps)])
    assert payload["sites"][0]["no_change_reason"] == "no_temperature"


def test_an_area_needs_the_snow_floor_of_stations_with_a_change():
    one = build(["1:UT:SNTL"], [record("1:UT:SNTL", {-2: steady(20.0), -8: steady(15.0), -20: steady(10.0)})])
    assert one["minimum_reporting_sites"] == 2
    assert one["rollups"] == [{"huc6": "160202", "huc6_name": "Jordan", "site_count": 1,
                               "measured_site_count": 1, "minimum_reporting_sites": 2,
                               "mean_change_points": None}]
    two = build(["1:UT:SNTL", "2:UT:SNTL"], [
        record("1:UT:SNTL", {-2: steady(20.0, **{END: 26.0}), -8: steady(20.0), -20: steady(20.0)}),
        record("2:UT:SNTL", {-2: steady(20.0), -8: steady(20.0), -20: steady(20.0, **{END: 17.0})})])
    changes = [site["change_points"] for site in two["sites"]]
    assert changes == [2.0, -1.0]
    assert two["rollups"][0]["mean_change_points"] == 0.5


def test_one_end_day_for_every_station_set_by_the_on_time_stations():
    """Today's readings are not in yet at most stations, and one station
    stops a day earlier: the week ends on the day nine in ten have."""
    stations = [f"{n}:UT:SNTL" for n in range(10)]
    full = {-2: steady(20.0), -8: steady(15.0), -20: steady(10.0)}
    shy = {depth: {day: value for day, value in values.items() if day < END}
           for depth, values in full.items()}
    records = [record(station, shy if index == 0 else full) for index, station in enumerate(stations)]
    payload = build(stations, records)
    assert payload["end_date"] == END
    late = payload["sites"][0]
    assert late["change_points"] is None and late["no_change_reason"] == "missing_reading"


def test_a_late_station_is_measured_from_its_newest_full_day():
    old = {depth: {day: 20.0 for day in DAYS[:5]} for depth in (-2, -8, -20)}
    payload = build(["1:UT:SNTL"], [record("1:UT:SNTL", old)])
    assert payload["sites"][0]["latest_date"] == DAYS[4]
    assert payload["sites"][0]["late"] is True


def test_silent_stations_count_against_the_tolerance():
    stations = [f"{n}:UT:SNTL" for n in range(10)]
    full = {-2: steady(20.0), -8: steady(15.0), -20: steady(10.0)}
    payload = build(stations, [record(station, full) for station in stations[1:]])
    assert payload["missing_site_count"] == 1
    with pytest.raises(ValueError, match="missing 2 of 10"):
        build(stations, [record(station, full) for station in stations[2:]])


def test_an_unexpected_unit_refuses_the_file():
    bad = record("1:UT:SNTL", {-2: steady(20.0), -8: steady(15.0), -20: steady(10.0)})
    bad["data"][0]["stationElement"]["storedUnitCode"] = "in"
    with pytest.raises(ValueError, match="unexpected unit"):
        build(["1:UT:SNTL"], [bad])


def test_rounding_is_half_up_like_the_page():
    assert round_tenth(0.25) == 0.3
    assert round_tenth(-0.25) == -0.2


def test_only_active_first_sensors_count_as_depths():
    station = {"stationElements": [
        {"elementCode": "SMS", "durationName": "DAILY", "ordinal": 1, "heightDepth": -2, "endDate": "2100-01-01 00:00"},
        {"elementCode": "SMS", "durationName": "DAILY", "ordinal": 2, "heightDepth": -8, "endDate": "2100-01-01 00:00"},
        {"elementCode": "SMS", "durationName": "DAILY", "ordinal": 1, "heightDepth": -20, "endDate": "2019-05-01 00:00"},
        {"elementCode": "SMS", "durationName": "HOURLY", "ordinal": 1, "heightDepth": -40, "endDate": "2100-01-01 00:00"},
    ]}
    assert sensor_depths(station, AS_OF) == [-2]


def test_a_short_batch_is_retried_one_station_at_a_time():
    calls = []

    def request(session, ids, begin, end):
        calls.append(list(ids))
        return [{"stationTriplet": station, "data": []} for station in ids if len(ids) == 1 or station != "2:UT:SNTL"]

    records = fetch_soil(None, ["1:UT:SNTL", "2:UT:SNTL"], AS_OF, AS_OF, request=request)
    assert [row["stationTriplet"] for row in records] == ["1:UT:SNTL", "2:UT:SNTL"]
    assert calls == [["1:UT:SNTL", "2:UT:SNTL"], ["2:UT:SNTL"]]


def test_the_daily_script_runs_soil_after_precipitation_and_keeps_the_last_file():
    script = (ROOT / "scripts" / "refresh-daily.sh").read_text(encoding="utf-8")
    assert script.index("refresh_station_readings.py") < script.index("refresh_soil_moisture.py") \
        < script.index("git commit")
    assert 'if ! "$python_bin" refresh_soil_moisture.py; then' in script
    plan = subprocess.run(["bash", str(ROOT / "scripts" / "refresh-daily.sh"), "--dry-run"],
                          cwd=ROOT, capture_output=True, text=True, check=True).stdout
    assert "refresh_soil_moisture.py" in plan and "soil_moisture.json" in plan
