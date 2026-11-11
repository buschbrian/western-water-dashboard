"""The natural terminal lake path (ADR-112), driven with synthetic series.

Network-free, like every pipeline test: the provider helper is stubbed where
the HTTP path is under test and the rest runs on frames built here. Nothing
asserts today's numbers; the roster is read for where a lake is, and the
payload's own fields for what it claims.
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import refresh_lakes  # noqa: E402
import refresh_reservoirs as R  # noqa: E402
from pipeline import lakes, roster  # noqa: E402

TODAY = R.local_today()


def walker_roster() -> dict[str, dict]:
    """The roster narrowed to Walker Lake, for the single-station cases."""
    return {"10288500": roster.admitted_terminal_lakes()["10288500"]}


def entry(**overrides) -> dict:
    row = json.loads(json.dumps(roster.admitted_terminal_lakes()["10288500"]))
    row.update(overrides)
    return row


def daily(column: str, base: float, amplitude: float, *, years: int = 6,
          stale_days: int = 0, seed: int = 3) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    idx = pd.date_range(TODAY - pd.Timedelta(days=365 * years),
                        TODAY - pd.Timedelta(days=stale_days), freq="D")
    doy = idx.day_of_year.to_numpy()
    values = base + amplitude * np.sin((doy - 100) / 365 * 2 * np.pi) \
        + rng.normal(0, amplitude / 50, len(idx))
    return pd.DataFrame({"date": idx, column: values})


# --- the roster ----------------------------------------------------------

def test_walker_lake_is_admitted_with_the_evidence_the_decision_asks_for():
    row = roster.admitted_terminal_lakes()["10288500"]
    assert row["name"] == "Walker Lake"
    assert row["closed_basin"]["huc6"] == "160503"
    assert row["waterbody"]["nhdplus_hr_permanent_identifier"]
    assert row["elevation"]["vertical_datum"] == "NGVD29"
    assert row["volume"]["relation"]["source_url"].startswith("https://")
    assert "capacity" not in row


def test_a_malformed_lake_roster_never_reaches_the_reservoir_refresh():
    """ADR-118 keeps the refreshes independent: importing the reservoir
    orchestrator must not read the lake roster, so a lake roster that fails
    review costs the lake payload and nothing else."""
    probe = """
import pathlib
real = pathlib.Path.read_text
def guarded(self, *args, **kwargs):
    if self.name == "admitted_terminal_lakes.json":
        return '{"water_type": "reservoir", "lakes": {}}'
    return real(self, *args, **kwargs)
pathlib.Path.read_text = guarded
import refresh_reservoirs
from pipeline import roster
try:
    roster.admitted_terminal_lakes()
except ValueError:
    print("lake roster refused on first use")
"""
    result = subprocess.run([sys.executable, "-c", probe], cwd=ROOT,
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert "lake roster refused on first use" in result.stdout


def test_walker_lake_stays_out_of_every_reservoir_roster():
    """One water, one type: the survey site is withheld as a reservoir and
    admitted as a lake, never both."""
    assert "10288500" not in R.ADMITTED_USGS_RESERVOIRS
    assert "Walker Lake" not in R.ALL_RESERVOIR_NAMES


def write_roster(tmp_path, row) -> Path:
    document = json.loads((ROOT / "admitted_terminal_lakes.json").read_text())
    document["lakes"] = {row["station"]: row}
    path = tmp_path / "admitted_terminal_lakes.json"
    path.write_text(json.dumps(document))
    return path


def test_the_loader_refuses_a_capacity_on_a_lake(tmp_path):
    path = write_roster(tmp_path, entry(capacity={"capacity_af": 1}))
    with pytest.raises(ValueError, match="no capacity"):
        roster.load_admitted_terminal_lakes(path)


def test_the_loader_refuses_an_elevation_without_its_datum(tmp_path):
    row = entry()
    del row["elevation"]["vertical_datum"]
    with pytest.raises(ValueError, match="datum"):
        roster.load_admitted_terminal_lakes(write_roster(tmp_path, row))


def test_the_loader_refuses_a_volume_without_its_relation(tmp_path):
    row = entry()
    del row["volume"]["relation"]
    with pytest.raises(ValueError, match="relation"):
        roster.load_admitted_terminal_lakes(write_roster(tmp_path, row))


def test_the_loader_refuses_a_target_spelled_as_a_capacity(tmp_path):
    target = {"name": "Restoration level", "authority": "A board",
              "source_url": "https://example.test/order", "set_on": "2020-01-01",
              "elevation_ft": 3950.0, "capacity_af": 100}
    with pytest.raises(ValueError, match="never a capacity"):
        roster.load_admitted_terminal_lakes(write_roster(tmp_path, entry(targets=[target])))


def test_the_loader_accepts_a_named_target_with_its_authority(tmp_path):
    target = {"name": "Restoration level", "authority": "A board",
              "source_url": "https://example.test/order", "set_on": "2020-01-01",
              "elevation_ft": 3950.0}
    rows = roster.load_admitted_terminal_lakes(write_roster(tmp_path, entry(targets=[target])))
    assert rows["10288500"]["targets"][0]["elevation_ft"] == 3950.0


def test_the_loader_needs_a_reviewed_closed_basin(tmp_path):
    row = entry()
    row["closed_basin"].pop("reviewed")
    with pytest.raises(ValueError, match="closed_basin.reviewed"):
        roster.load_admitted_terminal_lakes(write_roster(tmp_path, row))


# --- the provider --------------------------------------------------------

def feature(day, value, *, parameter="00062", unit="ft", statistic="32400",
            site="10288500"):
    return {"type": "Feature", "properties": {
        "monitoring_location_id": f"USGS-{site}", "parameter_code": parameter,
        "statistic_id": statistic, "time": day, "value": value,
        "unit_of_measure": unit}}


def test_elevation_is_read_from_the_same_collection_in_its_own_unit(monkeypatch):
    calls = []
    monkeypatch.setattr(R.providers, "_get_usgs_json",
                        lambda url, params=None: calls.append(params) or {
                            "features": [
                                feature("2026-08-10", "3915.10"),
                                feature("2026-08-11", "3915.05", unit="Acre-ft"),
                                feature("2026-08-12", "3915.00", parameter="00054"),
                                feature("2026-08-13", "3914.95", statistic="00003"),
                                feature("2026-08-14", "3914.90"),
                            ], "links": []})
    frame = R.providers.fetch_usgs_parameter_series(
        "10288500", "00062", "32400", "ft", "20260801", "20260831",
        column="elevation_ft")
    assert list(frame.columns) == ["date", "elevation_ft"]
    assert frame["elevation_ft"].tolist() == [3915.10, 3914.90]
    assert calls[0]["parameter_code"] == "00062"


def test_the_storage_fetcher_is_the_general_one_with_storage_filled_in(monkeypatch):
    monkeypatch.setattr(R.providers, "_get_usgs_json", lambda url, params=None: {
        "features": [feature("2026-08-10", "1153000", parameter="00054", unit="Acre-ft")],
        "links": []})
    frame = R.fetch_usgs_series("10288500", "32400", "20260801", "20260831")
    assert list(frame.columns) == ["date", "storage_af"]
    assert frame["storage_af"].tolist() == [1153000.0]


# --- the record ----------------------------------------------------------

def test_a_lake_record_publishes_levels_and_volumes_and_no_full_level():
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3), daily("volume_af", 1_150_000, 40_000), TODAY)
    assert record["water_type"] == "natural_terminal_lake"
    assert not (lakes.RESERVOIR_ONLY_FIELDS & set(record))
    assert record["elevation"]["vertical_datum"] == "NGVD29"
    assert record["elevation"]["unit"] == "ft"
    assert record["volume"]["unit"] == "acre_feet"
    assert record["volume"]["relation"]["source_url"].startswith("https://")
    # A level has no percentage change; a volume does.
    assert "change_365d_pct" not in record["elevation"]
    assert "change_365d_pct" in record["volume"]
    assert record["elevation"]["change_365d_reference_date"] is not None
    assert record["volume"]["monthly"], "the twelve-month history is published"
    assert record["targets"] == []
    assert record["is_stale"] is False


def test_a_lake_record_ranks_each_measurement_against_prior_years_only():
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3), daily("volume_af", 1_150_000, 40_000), TODAY)
    frames = {"elevation": daily("elevation_ft", 3915, 3),
              "volume": daily("volume_af", 1_150_000, 40_000)}
    for block, frame in frames.items():
        rank, of = record[block]["seasonal_rank"], record[block]["seasonal_rank_of"]
        assert 1 <= rank <= of
        # The same estimator the reservoirs use, unchanged: one vote per prior
        # window instance, plus this reading.
        series = frame.set_index("date").iloc[:, 0]
        prior = R.prior_annual_seasonal_values(series, series.index[-1])
        assert of == len(prior) + 1


def test_the_record_is_as_current_as_its_older_measurement():
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3),
        daily("volume_af", 1_150_000, 40_000, stale_days=5), TODAY)
    assert record["days_stale"] == 5
    assert record["is_stale"] is True
    assert record["as_of"] == record["volume"]["as_of"]


def test_a_lake_needs_both_series():
    with pytest.raises(ValueError, match="both series"):
        lakes.summarize_lake(entry(), daily("elevation_ft", 3915, 3),
                             pd.DataFrame({"date": [], "volume_af": []}), TODAY)


def test_the_assignment_comes_from_the_lake_point_and_says_so():
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3), daily("volume_af", 1_150_000, 40_000), TODAY)
    lakes.attach_watersheds([record])
    row = roster.admitted_terminal_lakes()["10288500"]
    assert record["huc6"] == row["closed_basin"]["huc6"]
    assert record["huc8"] == row["closed_basin"]["huc8"]
    assert record["huc_assignment_source"] == "published_point"


# --- the payload ---------------------------------------------------------

def build(records):
    return lakes.build_payload(records, TODAY, "2026-09-06T12:00:00+00:00")


def test_the_payload_names_its_type_and_versions_and_validates():
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3), daily("volume_af", 1_150_000, 40_000), TODAY)
    payload = build([record])
    assert payload["water_type"] == "natural_terminal_lake"
    assert payload["schema_version"] == R.constants.LAKE_SCHEMA_VERSION
    assert payload["method_version"] == R.METHOD_VERSION
    assert payload["lake_count"] == 1 and payload["withdrawn_count"] == 0
    lakes.validate_payload(payload, walker_roster())


def test_a_reservoir_field_on_a_lake_is_refused():
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3), daily("volume_af", 1_150_000, 40_000), TODAY)
    record["pct_of_capacity"] = 55.0
    with pytest.raises(ValueError, match="no full level"):
        lakes.validate_payload(build([record]), walker_roster())


def test_a_quiet_lake_is_withdrawn_with_a_notice_and_no_measurement():
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3, stale_days=90),
        daily("volume_af", 1_150_000, 40_000, stale_days=90), TODAY)
    payload = build([record])
    assert payload["lakes"] == [] and payload["withdrawn_count"] == 1
    notice = payload["withdrawn"][0]
    assert set(notice) <= lakes.NOTICE_FIELDS
    assert "elevation" not in notice and "volume" not in notice
    lakes.validate_payload(payload, walker_roster())


def test_a_lake_missing_from_the_payload_fails_validation():
    with pytest.raises(ValueError, match="missing \\['Walker Lake'\\]"):
        lakes.validate_payload(build([]), walker_roster())


# --- the orchestrator ----------------------------------------------------

def test_carry_forward_keeps_yesterday_marked_late(monkeypatch, tmp_path):
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3), daily("volume_af", 1_150_000, 40_000), TODAY)
    previous = tmp_path / "lakes.json"
    previous.write_text(json.dumps(build([record])))
    kept = refresh_lakes.load_previous(previous)
    assert set(kept) == {"10288500"}
    carried = R.carry_forward(kept["10288500"], TODAY + pd.Timedelta(days=3), "down")
    assert carried["is_stale"] is True and carried["fetch_ok"] is False
    assert carried["elevation"]["current"] == record["elevation"]["current"]


@pytest.mark.parametrize("outage", ["raises", "empty"])
def test_a_withdrawn_lake_stays_withdrawn_while_its_feed_is_down(
        monkeypatch, tmp_path, capsys, outage):
    """Day N withdraws the lake; on day N+1 the feed is still down and there
    is no record to carry, only the notice. Without carrying it the roster
    check failed and lakes.json froze on day N."""
    quiet = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3, stale_days=90),
        daily("volume_af", 1_150_000, 40_000, stale_days=90), TODAY)
    path = tmp_path / "lakes.json"
    path.write_text(json.dumps(build([quiet])))
    day_before = json.loads(path.read_text())["withdrawn"][0]

    def down(*_args):
        if outage == "raises":
            raise ConnectionError("feed down")
        empty = pd.DataFrame({"date": pd.to_datetime([])})
        return empty.assign(elevation_ft=[]), empty.assign(volume_af=[])

    tomorrow = TODAY + pd.Timedelta(days=1)
    monkeypatch.setattr(refresh_lakes, "fetch_lake", down)
    monkeypatch.setattr(refresh_lakes, "local_today", lambda: tomorrow)
    monkeypatch.setattr(refresh_lakes, "LAKES_OUTPUT_PATH", path)
    monkeypatch.setattr(refresh_lakes, "admitted_terminal_lakes", walker_roster)
    monkeypatch.setattr(sys, "argv", ["refresh_lakes.py"])
    assert refresh_lakes.main() == 0, capsys.readouterr().err

    payload = json.loads(path.read_text())
    assert payload["run_date"] == tomorrow.date().isoformat()
    assert payload["lakes"] == [] and payload["withdrawn_count"] == 1
    notice = payload["withdrawn"][0]
    assert set(notice) <= lakes.NOTICE_FIELDS
    assert notice["name"] == "Walker Lake"
    assert notice["as_of"] == day_before["as_of"]
    assert notice["days_stale"] == day_before["days_stale"] + 1
    lakes.validate_payload(payload, walker_roster())


def test_the_daily_script_runs_the_lake_refresh_after_snow_and_before_the_commit():
    script = (ROOT / "scripts" / "refresh-daily.sh").read_text(encoding="utf-8")
    assert "refresh_lakes.py" in script
    assert script.index("refresh_snowpack.py") < script.index("refresh_lakes.py") \
        < script.index("git commit")
    plan = subprocess.run(["bash", str(ROOT / "scripts" / "refresh-daily.sh"), "--dry-run"],
                          cwd=ROOT, capture_output=True, text=True, check=True).stdout
    assert "refresh_lakes.py" in plan and "lakes.json" in plan


# --- a lake measured in arms, and a lake with no volume (ADR-166) --------

GSL = ("10010000", "10010100")


def gsl_roster() -> dict[str, dict]:
    full = roster.admitted_terminal_lakes()
    return {station: full[station] for station in GSL}


def arm_record(station: str, *, stale_days: int = 0, base: float = 4190.0) -> dict:
    return lakes.summarize_lake(
        roster.admitted_terminal_lakes()[station],
        daily("elevation_ft", base, 1.5, stale_days=stale_days), None, TODAY)


def test_great_salt_lake_is_admitted_as_two_arms_with_their_own_stations():
    rows = gsl_roster()
    assert [rows[s]["arm"]["name"] for s in GSL] == ["South arm", "North arm"]
    for station, row in rows.items():
        assert row["name"] == "Great Salt Lake" and row["station"] == station
        assert row["elevation"]["parameter_code"] == "62614"
        assert row["elevation"]["vertical_datum"] == "NGVD29"
        assert row["elevation"]["datum_review"]["parameter_definition"].endswith("NGVD29")
        assert "volume" not in row and row["no_volume"]
        assert row["arm"]["source_url"].startswith("https://www.usgs.gov/")
        assert row["closed_basin"]["huc8"] == "16020310"
        assert row["targets"] == []
    # One NHDPlus HR polygon for both: the arms are told apart by station.
    assert len({r["waterbody"]["nhdplus_hr_permanent_identifier"] for r in rows.values()}) == 1
    document = json.loads((ROOT / "admitted_terminal_lakes.json").read_text())
    assert "Great Salt Lake" not in document["withheld"]


def test_great_salt_lake_stays_out_of_every_reservoir_roster():
    for station in GSL:
        assert station not in R.ADMITTED_USGS_RESERVOIRS
    assert "Great Salt Lake" not in R.ALL_RESERVOIR_NAMES


def write_rows(tmp_path, rows: dict[str, dict]) -> Path:
    document = json.loads((ROOT / "admitted_terminal_lakes.json").read_text())
    document["lakes"] = rows
    path = tmp_path / "admitted_terminal_lakes.json"
    path.write_text(json.dumps(document))
    return path


def test_the_loader_needs_a_volume_or_the_reason_there_is_none(tmp_path):
    rows = json.loads(json.dumps(gsl_roster()))
    del rows["10010000"]["no_volume"]
    with pytest.raises(ValueError, match="no_volume reason"):
        roster.load_admitted_terminal_lakes(write_rows(tmp_path, rows))
    row = entry(no_volume="also a reason")
    with pytest.raises(ValueError, match="exactly one"):
        roster.load_admitted_terminal_lakes(write_roster(tmp_path, row))


@pytest.mark.parametrize("fault, message", [
    ("one arm", "one of its parts"),
    ("unnamed arm", "must each name the arm"),
    ("same arm twice", "its own name"),
    ("targets differ", "disagree on the lake's targets"),
])
def test_the_loader_holds_the_arms_of_one_lake_together(tmp_path, fault, message):
    rows = json.loads(json.dumps(gsl_roster()))
    south, north = rows["10010000"], rows["10010100"]
    if fault == "one arm":
        del rows["10010100"]
    elif fault == "unnamed arm":
        del north["arm"]
    elif fault == "same arm twice":
        north["arm"]["name"] = south["arm"]["name"]
    else:
        north["targets"] = [{"name": "A level", "authority": "A board",
                             "source_url": "https://example.test/plan",
                             "set_on": "2023-01-01", "elevation_ft": 4198.0}]
    with pytest.raises(ValueError, match=message):
        roster.load_admitted_terminal_lakes(write_rows(tmp_path, rows))


def test_a_lake_with_no_volume_publishes_its_level_alone():
    record = arm_record("10010000")
    assert "volume" not in record
    assert record["elevation"]["parameter_code"] == "62614"
    assert record["elevation"]["vertical_datum"] == "NGVD29"
    assert record["as_of"] == record["elevation"]["as_of"]
    assert record["first_obs"] == record["elevation"]["first_obs"]


def test_the_arms_are_one_lake_with_no_lake_wide_value():
    south, north = arm_record("10010000"), arm_record("10010100", stale_days=4, base=4189)
    walker = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3), daily("volume_af", 1_150_000, 40_000), TODAY)
    walker_before = json.dumps(walker)
    grouped = lakes.group_arms([north, walker, south], roster.admitted_terminal_lakes())
    assert [r["name"] for r in grouped] == ["Walker Lake", "Great Salt Lake"]
    assert json.dumps(grouped[0]) == walker_before
    lake = grouped[1]
    assert not (lakes.ARM_ONLY_FIELDS & set(lake))
    assert [arm["arm"] for arm in lake["arms"]] == ["South arm", "North arm"]
    assert [arm["source_station_id"] for arm in lake["arms"]] == list(GSL)
    assert lake["as_of"] == north["as_of"] and lake["days_stale"] == 4
    assert lake["is_stale"] is True
    assert lake["arms"][0]["elevation"] == south["elevation"]
    assert all("name" not in arm and "targets" not in arm for arm in lake["arms"])
    assert lake["state"] == "UT" and lake["targets"] == []
    payload = build(grouped)
    assert payload["lake_count"] == 2 and payload["stale_count"] == 1
    lakes.validate_payload(payload, roster.admitted_terminal_lakes())


def test_a_lake_missing_an_arm_is_not_published_as_its_other_arm():
    grouped = lakes.group_arms([arm_record("10010000")], gsl_roster())
    assert grouped == []
    with pytest.raises(ValueError, match="missing \\['Great Salt Lake'\\]"):
        lakes.validate_payload(build(grouped), gsl_roster())


@pytest.mark.parametrize("fault, message", [
    ("lake-wide level", "no lake-wide value"),
    ("arm volume", "no volume series"),
    ("arms reordered", "do not match"),
    ("flattened", "published with them"),
])
def test_the_validator_refuses_a_collapsed_or_reshaped_lake(fault, message):
    lake = lakes.group_arms([arm_record("10010000"), arm_record("10010100")],
                            gsl_roster())[0]
    if fault == "lake-wide level":
        lake["elevation"] = lake["arms"][0]["elevation"]
    elif fault == "arm volume":
        lake["arms"][1]["volume"] = {"current": 1.0}
    elif fault == "arms reordered":
        lake["arms"].reverse()
    else:
        lake = lakes.flatten_arms(lake)[0]
    with pytest.raises(ValueError, match=message):
        lakes.validate_payload(build([lake]), gsl_roster())


def test_flattening_and_regrouping_a_lake_gives_it_back_unchanged():
    lake = lakes.group_arms([arm_record("10010000"), arm_record("10010100")],
                            gsl_roster())[0]
    again = lakes.group_arms(lakes.flatten_arms(json.loads(json.dumps(lake))), gsl_roster())
    assert again == [lake]


def run_refresh(monkeypatch, path, today, fetch):
    monkeypatch.setattr(refresh_lakes, "fetch_lake", fetch)
    monkeypatch.setattr(refresh_lakes, "local_today", lambda: today)
    monkeypatch.setattr(refresh_lakes, "LAKES_OUTPUT_PATH", path)
    monkeypatch.setattr(refresh_lakes, "admitted_terminal_lakes", gsl_roster)
    monkeypatch.setattr(refresh_lakes.time, "sleep", lambda _s: None)
    monkeypatch.setattr(sys, "argv", ["refresh_lakes.py"])
    return refresh_lakes.main()


def test_one_quiet_arm_is_carried_forward_and_its_lake_is_late(monkeypatch, tmp_path, capsys):
    path = tmp_path / "lakes.json"
    path.write_text(json.dumps(build(lakes.group_arms(
        [arm_record("10010000"), arm_record("10010100")], gsl_roster()))))
    tomorrow = TODAY + pd.Timedelta(days=3)

    def north_down(station, entry, start, end):
        if station == "10010100":
            raise ConnectionError("feed down")
        frame = daily("elevation_ft", 4190, 1.5)
        frame = pd.concat([frame, pd.DataFrame(
            {"date": [tomorrow], "elevation_ft": [4190.0]})], ignore_index=True)
        return frame, None

    assert run_refresh(monkeypatch, path, tomorrow, north_down) == 0, capsys.readouterr().err
    payload = json.loads(path.read_text())
    lake = payload["lakes"][0]
    south, north = lake["arms"]
    assert south["fetch_ok"] is True and south["days_stale"] == 0
    assert north["fetch_ok"] is False and north["is_stale"] is True
    assert north["days_stale"] == 3 and "feed down" in north["fetch_error"]
    assert lake["is_stale"] is True and lake["fetch_ok"] is False
    lakes.validate_payload(payload, gsl_roster())


def test_an_arm_past_the_window_withdraws_the_whole_lake(monkeypatch, tmp_path, capsys):
    """The lake is as current as its oldest arm, as Walker Lake is as current
    as its older measurement: one arm is never published as the lake."""
    path = tmp_path / "lakes.json"

    def north_quiet(station, entry, start, end):
        stale = 90 if station == "10010100" else 0
        return daily("elevation_ft", 4190, 1.5, stale_days=stale), None

    assert run_refresh(monkeypatch, path, TODAY, north_quiet) == 0, capsys.readouterr().err
    payload = json.loads(path.read_text())
    assert payload["lakes"] == [] and payload["withdrawn_count"] == 1
    notice = payload["withdrawn"][0]
    assert notice["name"] == "Great Salt Lake" and set(notice) <= lakes.NOTICE_FIELDS

    def both_down(*_args):
        raise ConnectionError("feed down")

    tomorrow = TODAY + pd.Timedelta(days=1)
    assert run_refresh(monkeypatch, path, tomorrow, both_down) == 0, capsys.readouterr().err
    payload = json.loads(path.read_text())
    assert [n["name"] for n in payload["withdrawn"]] == ["Great Salt Lake"]
    lakes.validate_payload(payload, gsl_roster())


def test_walker_lake_keeps_its_record_fields_in_their_order():
    """Schema 2 adds `arms` and makes the volume optional; a lake with one
    station and a volume publishes exactly the fields it did under 1."""
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3), daily("volume_af", 1_150_000, 40_000), TODAY)
    assert list(record) == [
        "name", "water_type", "source_key", "source_label", "source_url",
        "source_station_id", "state", "lat", "lon", "data_frequency",
        "stale_after_days", "as_of", "days_stale", "is_stale", "fetch_ok",
        "elevation", "volume", "targets", "first_obs", "years_of_record"]
