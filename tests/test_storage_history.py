import json
import gzip

import pandas as pd
import pytest

from pipeline import storage_history as H
from tools.build_storage_history import import_histories


def record(station="509", cadence="daily"):
    return dict(source_station_id=station, name="Test water", source_key="rise",
                source_url="https://data.usbr.gov/", data_frequency=cadence)


def frame(*rows):
    result = pd.DataFrame(rows, columns=["date", "storage_af"])
    result["date"] = pd.to_datetime(result["date"])
    return result


def test_dates_gaps_corrections_and_idempotence(tmp_path):
    r = record()
    H.publish([r], {"509": frame(("2025-09-29", 10), ("2025-10-01", 12))}, "2025-10-03", tmp_path)
    archive = json.loads((tmp_path / H.archive_name("509")).read_text())["reservoir"]
    assert archive["values"] == [10, None]
    before = (tmp_path / H.archive_name("509")).read_bytes()
    incoming = frame(("2025-10-01", 13), ("2025-10-03", 14))
    H.publish([r], {"509": incoming}, "2025-10-04", tmp_path)
    assert before == (tmp_path / H.archive_name("509")).read_bytes()
    assert json.loads((tmp_path / "current.json").read_text())["reservoirs"][0]["values"] == [13, None, 14]
    snapshot = {p.name: p.read_bytes() for p in tmp_path.iterdir()}
    H.publish([r], {"509": incoming}, "2025-10-04", tmp_path)
    assert snapshot == {p.name: p.read_bytes() for p in tmp_path.iterdir()}


def test_partial_run_keeps_others_and_rollover_keeps_withdrawn_station(tmp_path):
    records = [record("509"), record("6124", "monthly")]
    frames = {r["source_station_id"]: frame(("2026-09-30", 10)) for r in records}
    H.publish(records, frames, "2026-09-30", tmp_path)
    H.publish([records[0]], {"509": frame(("2026-10-01", 11))}, "2026-10-02", tmp_path)
    index = json.loads((tmp_path / "index.json").read_text())["stations"]
    assert set(index) == {"509", "6124"}
    archived = json.loads((tmp_path / index["6124"]["archive"]).read_text())["reservoir"]
    assert archived["values"] == [10]
    assert archived["data_frequency"] == "monthly"
    current = json.loads((tmp_path / "current.json").read_text())
    assert [r["source_station_id"] for r in current["reservoirs"]] == ["509"]
    assert current["water_year"] == 2027


def test_bad_input_and_corrupt_archive_never_overwrite(tmp_path):
    r = record()
    H.publish([r], {"509": frame(("2025-09-30", 10))}, "2025-10-01", tmp_path)
    with pytest.raises(ValueError, match="invalid storage"):
        H.publish([r], {"509": frame(("2025-10-01", float("nan")))}, "2025-10-01", tmp_path)
    path = tmp_path / H.archive_name("509")
    path.write_text("broken")
    with pytest.raises(ValueError):
        H.publish([r], {"509": frame(("2025-10-01", 10))}, "2025-10-01", tmp_path)
    assert path.read_text() == "broken"


def test_daily_refresh_skips_a_bad_station_and_keeps_the_others(tmp_path):
    good, bad = record("509"), record("6124")
    H.publish([good, bad], {"509": frame(("2025-10-01", 10)), "6124": frame(("2025-10-01", 20))},
              "2025-10-01", tmp_path)
    H.publish([good, bad], {"509": frame(("2025-10-02", 11)),
                            "6124": frame(("2025-10-02", float("nan")))},
              "2025-10-02", tmp_path, skip_failures=True)
    current = {r["source_station_id"]: r["values"]
               for r in json.loads((tmp_path / "current.json").read_text())["reservoirs"]}
    assert current == {"509": [10, 11], "6124": [20]}


def test_station_paths_never_depend_on_name_or_unescaped_station():
    assert H.archive_name("../../x").endswith(".json")
    assert "/" not in H.archive_name("../../x")


def test_new_reviewed_exclusion_removes_cached_value_but_keeps_a_correction(monkeypatch):
    r = record("a")
    previous = H.entry(r, frame(("2025-09-29", 99), ("2025-10-01", 12)))
    monkeypatch.setattr(H.providers, "RISE_EXCLUDED_READINGS", {"a": [{"stamp": "2025-09-29", "value": 99}]})
    merged = H.entry(r, frame(("2025-10-02", 13)), previous)
    assert merged["values"] == [None, None, 12, 13]
    corrected = H.entry(r, frame(("2025-09-29", 98)), previous)
    assert corrected["values"][0] == 98


def test_monthly_cached_exclusion_uses_the_same_calendar_correction(monkeypatch):
    r = {**record("a", "monthly"), "source_key": "cdec"}
    previous = H.entry(r, frame(("2025-09-30", 99), ("2025-10-31", 12)))
    monkeypatch.setattr(H.providers, "CDEC_EXCLUDED_READINGS", {"a": [{"stamp": "2025-09-01", "value": 99}]})
    merged = H.entry(r, frame(("2025-11-30", 13)), previous)
    assert merged["values"][0] is None


def test_verified_actions_artifact_merges_without_losing_local_stations(tmp_path):
    source, destination = tmp_path / "artifact", tmp_path / "local"
    H.publish([record("a")], {"a": frame(("2025-09-29", 10), ("2025-10-01", 12))}, "2025-10-03", source)
    H.publish([record("b")], {"b": frame(("2025-10-02", 20))}, "2025-10-03", destination)
    import_histories(source, destination, [record("a"), record("b")], "2025-10-03")
    index = H.read(destination / "index.json")
    assert set(index["stations"]) == {"a", "b"}
    assert H.read(destination / H.archive_name("a"))["reservoir"]["values"] == [10, None]
    index = H.read(source / "index.json")
    index["stations"]["a"]["archive"] = "../../outside.json"
    H.daily.write_compact(source / "index.json", index)
    with pytest.raises(ValueError, match="archive path"):
        import_histories(source, destination, [record("a")], "2025-10-03")


def test_manual_actions_backfill_is_read_only_and_skips_daily_publish():
    workflow = (H.ROOT / ".github/workflows/probe-rise.yml").read_text()
    assert "if: ${{ !inputs.backfill_usgs_storage }}" in workflow
    backfill = workflow.split("  backfill-usgs-storage:", 1)[1]
    assert "contents: read" in backfill
    assert "persist-credentials: false" in backfill
    assert "${{ secrets.USGS_API_KEY }}" in backfill
    assert "actions/upload-artifact@" in backfill
    assert "refresh-daily.sh" not in backfill
    assert "git push" not in backfill


def test_published_histories_match_the_index_calendar_and_transfer_budget():
    directory = H.DIRECTORY
    index = H.read(directory / "index.json")
    current = H.read(directory / "current.json")
    assert index["schema_version"] == current["schema_version"] == 1
    assert index["unit"] == current["unit"] == "acre-ft"
    assert current["water_year"] == H.water_year(current["run_date"])
    current_entries = {r["source_station_id"]: r for r in current["reservoirs"]}
    assert len(current_entries) == len(current["reservoirs"])
    assert set(current_entries) <= index["stations"].keys()
    for station, location in index["stations"].items():
        entries = []
        if location["archive"] is not None:
            assert location["archive"] == H.archive_name(station)
            archive = H.read(directory / location["archive"])
            assert archive["schema_version"] == 1 and archive["unit"] == "acre-ft"
            entries.append(archive["reservoir"])
            assert H.water_year(entries[0]["end"]) < current["water_year"]
        if station in current_entries:
            entries.append(current_entries[station])
            assert H.water_year(current_entries[station]["start"]) == current["water_year"]
        assert entries, station
        for entry in entries:
            H.validate_entry(entry)
            assert entry["source_station_id"] == station
        assert min(e["start"] for e in entries) == location["start"]
        assert max(e["end"] for e in entries) == location["end"]
    sizes = {p.name: len(gzip.compress(p.read_bytes(), mtime=0)) for p in directory.glob("*.json")}
    assert max(sizes.values()) <= 512 * 1024
    assert sum(sizes.values()) <= 64 * 1024 * 1024
    assert sizes["index.json"] <= 64 * 1024
