"""Network-free checks for the precipitation highs-and-outliers measurement."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from measure_precipitation_outliers import (  # noqa: E402
    analyse, decode, percentile, quantile, rank, standing, value_on_day,
)

MONTH_DAYS = ["10-01", "10-08", "10-15", "10-22"]


def test_quantile_is_type_seven_and_rank_counts_years_strictly_above():
    assert quantile([1.0, 2.0, 3.0, 4.0], 0.5) == 2.5
    assert quantile([1.0, 2.0, 3.0, 4.0], 0.1) == 1.3
    assert rank(3.0, [1.0, 3.0, 4.0, 5.0]) == 3
    assert rank(3.04, [3.0, 3.0]) == 1  # equal to a tenth shares the top
    assert percentile(3.0, [1.0, 3.0, 4.0, 5.0]) == 37.5


def test_decode_and_straight_line_between_weekly_steps():
    curve = decode([0, 10, 20, 0])
    assert curve == [0.0, 1.0, 3.0, 3.0]
    from datetime import date
    assert value_on_day(curve, 2026, MONTH_DAYS, date(2025, 10, 8)) == 1.0
    assert value_on_day(curve, 2026, MONTH_DAYS, date(2025, 10, 11)) == 1.0 + 2.0 * 3 / 7
    assert value_on_day(curve, 2026, MONTH_DAYS, date(2025, 11, 1)) is None


def test_standing_classes_and_the_outlier_needs_a_real_difference():
    past = [float(v) for v in range(1, 21)]
    assert standing(25.0, past).category == "record high"
    assert standing(25.0, past).outlier
    assert standing(0.0, past).category == "record low"
    assert standing(10.5, past).category == "middle half"
    small = [0.2 + 0.01 * k for k in range(20)]  # a dry October: tiny spreads
    assert standing(0.6, small).category == "record high"
    assert not standing(0.6, small).outlier  # under half an inch from the median


def test_percent_of_median_waits_for_an_inch():
    assert standing(0.6, [0.1, 0.2, 0.3]).percent_of_median is None
    assert standing(3.0, [1.0, 2.0, 3.0]).percent_of_median == 150


def history(stations):
    return {"first_water_year": 2001, "last_water_year": 2010,
            "step_month_days": MONTH_DAYS,
            "sites": [{"station": s, "available": True, "years": years}
                      for s, years in stations.items()]}


def test_analysis_places_stations_and_areas_against_their_own_years():
    dates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
             "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"]
    wet = [0.0, 0.0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
    dry = [0.0, 0.0, 0.0, 0.1, 0.1, 0.1, 0.2, 0.2]
    usual = [0.0, 0.0, 0.2, 0.4, 0.6, 0.8, 0.9, 1.0]
    sites = [{"station": f"{n}:UT:SNTL", "late": False,
              "series_days": list(range(8)), "series_values": v}
             for n, v in ((1, wet), (2, dry), (3, usual))]
    years = {f"{n}:UT:SNTL": [[0, 10 + k, 0, 0] for k in range(10)] for n in (1, 2, 3)}
    meta = {f"{n}:UT:SNTL": {"state": "UT", "huc6": "160202", "huc6_name": "Jordan"}
            for n in (1, 2, 3)}
    day, rows, areas = analyse(
        {"series_dates": dates, "sites": sites}, history(years), meta)
    assert day == "2026-10-08"
    by = {r.station: r for r in rows}
    assert by["1:UT:SNTL"].standing.category == "record high"
    assert by["1:UT:SNTL"].standing.outlier
    assert by["2:UT:SNTL"].standing.category == "record low"
    assert by["2:UT:SNTL"].standing.outlier
    assert by["3:UT:SNTL"].standing.category == "below 10th"
    assert not by["3:UT:SNTL"].standing.outlier  # under half an inch from the median
    assert by["1:UT:SNTL"].last7 == 6.0
    (jordan,) = areas["huc6"]
    assert jordan["stations"] == 3 and jordan["category"] == "record high"


def test_a_falling_accumulation_is_flagged_not_repaired():
    dates = ["2026-10-01", "2026-10-02", "2026-10-03"]
    site = {"station": "9:UT:SNTL", "late": False, "series_days": [0, 1, 2],
            "series_values": [1.0, 0.5, 0.6]}
    _, rows, _ = analyse({"series_dates": dates, "sites": [site]},
                         history({}), {})
    assert rows[0].since_oct1 == 0.6
    assert rows[0].flags == ["accumulation falls on 1 day(s)"]
