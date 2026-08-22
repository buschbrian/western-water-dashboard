"""Network-free checks for the independent snow-data refresh."""

import sys
from datetime import date, datetime, timezone
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from refresh_snowpack import (  # noqa: E402
    build_payload,
    build_rollups,
    fetch_all,
    normalize_site,
    water_year_start,
)


def site(station="1:UT:SNTL", huc6="160202", name="Test Site"):
    return {
        "station": station,
        "name": name,
        "state": "UT",
        "county": "Test",
        "lat": 40.0,
        "lon": -111.0,
        "elevation_feet": 8000,
        "begins": "2000-10-01",
        "huc6": huc6,
        "huc6_name": f"Area {huc6}",
        "provider_huc6": huc6,
    }


def record(station="1:UT:SNTL", values=None):
    return {
        "stationTriplet": station,
        "data": [{
            "stationElement": {
                "elementCode": "WTEQ",
                "durationName": "DAILY",
                "storedUnitCode": "in",
            },
            "timingCentralTendencies": {
                "medianPeak": {"month": 4, "day": 1, "value": 12.0},
            },
            "values": values or [
                {"date": "2026-03-01", "value": 6.0, "median": 8.0,
                 "qcFlag": "V", "qaFlag": "P"},
            ],
        }],
    }


def test_short_batch_is_retried_by_station_and_must_be_complete():
    calls = []

    def request(_session, station_ids, _begin, _end):
        calls.append(station_ids)
        if len(station_ids) > 1:
            return [record(station_ids[0])]
        return [record(station_ids[0])]

    rows = fetch_all(None, ["1:UT:SNTL", "2:UT:SNTL"],
                     date(2025, 10, 1), date(2026, 3, 1), request=request)
    assert [row["stationTriplet"] for row in rows] == ["1:UT:SNTL", "2:UT:SNTL"]
    assert calls == [["1:UT:SNTL", "2:UT:SNTL"], ["2:UT:SNTL"]]


def test_missing_station_after_individual_retry_is_an_error():
    """Half the network silent is a broken service, not weather."""
    def request(_session, station_ids, _begin, _end):
        return [record(station_ids[0])] if len(station_ids) > 1 else []

    with pytest.raises(RuntimeError, match="omitted 1 of 2"):
        fetch_all(None, ["1:UT:SNTL", "2:UT:SNTL"],
                  date(2025, 10, 1), date(2026, 3, 1), request=request)


def test_a_few_quiet_stations_do_not_throw_away_the_others():
    """The day is published without them, and they are named.

    These are solar-powered radios in the mountains in winter. Requiring all
    of them to answer means publishing nothing on the days that matter most,
    which is a worse answer than publishing the ones that did.
    """
    stations = [f"{number}:UT:SNTL" for number in range(100)]
    quiet = stations[7]

    def request(_session, station_ids, _begin, _end):
        return [record(station) for station in station_ids if station != quiet]

    received = fetch_all(None, stations, date(2025, 10, 1), date(2026, 3, 1),
                         request=request)
    assert len(received) == len(stations) - 1
    assert quiet not in {row["stationTriplet"] for row in received}


def test_too_many_quiet_stations_is_still_an_error():
    """Past the tolerance the service is wrong, not the weather."""
    stations = [f"{number}:UT:SNTL" for number in range(100)]
    quiet = set(stations[:5])

    def request(_session, station_ids, _begin, _end):
        return [record(station) for station in station_ids if station not in quiet]

    with pytest.raises(RuntimeError, match="omitted 5 of 100"):
        fetch_all(None, stations, date(2025, 10, 1), date(2026, 3, 1),
                  request=request)


def test_zero_median_is_not_divided_and_late_data_is_retained():
    normalized = normalize_site(site(), record(values=[
        {"date": "2026-03-01", "value": 6.0, "median": 8.0},
        {"date": "2026-03-02", "value": 0.0, "median": 0.0},
    ]), date(2026, 3, 6))
    assert normalized["series"][0]["percent_of_normal_median"] == 75.0
    assert normalized["series"][1]["percent_of_normal_median"] is None
    assert normalized["latest_date"] == "2026-03-02"
    assert normalized["late"] is True


def test_rollup_divides_summed_water_by_summed_normals_once():
    """Ratio of sums, not a mean of ratios.

    A site with a 0.1-inch median reading 0.4 inches is 400% on its own, but
    it carries one small vote's worth of water; a site with a 40-inch median
    reading 20 inches is 50% and carries forty times the water. Summing both
    sides once answers 50.2%, where the mean of the two ratios answered 225%.
    """
    sites = []
    for number, (value, median) in enumerate(((0.4, 0.1), (20.0, 40.0)), start=1):
        row = site(f"{number}:UT:SNTL")
        row["series"] = [{"date": "2026-03-01",
                          "value_inches": value,
                          "normal_median_inches": median}]
        sites.append(row)
    rollup = build_rollups(sites, {"160202": "Jordan"})[0]
    assert rollup["series"] == [{
        "date": "2026-03-01",
        "reporting_site_count": 2,
        "mean_percent_of_normal_median": round(20.4 / 40.1 * 100, 1),
    }]


def test_a_site_with_real_snow_where_none_is_normal_joins_the_numerator():
    """The per-site median > 0 guard goes away with the single division.

    A site holding 0.3 inches of snow where none is normal contributes real
    water to the sum; excluding it biased the numerator downward.
    """
    rows = [{"date": "2025-10-20", "value_inches": 0.3,
             "normal_median_inches": 0.0},
            {"date": "2025-10-20", "value_inches": 2.0,
             "normal_median_inches": 4.0}]
    sites = []
    for number, row in enumerate(rows, start=1):
        entry = site(f"{number}:UT:SNTL")
        entry["series"] = [row]
        sites.append(entry)
    rollup = build_rollups(sites, {"160202": "Jordan"})[0]
    assert rollup["series"][0]["reporting_site_count"] == 2
    assert rollup["series"][0]["mean_percent_of_normal_median"] == \
        round(2.3 / 4.0 * 100, 1)


def test_rollup_publishes_none_without_a_meaningful_denominator():
    """The reporting floor and a positive summed normal are both required."""
    row = site("1:UT:SNTL")
    row["series"] = [{"date": "2026-03-01",
                      "value_inches": 1.0, "normal_median_inches": 8.0}]
    rollup = build_rollups([row], {"160202": "Jordan"})[0]
    assert rollup["series"][0]["reporting_site_count"] == 1
    assert rollup["series"][0]["mean_percent_of_normal_median"] is None

    below_floor, zero_normal = site("1:UT:SNTL"), site("2:UT:SNTL")
    below_floor["series"] = [{"date": "2026-03-01",
                              "value_inches": 1.0, "normal_median_inches": 0.0}]
    zero_normal["series"] = [{"date": "2026-03-01",
                              "value_inches": 0.0, "normal_median_inches": 0.0}]
    rollup = build_rollups([below_floor, zero_normal], {"160202": "Jordan"})[0]
    assert rollup["series"][0]["reporting_site_count"] == 2
    assert rollup["series"][0]["mean_percent_of_normal_median"] is None


def test_site_day_without_both_a_value_and_a_median_does_not_contribute():
    """A missing value or a missing median keeps the whole day out of both
    sums, so the count and the ratio describe one set of stations."""
    sites = []
    rows = [
        {"date": "2026-03-01", "value_inches": None,
         "normal_median_inches": 8.0},
        {"date": "2026-03-01", "value_inches": 4.0,
         "normal_median_inches": None},
    ]
    for number, row in enumerate(rows, start=1):
        entry = site(f"{number}:UT:SNTL")
        entry["series"] = [row]
        sites.append(entry)
    complete = site("3:UT:SNTL")
    complete["series"] = [{"date": "2026-03-01",
                           "value_inches": 4.0, "normal_median_inches": 8.0}]
    sites.append(complete)
    rollup = build_rollups(sites, {"160202": "Jordan"})[0]
    assert rollup["series"][0]["reporting_site_count"] == 1
    # One contributing site is below the reporting floor, so the day stays
    # unpublished even though its ratio would have been exact.
    assert rollup["series"][0]["mean_percent_of_normal_median"] is None


def test_payload_covers_inventory_and_uses_the_mountain_water_year():
    inventory = {
        "site_count": 1,
        "normal_period": {"start_year": 1991, "end_year": 2020},
        "sites": [site()],
    }
    payload = build_payload(
        inventory,
        [record()],
        date(2026, 3, 1),
        datetime(2026, 3, 1, 12, tzinfo=timezone.utc),
    )
    assert water_year_start(date(2026, 3, 1)) == date(2025, 10, 1)
    assert payload["water_year"] == 2026
    assert payload["site_count"] == 1
    assert payload["generated_at"] == "2026-03-01T12:00:00Z"
    assert payload["site_series_fields"] == [
        "series_days", "series_values", "series_normals"]
    # The estimator is named, so an archive consumer comparing two files can
    # tell whether they were measured the same way. The rules travel with the
    # version: what the percentage divides, how many sites a day needs, and
    # which normal period stands behind the medians.
    assert payload["schema_version"] == 3
    assert payload["method"]["version"]
    assert payload["method"]["estimator"] == \
        "ratio of summed water to summed medians"
    assert payload["method"]["minimum_reporting_sites"] == 2
    assert payload["method"]["normal_period"] == "1991-2020"
    # The dates are written once for the whole file and each site names the
    # ones it published, as positions in that list. Rebuilding this site's
    # single row has to give back exactly the row it used to publish.
    assert payload["series_dates"] == ["2026-03-01"]
    site_out = payload["sites"][0]
    assert site_out["series_days"] == [0]
    assert site_out["series_values"] == [6.0]
    assert site_out["series_normals"] == [8.0]
    assert "series" not in site_out
    rebuilt = [
        [payload["series_dates"][day], value, normal]
        for day, value, normal in zip(
            site_out["series_days"], site_out["series_values"],
            site_out["series_normals"])
    ]
    assert rebuilt == [["2026-03-01", 6.0, 8.0]]
