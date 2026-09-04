"""A reviewed point correction must not refresh or discard observations."""

import copy
import json

import pytest

import refresh_reservoirs as refresh


def payload():
    return {
        "generated_at": "2020-01-01T00:00:00Z",
        "reservoirs": [
            {"source_station_id": "727", "name": "Scofield",
             "lat": 39.77656, "lon": -111.05074,
             "current_storage_af": 1234, "as_of": "2020-01-01"},
            {"source_station_id": "290", "name": "Deer Creek",
             "lat": 40.43511, "lon": -111.50035,
             "current_storage_af": 5678, "as_of": "2019-12-31"},
        ],
        "watersheds": {}, "counties": {},
        "withdrawn": [{"source_station_id": "absent", "name": "Withdrawn"}],
    }


@pytest.mark.parametrize("dry_run", [False, True])
def test_point_rebuild_preserves_readings_and_never_enters_daily_refresh(
        tmp_path, monkeypatch, dry_run):
    output = tmp_path / "reservoirs.json"
    before = payload()
    output.write_text(json.dumps(before))
    monkeypatch.setattr(refresh, "OUTPUT_PATH", output)
    monkeypatch.setattr(refresh, "local_today",
                        lambda: pytest.fail("point rebuild entered the daily refresh"))
    monkeypatch.setattr("sys.argv", ["refresh_reservoirs.py", "--rebuild-points", "727"]
                        + (["--dry-run"] if dry_run else []))
    assert refresh.main() == 0
    after = json.loads(output.read_text())
    if dry_run:
        assert after == before
        return
    assert after["generated_at"] == before["generated_at"]
    assert after["withdrawn"] == before["withdrawn"]
    assert len(after["reservoirs"]) == len(before["reservoirs"])
    for old, new in zip(before["reservoirs"], after["reservoirs"]):
        for key in ("source_station_id", "name", "current_storage_af", "as_of"):
            assert new[key] == old[key]
    scofield, deer_creek = after["reservoirs"]
    assert (scofield["lat"], scofield["lon"]) == (39.76315, -111.15614)
    assert scofield["huc_assignment_point"] == [-111.11991, 39.78681]
    assert (deer_creek["lat"], deer_creek["lon"]) == (40.43511, -111.50035)


def test_an_unpublished_point_is_refused_before_any_record_changes():
    document = payload()
    before = copy.deepcopy(document)
    with pytest.raises(ValueError, match="not currently published"):
        refresh.geography.rebuild_published_points(document, {
            "727": (39.76315, -111.15614), "absent": (40.0, -111.0),
        })
    assert document == before


def test_unknown_station_is_refused_without_writing(tmp_path, monkeypatch):
    output = tmp_path / "reservoirs.json"
    original = json.dumps(payload())
    output.write_text(original)
    monkeypatch.setattr(refresh, "OUTPUT_PATH", output)
    monkeypatch.setattr("sys.argv", ["refresh_reservoirs.py", "--rebuild-points", "unknown"])
    with pytest.raises(SystemExit) as error:
        refresh.main()
    assert error.value.code == 2
    assert output.read_text() == original
