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


def first_roster(tmp_path) -> Path:
    """The roster as it stood before ADR-168: what the tool adds to."""
    document = json.loads((ROOT / "admitted_river_gauges.json").read_text())
    document["gauges"] = {s: e for s, e in document["gauges"].items()
                          if e["tier"]["directed_on"] != admit.DIRECTED_ON}
    path = tmp_path / "admitted_river_gauges.json"
    path.write_text(admit.render(document))
    return path


def fake_lookup(station, today):
    return {"time_series_id": f"ts{station}", "parameter_code": "00060",
            "statistic_id": "00003", "unit": "ft^3/s", "record_begin": "1950-10-01",
            "source_url": f"https://api.waterdata.usgs.gov/x?{station}", "checked": today}


def test_the_selection_is_only_bulk_rows_the_loader_would_take(tmp_path):
    rows = admit.read_bulk_rows()
    first = roster.load_admitted_river_gauges(first_roster(tmp_path))
    chosen, held = admit.select(rows, first)
    assert chosen, "the worksheets have bulk rows to add"
    for row in chosen:
        assert row["review_queue"] == "bulk" or admit.ruled(row)
        assert admit.tier_of(row) in {"shaped", "natural"}
        assert row["usgs_site_no"] not in first
    reasons = {row["usgs_site_no"]: reason for row, reason in held}
    assert all(r["suggested_ruling"] != "exclude" for r in chosen)
    assert any("exclude" in reason for reason in reasons.values())


def test_a_waterwork_name_and_a_non_reference_natural_row_are_held():
    base = {"suggested_ruling": "reservoir", "reviewer_ruling": "", "covers_1991_2020": "yes",
            "trace_screen": "traced", "name_check": "", "accepted_display_name": "",
            "proposed_display_name": "Bruce Church Wasteway near Yuma",
            "upstream_reservoirs": "", "storage_share_pct": "50", "gages2_class": "reference",
            "flow_years": "35", "review_queue": "bulk", "notes": ""}
    assert "wasteway" in admit.held_reason(base, set())
    above = dict(base, proposed_display_name="Mammoth Creek above West Hatch Ditch, near Hatch")
    assert admit.held_reason(above, set()) is None
    natural = dict(base, suggested_ruling="natural", proposed_display_name="Big Creek",
                   gages2_class="not_listed", storage_share_pct="0")
    low = dict(base, proposed_display_name="Ashley Creek", storage_share_pct="2.1",
               reviewer_ruling="reservoir")
    assert "a person decides" in admit.held_reason(low, set())
    assert "reference" in admit.held_reason(natural, set())
    assert admit.held_reason(dict(natural, gages2_class="reference"), set()) is None
    short = dict(natural, gages2_class="reference", flow_years="4")
    assert "too few" in admit.held_reason(short, set())
    ruled = dict(natural, reviewer_ruling="natural", review_queue="review")
    assert admit.held_reason(ruled, set()) is None, "a ruling stands in for the reference class"
    assert "already used" in admit.held_reason(dict(base, proposed_display_name="A"), {"A"})


def test_a_run_merges_and_the_roster_still_loads(tmp_path):
    path = first_roster(tmp_path)
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
        assert tier["status"] in {"pending_formal_ruling", f"ruled_{tier['tier']}"}
        assert tier["directed_on"] == "2026-11-14"
        assert "ADR-137" in tier["basis"]
    # A second run adds nothing and leaves the file byte for byte.
    text = path.read_text()
    assert admit.main([], lookup=fake_lookup, path=path, pause=0,
                      today=dt.date(2026, 11, 14)) == 0
    assert path.read_text() == text


def test_a_gauge_the_survey_refuses_is_held_not_guessed(tmp_path):
    path = first_roster(tmp_path)

    def refuse(station, today):
        raise ValueError("two primary series")

    before = path.read_text()
    assert admit.main([], lookup=refuse, path=path, pause=0) == 1
    assert path.read_text() == before


def test_the_series_lookup_needs_exactly_one_primary_daily_mean():
    one = [{"id": "abc", "properties": {"primary": "Primary", "unit_of_measure": "ft^3/s",
                                        "begin": "1950-10-01T00:00:00+00:00"}}]
    flowing = [{"date": "2026-11-13", "cfs": 4.2, "qualifiers": []}]
    assert admit.lookup_series("09999999", "2026-11-14", one, flowing)["time_series_id"] == "abc"
    with pytest.raises(ValueError, match="one primary"):
        admit.lookup_series("09999999", "2026-11-14", one * 2, flowing)
    with pytest.raises(ValueError):
        admit.lookup_series("09999999", "2026-11-14",
                            [{"id": "abc", "properties": {"primary": "Primary",
                                                          "unit_of_measure": "ft^3/s"}}], flowing)


def test_a_series_with_no_reported_flow_is_held():
    """McElmo Creek near Bluff and Clear Creek near Winslow, 2026-11-15: every
    day in the window carried no value under RATINGDEV, and the first refresh
    after their admission refused the whole river payload."""
    one = [{"id": "abc", "properties": {"primary": "Primary", "unit_of_measure": "ft^3/s",
                                        "begin": "1950-10-01T00:00:00+00:00"}}]
    empty = [{"date": "2026-11-13", "cfs": None, "qualifiers": ["RATINGDEV"]},
             {"date": "2026-11-14", "cfs": None, "qualifiers": ["RATINGDEV"]}]
    with pytest.raises(ValueError, match=r"no flow in the last \d+ days \(qualifiers: RATINGDEV\)"):
        admit.lookup_series("09999999", "2026-11-14", one, empty)
    with pytest.raises(ValueError, match="no flow"):
        admit.lookup_series("09999999", "2026-11-14", one, [])


def test_the_roster_layout_is_kept():
    text = (ROOT / "admitted_river_gauges.json").read_text()
    assert admit.render(json.loads(text)) == text
