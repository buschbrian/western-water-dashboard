"""Partial county rebuilds preserve every unselected assignment."""

import json

import pytest

from tools import build_county_assignments as builder


@pytest.mark.parametrize("dry_run,found", [(False, True), (True, True), (False, False)])
def test_partial_county_rebuild_merges_or_leaves_file_unchanged(
        tmp_path, monkeypatch, dry_run, found):
    path = tmp_path / "counties.json"
    before = {"retrieved": "2020-01-01", "counties": {
        "10774": {"name": "Folsom Lake", "county_fips": "06067"},
        "727": {"name": "Scofield", "county_fips": "49007"},
    }}
    original = json.dumps(before)
    path.write_text(original)
    calls = []

    def lookup(lon, lat):
        calls.append((lon, lat))
        return ({"county_fips": "06017", "county_name": "El Dorado County",
                 "state": "CA"} if found else None)

    monkeypatch.setattr(builder, "OUTPUT_PATH", path)
    monkeypatch.setattr(builder, "county_at", lookup)
    monkeypatch.setattr(builder.time, "sleep", lambda _: None)
    monkeypatch.setattr("sys.argv", ["build_county_assignments.py", "--only", "10774"]
                        + (["--dry-run"] if dry_run else []))
    assert builder.main() == (0 if found else 1)
    assert calls == [(-121.13295, 38.72149)]
    if dry_run or not found:
        assert path.read_text() == original
    else:
        after = json.loads(path.read_text())
        assert after["counties"]["727"] == before["counties"]["727"]
        assert after["retrieved"] == before["retrieved"]
        assert after["counties"]["10774"]["county_fips"] == "06017"
        assert "retrieved" in after["counties"]["10774"]
