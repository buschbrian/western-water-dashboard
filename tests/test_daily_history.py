"""River and soil-moisture history files (ADR-146), on synthetic payloads.

Network-free. The committed files are checked for shape only, never for
today's numbers.
"""

import datetime as dt
import json
from pathlib import Path

import pandas as pd
import pytest

from pipeline import daily_history, providers, river_history, rivers, soil_history

ROOT = Path(__file__).resolve().parent.parent
END = dt.date(2026, 10, 30)
TODAY = pd.Timestamp("2026-10-31")


def normals():
    band = {"years": 40, "p10": 10.0, "p25": 20.0, "p50": 30.0, "p75": 40.0, "p90": 50.0}
    return {"retrieved": "2026-10-31", "source_url": "https://example.test/n",
            "days": {day: dict(band) for day in providers.DAYS_OF_YEAR}}


def record(station="1", tier="natural", end=END, days=5, base=25.0, fetch_ok=True,
           approval="Provisional", **overrides):
    daily = [{"date": (end - dt.timedelta(days=days - 1 - k)).isoformat(),
              "cfs": base + k, "approval": approval, "qualifiers": []} for k in range(days)]
    out = {"name": f"Gauge {station}", "source_station_id": station,
           "time_series_id": f"series{station}", "tier": tier, "fetch_ok": fetch_ok,
           "daily": daily}
    out.update(overrides)
    return out


def payload(*records):
    return {"gauges": list(records)}


def build(*records, previous=None):
    return river_history.build_payload(
        payload(*records), previous or {}, {"1": normals()}, TODAY, "t")


def test_a_natural_gauge_keeps_its_flow_status_and_class_by_date():
    entry = build(record())["gauges"][0]
    assert (entry["start"], entry["end"]) == ("2026-10-26", "2026-10-30")
    assert entry["cfs"] == [25.0, 26.0, 27.0, 28.0, 29.0]
    assert entry["approval"] == ["Provisional"] * 5 and entry["qualifiers"] == [[]] * 5
    assert entry["flow_class"] == ["normal"] * 5
    river_history.validate_payload(build(record()))


def test_a_shaped_gauge_has_no_class():
    built = build(record("2", "shaped"))
    assert "flow_class" not in built["gauges"][0]
    river_history.validate_payload(built)


def test_a_second_run_changes_nothing():
    first = build(record())
    assert build(record(), previous=first)["gauges"] == first["gauges"]


def test_a_revised_past_day_replaces_that_day_and_a_new_day_extends_the_file():
    first = build(record())
    revised = record(end=END + dt.timedelta(days=1), base=26.0, approval="Approved")
    revised["daily"][0]["cfs"] = 99.0
    entry = build(revised, previous=first)["gauges"][0]
    assert entry["end"] == "2026-10-31" and len(entry["cfs"]) == 6
    assert entry["cfs"][:2] == [25.0, 99.0]
    assert entry["approval"][0] == "Provisional" and entry["approval"][1] == "Approved"


def test_a_day_the_provider_leaves_empty_keeps_its_stored_value():
    first = build(record())
    gap = record()
    gap["daily"][2].update(cfs=None, approval=None, qualifiers=[])
    assert build(gap, previous=first)["gauges"][0]["cfs"][2] == 27.0


def test_a_carried_forward_gauge_and_a_gauge_that_left_the_payload_keep_their_days():
    first = build(record("1"), previous=build(record("2", "shaped")))
    assert {e["source_station_id"] for e in first["gauges"]} == {"1", "2"}
    again = build(record("1", fetch_ok=False, base=1.0), previous=first)
    assert again["gauges"] == first["gauges"]


def test_the_river_validator_refuses_a_file_that_drifts():
    good = build(record())
    for mutate, match in [
        (lambda p: p["gauges"][0]["cfs"].pop(), "values"),
        (lambda p: p["gauges"][0]["cfs"].__setitem__(0, -1.0), "impossible"),
        (lambda p: p["gauges"][0]["approval"].__setitem__(0, "Guess"), "review status"),
        (lambda p: p["gauges"][0]["flow_class"].__setitem__(0, "wet"), "flow class"),
        (lambda p: p.__setitem__("total_cfs", 1), "adds gauges"),
        (lambda p: p["gauges"][0].__setitem__("inflow", 1), "unexpected fields"),
    ]:
        bad = json.loads(json.dumps(good))
        mutate(bad)
        with pytest.raises(ValueError, match=match):
            river_history.validate_payload(bad)


def soil(as_of="2026-10-30", mean=1.5, areas=("140100",)):
    return {"as_of": as_of, "end_date": "2026-10-29", "change_days": 7, "site_count": 20,
            "measured_site_count": 15,
            "rollups": [{"huc6": a, "huc6_name": f"Area {a}", "site_count": 10,
                         "measured_site_count": 8, "minimum_reporting_sites": 2,
                         "mean_change_points": mean} for a in areas]}


def test_soil_history_keeps_each_dates_published_area_figure():
    first = soil_history.build_payload(soil(), {}, "t")
    second = soil_history.build_payload(
        soil("2026-11-01", -0.5, ("140100", "140200")), first, "t")
    assert (second["start"], second["end"]) == ("2026-10-30", "2026-11-01")
    old, new = second["areas"]
    assert old["mean_change_points"] == [1.5, None, -0.5]
    assert new["mean_change_points"] == [None, None, -0.5] and new["site_count"][0] is None
    assert second["end_date"] == ["2026-10-29", None, "2026-10-29"]
    soil_history.validate_payload(second)


def test_a_soil_rerun_on_the_same_date_replaces_it_and_changes_nothing_else():
    first = soil_history.build_payload(soil(), {}, "t")
    assert soil_history.build_payload(soil(), first, "t") == first
    redone = soil_history.build_payload(soil(mean=2.0), first, "t")
    assert redone["areas"][0]["mean_change_points"] == [2.0] and len(redone["site_count"]) == 1


def test_the_soil_validator_refuses_a_file_that_drifts():
    good = soil_history.build_payload(soil(), {}, "t")
    for mutate, match in [
        (lambda p: p["areas"][0]["site_count"].append(1), "values"),
        (lambda p: p["areas"][0]["measured_site_count"].__setitem__(0, 99), "more measured"),
        (lambda p: p["areas"][0]["mean_change_points"].__setitem__(0, 500), "impossible"),
        (lambda p: p["areas"][0].__setitem__("extra", 1), "unexpected fields"),
    ]:
        bad = json.loads(json.dumps(good))
        mutate(bad)
        with pytest.raises(ValueError, match=match):
            soil_history.validate_payload(bad)


def test_a_write_replaces_the_file_whole_and_leaves_no_temporary_file(tmp_path):
    target = tmp_path / "h.json"
    daily_history.write_compact(target, {"a": [1, None]})
    assert target.read_text() == '{"a":[1,null]}\n'
    assert [p.name for p in tmp_path.iterdir()] == ["h.json"]


@pytest.mark.parametrize("name,check", [
    ("river_history.json", river_history.validate_payload),
    ("soil_moisture_history.json", soil_history.validate_payload),
])
def test_the_committed_history_files_pass_their_validators(name, check):
    check(json.loads((ROOT / name).read_text(encoding="utf-8")))


def test_the_river_refresh_writes_its_history_beside_rivers_json(tmp_path):
    import refresh_rivers
    import test_river_flow as flow
    out = tmp_path / "rivers.json"
    normals_path = flow.synthetic_normals(tmp_path)
    for _ in range(2):
        assert refresh_rivers.main([], fetch=flow.stub_fetch(), output=out, today=flow.TODAY,
                                   pause=0, normals_path=normals_path) == 0
    kept = json.loads((tmp_path / "river_history.json").read_text())
    river_history.validate_payload(kept)
    assert len(kept["gauges"]) == 7
    assert all(len(g["cfs"]) == flow.RIVER_WINDOW_DAYS for g in kept["gauges"])
    assert not (ROOT / "river_history.json").stat().st_mtime > out.stat().st_mtime
