"""The archive backfill: what it accepts from the monitor's archive, how it
compares a week, how it adds weeks, and how it rebuilds a whole series.

No network: every archive file here is built in the test. The equivalence
gate against the real archive is the tool's own `--verify-overlap` mode,
because it needs the downloads.
"""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from backfill_drought_history import (  # noqa: E402
    add_archive_weeks,
    compare_week,
    map_dates,
    rebuild_history,
)
from compute_drought_coverage import METHOD_VERSION  # noqa: E402
from drought_archive import ArchiveWeekError, archive_drought  # noqa: E402


def ring(west, south, east, north):
    return [[west, south], [east, south], [east, north], [west, north], [west, south]]


def archive_file(*levels, geometry=None):
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature",
         "properties": {"OBJECTID": index + 1, "DM": level, "Shape_Area": 1.0},
         "geometry": geometry or {"type": "MultiPolygon",
                                  "coordinates": [[ring(-110, 40, -109, 41)]]}}
        for index, level in enumerate(levels)]}


def entry(map_date, d0=50.0, release_date="x"):
    return {"map_date": map_date, "release_date": release_date, "units": [
        {"huc6": "140100", "percent_of_area_at_least": {
            "d0": d0, "d1": 10.0, "d2": 0.0, "d3": 0.0, "d4": 0.0}}]}


def history(*weeks):
    return {"schema_version": 1, "source": "live", "attribution": "a", "level": 6,
            "method": {"version": METHOD_VERSION}, "weeks_kept": 520,
            "first_map_date": weeks[0]["map_date"],
            "last_map_date": weeks[-1]["map_date"],
            "week_count": len(weeks), "unit_count": 1, "weeks": list(weeks)}


class TestArchiveFile:
    def test_a_good_week_becomes_the_collection_the_engine_reads(self):
        drought = archive_drought(archive_file(2, 0, 1), "2016-10-11")
        assert [f["properties"]["DM"] for f in drought["features"]] == [0, 1, 2]
        assert drought["map_date"] == "2016-10-11"
        # Not inferred: the archive states none.
        assert drought["release_date"] is None
        assert drought["source"].endswith("usdm_20161011.json")

    @pytest.mark.parametrize("raw, reason", [
        ([], "not a feature collection"),
        ({"type": "FeatureCollection", "features": []}, "no features"),
        (archive_file(0, 0), "two features for intensity D0"),
        (archive_file(5), "invalid drought intensity"),
        (archive_file(True), "invalid drought intensity"),
        (archive_file(0, geometry={"type": "LineString", "coordinates": []}),
         "not a polygon"),
        (archive_file(0, geometry={"type": "Polygon",
                                   "coordinates": [ring(-110, 40, -109, 41)[:-1]]}),
         "not closed"),
        (archive_file(0, geometry={"type": "Polygon", "coordinates": [
            [[-110, 40], [-109, 40], [-109, float("nan")], [-110, 40]]]}),
         "two finite numbers"),
        (archive_file(0, geometry={"type": "Polygon",
                                   "coordinates": [ring(-110, 40, -109, 91)]}),
         "outside longitude and latitude"),
        (archive_file(0, geometry={"type": "Polygon",
                                   "coordinates": [[[-110, 40], [-109, 40], [-110, 40]]]}),
         "fewer than four"),
    ])
    def test_a_bad_week_is_refused_with_its_reason(self, raw, reason):
        with pytest.raises(ArchiveWeekError, match=reason):
            archive_drought(raw, "2016-10-11")


class TestSchedule:
    def test_weekly_dates_end_at_the_last_week_oldest_first(self):
        assert map_dates("2026-10-13", 3) == ["2026-09-29", "2026-10-06", "2026-10-13"]

    def test_a_decade_reaches_back_to_november_2016(self):
        dates = map_dates("2026-10-13", 520)
        assert len(dates) == 520 and dates[0] == "2016-11-01"


class TestCompare:
    def test_identical_weeks_have_no_differences(self):
        assert compare_week(entry("2026-10-13"), entry("2026-10-13"), "huc6") == []

    def test_one_tenth_is_a_difference(self):
        """No tolerance: a reader would see a different number."""
        differences = compare_week(entry("2026-10-13", 50.0),
                                   entry("2026-10-13", 50.1), "huc6")
        assert differences == ["140100 d0: published 50.0, archive 50.1 (+0.1)"]

    def test_an_area_in_only_one_reading_is_a_difference(self):
        other = entry("2026-10-13")
        other["units"][0]["huc6"] = "140200"
        assert len(compare_week(entry("2026-10-13"), other, "huc6")) == 2


class TestAddWeeks:
    def test_archive_weeks_join_the_weekly_ones_in_order(self):
        result = add_archive_weeks(
            history(entry("2026-10-13")),
            {"2026-09-29": entry("2026-09-29", release_date=None),
             "2026-10-06": entry("2026-10-06", release_date=None)}, {})
        assert [w["map_date"] for w in result["weeks"]] == [
            "2026-09-29", "2026-10-06", "2026-10-13"]
        assert result["first_map_date"] == "2026-09-29"
        assert result["week_count"] == 3
        assert result["source"] == "live"
        assert list(result)[-1] == "weeks"

    def test_a_published_week_is_never_overwritten(self):
        result = add_archive_weeks(
            history(entry("2026-10-13", 50.0)),
            {"2026-10-13": entry("2026-10-13", 99.0, release_date=None)}, {})
        assert result["weeks"][0]["units"][0]["percent_of_area_at_least"]["d0"] == 50.0
        assert result["weeks"][0]["release_date"] == "x"

    def test_a_skipped_week_is_listed_with_its_reason(self):
        result = add_archive_weeks(
            history(entry("2026-10-13")),
            {"2026-09-29": entry("2026-09-29", release_date=None)},
            {"2026-10-06": "the archive holds no map for this date"})
        assert result["backfill"]["skipped"] == [
            {"map_date": "2026-10-06", "reason": "the archive holds no map for this date"}]

    def test_a_week_supplied_later_leaves_the_skipped_list(self):
        first = add_archive_weeks(history(entry("2026-10-13")), {},
                                  {"2026-10-06": "no map"})
        second = add_archive_weeks(first, {"2026-10-06": entry("2026-10-06")}, {})
        assert second["backfill"]["skipped"] == []

    def test_the_decade_bound_holds(self):
        result = add_archive_weeks(
            history(entry("2026-10-13")),
            {d: entry(d) for d in ("2026-09-22", "2026-09-29", "2026-10-06")}, {},
            keep=2)
        assert [w["map_date"] for w in result["weeks"]] == ["2026-10-06", "2026-10-13"]

    def test_an_archive_from_another_method_is_refused(self):
        old = history(entry("2026-10-13"))
        old["method"]["version"] = "drought-coverage-1"
        with pytest.raises(ValueError, match="drought-coverage-1"):
            add_archive_weeks(old, {}, {})


class TestRebuild:
    def test_every_week_is_the_new_measurement_and_release_dates_survive(self):
        old = history(entry("2026-10-06", 10.0, release_date="2026-10-08"),
                      entry("2026-10-13", 10.0, release_date="2026-10-15"))
        old["method"]["version"] = "drought-coverage-2"
        result = rebuild_history(old, {
            "2026-09-29": entry("2026-09-29", 30.0, release_date=None),
            "2026-10-06": entry("2026-10-06", 40.0, release_date=None),
            "2026-10-13": entry("2026-10-13", 50.0, release_date=None),
        }, {"2026-09-22": "the archive holds no map for this date"})
        assert result["method"]["version"] == METHOD_VERSION
        assert [w["release_date"] for w in result["weeks"]] == [
            None, "2026-10-08", "2026-10-15"]
        assert [w["units"][0]["percent_of_area_at_least"]["d0"]
                for w in result["weeks"]] == [30.0, 40.0, 50.0]
        assert result["week_count"] == 3 and result["first_map_date"] == "2026-09-29"
        # Named only when it falls inside the series it describes.
        assert result["backfill"]["skipped"] == []
        assert list(result)[-1] == "weeks"

    def test_a_skipped_week_inside_the_series_is_named(self):
        result = rebuild_history(history(entry("2026-10-13")), {
            "2026-09-29": entry("2026-09-29"), "2026-10-13": entry("2026-10-13")},
            {"2026-10-06": "a ring is not closed"})
        assert result["backfill"]["skipped"] == [
            {"map_date": "2026-10-06", "reason": "a ring is not closed"}]

    def test_nothing_measured_leaves_the_archive_alone(self):
        with pytest.raises(ValueError, match="left as it was"):
            rebuild_history(history(entry("2026-10-13")), {}, {})


class TestArchiveCache:
    """A rejected download must not poison the cache (no network)."""

    def stub_fetch(self, monkeypatch, bodies):
        import drought_archive

        class Response:
            def __init__(self, body):
                self.body = body

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def read(self):
                return self.body

        queue = list(bodies)
        monkeypatch.setattr(drought_archive.urllib.request, "urlopen",
                            lambda request, timeout=None: Response(queue.pop(0)))
        monkeypatch.setattr(drought_archive.time, "sleep", lambda seconds: None)
        return drought_archive

    def test_an_invalid_body_is_not_kept_and_the_next_run_fetches_again(
            self, monkeypatch, tmp_path):
        import gzip
        import json

        good = json.dumps(archive_file(0)).encode()
        module = self.stub_fetch(monkeypatch, [b"{not json", good])
        with pytest.raises(ArchiveWeekError):
            module.load_archive_week("2026-10-20", tmp_path)
        assert not module.cached_path("2026-10-20", tmp_path).exists()
        assert module.load_archive_week("2026-10-20", tmp_path)
        assert gzip.decompress(
            module.cached_path("2026-10-20", tmp_path).read_bytes()) == good
