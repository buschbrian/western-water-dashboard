"""Network-free contract checks for the drought GeoJSON downloader."""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from tools.fetch_drought_monitor import (  # noqa: E402
    MAX_ALLOWABLE_OFFSET,
    assemble_geojson,
    object_id_field,
    retain_previous,
    validate_metadata,
)


def metadata(**overrides):
    value = {
        "geometryType": "esriGeometryPolygon",
        "objectIdField": "OBJECTID",
        "maxRecordCount": 2000,
        "supportedQueryFormats": "JSON, geoJSON, PBF",
        "fields": [
            {"name": "OBJECTID", "type": "esriFieldTypeOID"},
            {"name": "DM", "type": "esriFieldTypeSmallInteger"},
            {"name": "MapDate", "type": "esriFieldTypeDate"},
            {"name": "ReleaseDate", "type": "esriFieldTypeDate"},
        ],
    }
    value.update(overrides)
    return value


def feature(oid, severity, map_date=1_786_433_400_000,
            release_date=1_786_606_200_000):
    return {
        "type": "Feature",
        "properties": {
            "OBJECTID": oid,
            "DM": severity,
            "MapDate": map_date,
            "ReleaseDate": release_date,
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[-111, 40], [-110, 40], [-110, 41], [-111, 40]]],
        },
    }


def test_layer_schema_resolves_object_id_and_batch_limit():
    assert validate_metadata(metadata()) == ("OBJECTID", 2000)
    fallback = metadata(objectIdField=None)
    assert object_id_field(fallback) == "OBJECTID"


@pytest.mark.parametrize("change,message", [
    ({"geometryType": "esriGeometryPoint"}, "polygon"),
    ({"supportedQueryFormats": "JSON"}, "GeoJSON"),
    ({"maxRecordCount": 0}, "record limit"),
])
def test_layer_schema_refuses_an_incompatible_service(change, message):
    with pytest.raises(ValueError, match=message):
        validate_metadata(metadata(**change))


def test_geojson_is_complete_sorted_and_self_describing():
    payload = assemble_geojson([feature(9, 2), feature(7, 0), feature(8, 1)],
                               [7, 8, 9], "OBJECTID")
    assert [row["properties"]["DM"] for row in payload["features"]] == [0, 1, 2]
    assert payload["map_date"] == "2026-08-11"
    assert payload["release_date"] == "2026-08-13"
    assert "National Drought Mitigation Center" in payload["attribution"]
    assert MAX_ALLOWABLE_OFFSET == 0.001
    assert payload["geometry"]["max_allowable_offset_degrees"] == 0.001


def test_committed_drought_geometry_is_no_coarser_than_the_new_file_default():
    payload = json.loads(
        (ROOT / "data" / "drought" / "usdm-current.geojson").read_text(encoding="utf-8"))

    assert payload["geometry"]["max_allowable_offset_degrees"] <= 0.001


def test_geojson_refuses_partial_duplicate_or_mixed_week_results():
    with pytest.raises(ValueError, match="partial"):
        assemble_geojson([feature(7, 0)], [7, 8], "OBJECTID")
    with pytest.raises(ValueError, match="duplicate object"):
        assemble_geojson([feature(7, 0), feature(7, 1)], [7], "OBJECTID")
    with pytest.raises(ValueError, match="common map"):
        assemble_geojson([feature(7, 0), feature(8, 1, map_date=0)],
                         [7, 8], "OBJECTID")


class TestRetainingThePreviousWeek:
    """The download holds one week. Measuring what changed needs two."""

    def week(self, tmp_path, name, map_date):
        path = tmp_path / name
        path.write_text(json.dumps({
            "type": "FeatureCollection",
            "map_date": map_date,
            "features": []
        }), encoding="utf-8")
        return path

    def test_a_new_week_keeps_the_one_it_replaces(self, tmp_path):
        current = self.week(tmp_path, "current.geojson", "2026-08-25")
        previous = tmp_path / "previous.geojson"
        kept = retain_previous(current, previous, "2026-09-01")
        assert kept == "2026-08-25"
        assert json.loads(previous.read_text())["map_date"] == "2026-08-25"

    def test_the_same_week_does_not_overwrite_the_retained_one(self, tmp_path):
        """A rewrite of today is not a new week. Retaining it would turn the
        archive into a second copy of the current file, which is the failure
        this guards: it looks like it worked."""
        current = self.week(tmp_path, "current.geojson", "2026-08-25")
        previous = self.week(tmp_path, "previous.geojson", "2026-08-18")
        assert retain_previous(current, previous, "2026-08-25") is None
        assert json.loads(previous.read_text())["map_date"] == "2026-08-18"

    def test_a_first_run_has_nothing_to_keep(self, tmp_path):
        assert retain_previous(
            tmp_path / "absent.geojson", tmp_path / "previous.geojson",
            "2026-08-25") is None

    def test_an_unreadable_current_file_is_not_worth_failing_over(self, tmp_path):
        current = tmp_path / "current.geojson"
        current.write_text("{ not json", encoding="utf-8")
        assert retain_previous(
            current, tmp_path / "previous.geojson", "2026-08-25") is None

    def test_the_build_does_not_publish_the_retained_week(self):
        """Two megabytes nobody fetches is two megabytes every reader pays
        for, which is the same reason no boundary polygon is published."""
        config = (ROOT / "vite.config.ts").read_text(encoding="utf-8")
        assert "usdm-previous.geojson" in config
