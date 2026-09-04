"""A reviewed point correction must not refresh or discard observations."""

import copy
import json

import pytest

import refresh_reservoirs as refresh


# Reviewer-approved WGS84 points, separate from the committed outlet evidence.
# ADR-108 records the source waterbody identifiers and the individual approvals.
APPROVED = {
    "10774": (38.72149, -121.13295, "06017"),
    "FRL": (39.41268, -120.53357, "06057"),
    "CRW": (37.60286, -118.74425, "06051"),
    "FRD": (39.90711, -120.18462, "06063"),
    "09UTKOLB:UT:BOR": (37.43699, -113.04763, "49053"),
    "PVR": (37.42555, -118.54362, "06027"),
}


def test_reviewed_batch_uses_roster_points_and_keeps_separate_outlets(tmp_path, monkeypatch):
    tables = {**refresh.RESERVOIRS, **refresh.CDEC_RESERVOIRS, **refresh.AWDB_RESERVOIRS}
    records = []
    for station, (lat, lon, _) in APPROVED.items():
        assert tables[station][1:3] == (lat, lon)
        records.append({"source_station_id": station, "name": tables[station][0],
                        "lat": 0, "lon": 0, "current_storage_af": 1234,
                        "as_of": "2020-01-01"})
    document = payload()
    document["reservoirs"] = records + [document["reservoirs"][1]]
    output = tmp_path / "reservoirs.json"
    output.write_text(json.dumps(document))
    monkeypatch.setattr(refresh, "OUTPUT_PATH", output)
    monkeypatch.setattr(refresh, "local_today",
                        lambda: pytest.fail("batch entered the daily refresh"))
    monkeypatch.setattr("sys.argv", ["refresh_reservoirs.py", "--rebuild-points", *APPROVED])
    assert refresh.main() == 0
    after = json.loads(output.read_text())
    outlets = refresh.geography.dam_points()
    for record in after["reservoirs"][:-1]:
        station = record["source_station_id"]
        lat, lon, county = APPROVED[station]
        assert (record["lat"], record["lon"]) == (lat, lon)
        assert record["county_fips"] == county
        assert record["huc_assignment_point"] == [round(value, 5) for value in outlets[station]]
        assert record["huc_assignment_point"] != [lon, lat]
        assert record["current_storage_af"] == 1234
        assert record["as_of"] == "2020-01-01"
    assert after["reservoirs"][-1]["lat"] == document["reservoirs"][-1]["lat"]
    assert after["reservoirs"][-1]["lon"] == document["reservoirs"][-1]["lon"]
    assert after["generated_at"] == document["generated_at"]
    assert after["withdrawn"] == document["withdrawn"]


def payload():
    return {
        "generated_at": "2020-01-01T00:00:00Z",
        "reservoirs": [
            {"source_station_id": "10774", "name": "Folsom Lake",
             "lat": 38.683, "lon": -121.183,
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
    monkeypatch.setattr("sys.argv", ["refresh_reservoirs.py", "--rebuild-points", "10774"]
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
    folsom, deer_creek = after["reservoirs"]
    assert (folsom["lat"], folsom["lon"]) == (38.72149, -121.13295)
    assert folsom["huc_assignment_point"] == [-121.15671, 38.70751]
    assert (deer_creek["lat"], deer_creek["lon"]) == (40.43511, -111.50035)


def test_an_unpublished_point_is_refused_before_any_record_changes():
    document = payload()
    before = copy.deepcopy(document)
    with pytest.raises(ValueError, match="not currently published"):
        refresh.geography.rebuild_published_points(document, {
            "10774": (38.72149, -121.13295), "absent": (40.0, -111.0),
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
