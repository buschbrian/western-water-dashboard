"""The soil-moisture percentiles by calendar day (ADR-169)."""

import sys
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import soil_normals as sn  # noqa: E402


def test_the_calendar_is_fixed_and_february_29_reads_february_28():
    assert sn.calendar_position("2025-01-01") == 0
    assert sn.calendar_position("2025-02-28") == 58
    assert sn.calendar_position("2024-02-29") == 58
    assert sn.calendar_position("2024-03-01") == sn.calendar_position("2025-03-01") == 59
    assert sn.calendar_position("2024-12-31") == sn.calendar_position("2025-12-31") == 364


def test_weibull_percentiles_interpolate_and_refuse_outside_the_sample():
    values = list(range(1, 12))  # 11 values: rank p/100 * 12
    assert sn.weibull_percentile(values, 50) == 6
    assert sn.weibull_percentile(values, 25) == 3
    assert sn.weibull_percentile(values, 10) == pytest.approx(1.2)
    assert sn.weibull_percentile(values, 90) == pytest.approx(10.8)
    assert sn.weibull_percentile([1, 2, 3], 10) is None


def test_one_value_per_year_the_build_year_left_out_and_the_floor_held():
    values = {f"{year}-05-01": float(year - 2000) for year in range(2010, 2027)}
    days = sn.station_days(values, before_year=2026)
    row = days[sn.calendar_position("2025-05-01")]
    assert row[0] == 16  # 2010..2025; 2026 is not in its own sample
    assert row[3] == pytest.approx(17.5)  # the median of 10..25
    assert days[0] == [0]
    few = sn.station_days({f"{y}-05-01": 1.0 for y in range(2015, 2025)}, before_year=2026)
    assert few[sn.calendar_position("2025-05-01")] == [10]


def test_leap_days_are_left_out_of_the_sample():
    values = {f"{year}-02-29": 50.0 for year in (2000, 2004, 2008, 2012, 2016, 2020, 2024)}
    days = sn.station_days(values, before_year=2026)
    assert days[58] == [0]


def test_classes_follow_the_river_boundary_rule():
    band = {"p10": 10.0, "p33": 20.0, "p50": 25.0, "p67": 30.0, "p90": 40.0}
    assert sn.classify(9.9, band) == "much_drier"
    assert sn.classify(10.0, band) == "drier"
    assert sn.classify(20.0, band) == "normal"
    assert sn.classify(30.0, band) == "normal"
    assert sn.classify(40.0, band) == "wetter"
    assert sn.classify(40.1, band) == "much_wetter"


def test_an_area_median_takes_the_class_nearer_normal_on_a_tie_and_holds_the_floor():
    assert sn.area_class(["drier"], 2) is None
    assert sn.area_class(["much_drier", "drier", "normal"], 2) == "drier"
    assert sn.area_class(["much_drier", "normal"], 2) == "normal"
    assert sn.area_class(["drier", "much_drier"], 2) == "drier"
    assert sn.area_class(["wetter", "much_wetter"], 2) == "wetter"


def test_validate_refuses_another_method_and_short_days_with_percentiles():
    good = {"schema_version": 1, "method_version": sn.SOIL_NORMALS_METHOD_VERSION,
            "percentiles": list(sn.BAND_KEYS), "min_years": sn.MIN_YEARS,
            "stations": {"1:UT:SNTL": {"days": [[12, 1.0, 2.0, 3.0, 4.0, 5.0]] * 365}}}
    sn.validate(good)
    with pytest.raises(ValueError, match="method"):
        sn.validate({**good, "method_version": 99})
    with pytest.raises(ValueError):
        sn.validate({**good, "stations": {"1:UT:SNTL": {"days": [[5, 1.0, 2.0, 3.0, 4.0, 5.0]] * 365}}})
    with pytest.raises(ValueError):
        sn.validate({**good, "stations": {"1:UT:SNTL": {"days": [[12, 5.0, 2.0, 3.0, 4.0, 5.0]] * 365}}})


def test_render_round_trips():
    import json
    document = {"schema_version": 1, "stations": {"b": {"x": 1, "days": [[0]]}, "a": {"days": [[1]]}}}
    assert json.loads(sn.render(document)) == {"schema_version": 1, "stations": {"a": {"days": [[1]]}, "b": {"x": 1, "days": [[0]]}}}


def test_the_builder_takes_the_refresh_station_value():
    sys.path.insert(0, str(ROOT / "tools"))
    import build_soil_normals as builder
    data = []
    for depth, value in ((-2, 20.0), (-8, 15.0), (-20, 10.0)):
        data.append({"stationElement": {"elementCode": "SMS", "heightDepth": depth, "durationName": "DAILY",
                                        "storedUnitCode": "pct"},
                     "values": [{"date": "2020-06-01", "value": value}, {"date": "2020-06-02", "value": value}]})
        data.append({"stationElement": {"elementCode": "STO", "heightDepth": depth, "durationName": "DAILY",
                                        "storedUnitCode": "degF"},
                     "values": [{"date": "2020-06-01", "value": 50}, {"date": "2020-06-02", "value": 30}]})
    values = builder.station_values({"stationTriplet": "1:UT:SNTL", "data": data}, (-2, -8, -20),
                                    date(2020, 6, 1), date(2020, 6, 3))
    assert values == {"2020-06-01": 15.0}  # frozen on 06-02, nothing on 06-03
