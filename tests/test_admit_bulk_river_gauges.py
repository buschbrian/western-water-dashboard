"""The bulk-queue gauge admission tool (ADR-168), offline."""

import datetime as dt
import json
import shutil
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import admit_bulk_river_gauges as admit  # noqa: E402
from pipeline import roster  # noqa: E402


def fake_lookup(station, today):
    return {"time_series_id": f"ts{station}", "parameter_code": "00060",
            "statistic_id": "00003", "unit": "ft^3/s", "record_begin": "1950-10-01",
            "source_url": f"https://api.waterdata.usgs.gov/x?{station}", "checked": today}


def test_the_selection_is_only_bulk_rows_the_loader_would_take():
    rows = admit.read_bulk_rows()
    chosen, held = admit.select(rows, roster.admitted_river_gauges())
    assert chosen, "the worksheets have bulk rows to add"
    for row in chosen:
        assert row["review_queue"] == "bulk"
        assert row["suggested_ruling"] in admit.TIER_FOR_SUGGESTION
        assert row["usgs_site_no"] not in roster.admitted_river_gauges()
    reasons = {row["usgs_site_no"]: reason for row, reason in held}
    assert all(r["suggested_ruling"] != "exclude" for r in chosen)
    assert any("exclude" in reason for reason in reasons.values())


def test_a_waterwork_name_and_a_non_reference_natural_row_are_held():
    base = {"suggested_ruling": "reservoir", "reviewer_ruling": "", "covers_1991_2020": "yes",
            "trace_screen": "traced", "name_check": "", "accepted_display_name": "",
            "proposed_display_name": "Bruce Church Wasteway near Yuma",
            "upstream_reservoirs": "", "storage_share_pct": "0", "gages2_class": "reference"}
    assert "wasteway" in admit.held_reason(base, set())
    above = dict(base, proposed_display_name="Mammoth Creek above West Hatch Ditch, near Hatch")
    assert admit.held_reason(above, set()) is None
    natural = dict(base, suggested_ruling="natural", proposed_display_name="Big Creek",
                   gages2_class="not_listed")
    assert "reference" in admit.held_reason(natural, set())
    assert admit.held_reason(dict(natural, gages2_class="reference"), set()) is None
    assert "already used" in admit.held_reason(dict(base, proposed_display_name="A"), {"A"})


def test_a_run_merges_and_the_roster_still_loads(tmp_path):
    path = tmp_path / "admitted_river_gauges.json"
    shutil.copy(ROOT / "admitted_river_gauges.json", path)
    before = json.loads(path.read_text())["gauges"]
    assert admit.main([], lookup=fake_lookup, path=path, pause=0,
                      today=dt.date(2026, 11, 14)) == 0
    after = roster.load_admitted_river_gauges(path)
    for station, row in before.items():
        assert after[station] == row, "an entry already on the roster is never changed"
    added = set(after) - set(before)
    assert added
    for station in added:
        tier = after[station]["tier"]
        assert tier["status"] == "pending_formal_ruling"
        assert tier["directed_on"] == "2026-11-14"
        assert "ADR-137" in tier["basis"]
    # A second run adds nothing and leaves the file byte for byte.
    text = path.read_text()
    assert admit.main([], lookup=fake_lookup, path=path, pause=0,
                      today=dt.date(2026, 11, 14)) == 0
    assert path.read_text() == text


def test_a_gauge_the_survey_refuses_is_held_not_guessed(tmp_path):
    path = tmp_path / "admitted_river_gauges.json"
    shutil.copy(ROOT / "admitted_river_gauges.json", path)

    def refuse(station, today):
        raise ValueError("two primary series")

    before = path.read_text()
    assert admit.main([], lookup=refuse, path=path, pause=0) == 1
    assert path.read_text() == before


def test_the_series_lookup_needs_exactly_one_primary_daily_mean():
    one = [{"id": "abc", "properties": {"primary": "Primary", "unit_of_measure": "ft^3/s",
                                        "begin": "1950-10-01T00:00:00+00:00"}}]
    assert admit.lookup_series("09999999", "2026-11-14", one)["time_series_id"] == "abc"
    with pytest.raises(ValueError, match="one primary"):
        admit.lookup_series("09999999", "2026-11-14", one * 2)
    with pytest.raises(ValueError):
        admit.lookup_series("09999999", "2026-11-14",
                            [{"id": "abc", "properties": {"primary": "Primary",
                                                          "unit_of_measure": "ft^3/s"}}])


def test_the_roster_layout_is_kept():
    text = (ROOT / "admitted_river_gauges.json").read_text()
    assert admit.render(json.loads(text)) == text
