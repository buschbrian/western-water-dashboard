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


def entry(**overrides) -> dict:
    row = json.loads(json.dumps(roster.admitted_terminal_lakes()["10288500"]))
    row.update(overrides)
    return row


def salt_lake(**overrides) -> dict:
    row = json.loads(json.dumps(roster.admitted_terminal_lakes()["great-salt-lake"]))
    row.update(overrides)
    return row


def walker_only() -> dict[str, dict]:
    """The roster as the Walker-only tests were written against it."""
    return {"10288500": roster.admitted_terminal_lakes()["10288500"]}


def target(**overrides) -> dict:
    row = {"name": "Restoration level", "authority": "A board", "decision": "Decision 1",
           "source_url": "https://example.test/order", "set_on": "2020-01-01",
           "vertical_datum": "NGVD29", "elevation_ft": 3950.0}
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


def write_roster(tmp_path, row, key=None) -> Path:
    document = json.loads((ROOT / "admitted_terminal_lakes.json").read_text())
    document["lakes"] = {key or row["station"]: row}
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


@pytest.mark.parametrize("field", ["capacity_af", "pct_of_target", "percent_of_target",
                                   "share", "denominator", "full_level_ft", "volume_af"])
def test_the_loader_refuses_a_target_stored_as_a_capacity_or_a_denominator(
        tmp_path, field):
    """ADR-159: a target is a named line, never a full level or a divisor."""
    path = write_roster(tmp_path, entry(targets=[target(**{field: 100})]))
    with pytest.raises(ValueError, match="never a capacity or a denominator"):
        roster.load_admitted_terminal_lakes(path)


@pytest.mark.parametrize("field", ["authority", "decision", "set_on", "vertical_datum"])
def test_the_loader_refuses_a_target_without_its_authority_decision_date_or_datum(
        tmp_path, field):
    row = target()
    del row[field]
    with pytest.raises(ValueError, match=f"missing {field}"):
        roster.load_admitted_terminal_lakes(write_roster(tmp_path, entry(targets=[row])))


def test_the_loader_accepts_a_named_target_with_its_authority(tmp_path):
    rows = roster.load_admitted_terminal_lakes(write_roster(tmp_path, entry(targets=[target()])))
    assert rows["10288500"]["targets"][0]["elevation_ft"] == 3950.0
    assert rows["10288500"]["targets"][0]["decision"] == "Decision 1"


def test_the_loader_accepts_an_elevation_only_lake_that_says_why(tmp_path):
    row = entry(volume_finding="No reviewed volume relation.")
    del row["volume"]
    rows = roster.load_admitted_terminal_lakes(write_roster(tmp_path, row))
    assert "volume" not in rows["10288500"]


def test_the_loader_refuses_a_missing_volume_that_is_not_explained(tmp_path):
    row = entry()
    del row["volume"]
    with pytest.raises(ValueError, match="volume_finding"):
        roster.load_admitted_terminal_lakes(write_roster(tmp_path, row))


# --- arms (ADR-159) ------------------------------------------------------

def test_great_salt_lake_is_admitted_by_arm_with_no_combined_level():
    row = roster.admitted_terminal_lakes()["great-salt-lake"]
    assert row["name"] == "Great Salt Lake"
    assert [arm["name"] for arm in row["arms"]] == ["South Arm", "North Arm"]
    assert [arm["station"] for arm in row["arms"]] == ["10010000", "10010100"]
    for arm in row["arms"]:
        assert arm["elevation"]["vertical_datum"] == "NGVD29"
        assert arm["elevation"]["parameter_code"] == "62614"
        assert arm["point"]["source_url"].startswith("https://")
        assert "volume" not in arm and arm["volume_finding"]
    assert not {"station", "lat", "lon", "elevation", "volume"} & set(row)
    assert row["closed_basin"]["huc6"] == "160203"
    assert row["targets"] == []


@pytest.mark.parametrize("field", ["elevation", "volume", "lat", "station"])
def test_the_loader_refuses_a_combined_level_or_point_on_a_lake_measured_by_arm(
        tmp_path, field):
    row = salt_lake(**{field: entry()[field]})
    with pytest.raises(ValueError, match="no level, volume or point of its own"):
        roster.load_admitted_terminal_lakes(write_roster(tmp_path, row, "great-salt-lake"))


def test_the_loader_refuses_an_arm_without_its_reviewed_point(tmp_path):
    row = salt_lake()
    del row["arms"][1]["point"]
    with pytest.raises(ValueError, match="North Arm needs a reviewed point"):
        roster.load_admitted_terminal_lakes(write_roster(tmp_path, row, "great-salt-lake"))


def test_the_loader_refuses_an_arm_without_its_datum(tmp_path):
    row = salt_lake()
    del row["arms"][0]["elevation"]["vertical_datum"]
    with pytest.raises(ValueError, match="datum"):
        roster.load_admitted_terminal_lakes(write_roster(tmp_path, row, "great-salt-lake"))


def test_the_loader_refuses_two_arms_on_one_site(tmp_path):
    row = salt_lake()
    row["arms"][1]["station"] = row["arms"][0]["station"]
    with pytest.raises(ValueError, match="its own survey site"):
        roster.load_admitted_terminal_lakes(write_roster(tmp_path, row, "great-salt-lake"))


def test_a_target_on_a_lake_measured_by_arm_names_its_arm(tmp_path):
    with pytest.raises(ValueError, match="names the arm"):
        roster.load_admitted_terminal_lakes(write_roster(
            tmp_path, salt_lake(targets=[target()]), "great-salt-lake"))
    rows = roster.load_admitted_terminal_lakes(write_roster(
        tmp_path, salt_lake(targets=[target(arm="South Arm")]), "great-salt-lake"))
    assert rows["great-salt-lake"]["targets"][0]["arm"] == "South Arm"


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


def test_walker_lake_publishes_the_fields_it_did_before_and_an_empty_arms_list():
    """ADR-159 leaves Walker Lake as it was: one site, one point, a level and a
    volume. The only new field is an empty arms list."""
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3), daily("volume_af", 1_150_000, 40_000), TODAY)
    assert list(record) == [
        "name", "water_type", "source_key", "source_label", "source_url",
        "source_station_id", "state", "lat", "lon", "data_frequency", "stale_after_days",
        "as_of", "days_stale", "is_stale", "fetch_ok", "elevation", "volume", "arms",
        "targets", "first_obs", "years_of_record"]
    assert record["source_station_id"] == "10288500" and record["arms"] == []
    assert record["volume"]["relation"]["in_use_from"] == "2014-10-01"


def test_an_elevation_only_lake_publishes_a_null_volume_and_validates():
    row = entry(volume_finding="No reviewed volume relation.")
    del row["volume"]
    record = lakes.summarize_lake(row, daily("elevation_ft", 3915, 3), None, TODAY)
    assert record["volume"] is None
    assert record["elevation"]["vertical_datum"] == "NGVD29"
    lakes.validate_payload(build([record]), {"10288500": row})


def test_an_elevation_only_lake_still_needs_its_elevation():
    row = entry(volume_finding="No reviewed volume relation.")
    del row["volume"]
    with pytest.raises(ValueError, match="elevation series is required"):
        lakes.summarize_lake(row, pd.DataFrame({"date": [], "elevation_ft": []}), None, TODAY)


def arm_series(south_stale: int = 0, north_stale: int = 0) -> dict:
    return {"10010000": (daily("elevation_ft", 4192, 1, stale_days=south_stale, seed=4), None),
            "10010100": (daily("elevation_ft", 4190, 1, stale_days=north_stale, seed=5), None)}


def test_a_lake_measured_by_arm_publishes_named_arms_and_no_combined_level():
    record = lakes.summarize_armed_lake(salt_lake(), arm_series(), TODAY)
    assert record["elevation"] is None and record["volume"] is None
    assert record["source_station_id"] is None and record["lat"] is None
    assert [arm["name"] for arm in record["arms"]] == ["South Arm", "North Arm"]
    for arm, station in zip(record["arms"], ["10010000", "10010100"]):
        assert arm["source_station_id"] == station
        assert arm["elevation"]["vertical_datum"] == "NGVD29"
        assert arm["elevation"]["statistic_id"] == "00003"
        assert arm["volume"] is None
        assert "change_365d_pct" not in arm["elevation"]
    assert not (lakes.RESERVOIR_ONLY_FIELDS & set(record))
    lakes.validate_payload(build([record]), {"great-salt-lake": salt_lake()})


def test_a_lake_measured_by_arm_is_as_current_as_its_oldest_arm():
    record = lakes.summarize_armed_lake(salt_lake(), arm_series(north_stale=5), TODAY)
    assert record["days_stale"] == 5 and record["is_stale"] is True
    assert record["as_of"] == record["arms"][1]["elevation"]["as_of"]
    quiet = lakes.summarize_armed_lake(salt_lake(), arm_series(south_stale=90), TODAY)
    payload = build([quiet])
    assert payload["lakes"] == [] and payload["withdrawn"][0]["name"] == "Great Salt Lake"


def test_the_validator_refuses_a_combined_level_beside_arms():
    record = lakes.summarize_armed_lake(salt_lake(), arm_series(), TODAY)
    record["elevation"] = record["arms"][0]["elevation"]
    with pytest.raises(ValueError, match="no combined level"):
        lakes.validate_payload(build([record]), {"great-salt-lake": salt_lake()})


@pytest.mark.parametrize("where", ["record", "elevation"])
def test_the_validator_refuses_a_share_of_a_target(where):
    record = lakes.summarize_lake(
        entry(targets=[target()]), daily("elevation_ft", 3915, 3),
        daily("volume_af", 1_150_000, 40_000), TODAY)
    (record if where == "record" else record["elevation"])["pct_of_target"] = 92.0
    with pytest.raises(ValueError, match="never a denominator"):
        lakes.validate_payload(build([record]), walker_only())


def test_the_validator_refuses_a_target_stored_as_a_capacity():
    record = lakes.summarize_lake(
        entry(targets=[target()]), daily("elevation_ft", 3915, 3),
        daily("volume_af", 1_150_000, 40_000), TODAY)
    record["targets"][0]["capacity_af"] = 100
    with pytest.raises(ValueError, match="never a capacity"):
        lakes.validate_payload(build([record]), walker_only())


def test_each_arm_is_assigned_from_its_own_point_and_the_lake_where_they_agree():
    record = lakes.summarize_armed_lake(salt_lake(), arm_series(), TODAY)
    lakes.attach_watersheds([record])
    for arm in record["arms"]:
        assert arm["huc6"] == "160203" and arm["huc8"] == "16020310"
        assert arm["huc_assignment_source"] == "published_point"
    assert record["huc6"] == "160203" and record["huc8"] == "16020310"
    assert record["in_utah"] is True
    assert "huc_assignment_point" not in record


def test_the_refresh_writes_both_lakes_and_carries_a_quiet_arm(monkeypatch, tmp_path, capsys):
    path = tmp_path / "lakes.json"

    def fetch(entry_row, *_args):
        if entry_row.get("arms"):
            return arm_series()
        return {"10288500": (daily("elevation_ft", 3915, 3),
                             daily("volume_af", 1_150_000, 40_000))}

    monkeypatch.setattr(refresh_lakes, "fetch_lake", fetch)
    monkeypatch.setattr(refresh_lakes, "LAKES_OUTPUT_PATH", path)
    monkeypatch.setattr(refresh_lakes.time, "sleep", lambda _s: None)
    monkeypatch.setattr(sys, "argv", ["refresh_lakes.py"])
    assert refresh_lakes.main() == 0, capsys.readouterr().err
    payload = json.loads(path.read_text())
    assert payload["schema_version"] == 2
    published = {r["name"]: r for r in payload["lakes"]}
    assert set(published) == {"Walker Lake", "Great Salt Lake"}
    assert published["Walker Lake"]["volume"]["unit"] == "acre_feet"
    assert [a["name"] for a in published["Great Salt Lake"]["arms"]] == ["South Arm",
                                                                         "North Arm"]

    def quiet_north(entry_row, *_args):
        series = fetch(entry_row)
        if entry_row.get("arms"):
            empty = pd.DataFrame({"date": pd.to_datetime([])})
            series["10010100"] = (empty.assign(elevation_ft=[]), None)
        return series

    monkeypatch.setattr(refresh_lakes, "fetch_lake", quiet_north)
    monkeypatch.setattr(refresh_lakes, "local_today", lambda: TODAY + pd.Timedelta(days=1))
    assert refresh_lakes.main() == 0, capsys.readouterr().err
    carried = {r["name"]: r for r in json.loads(path.read_text())["lakes"]}["Great Salt Lake"]
    assert carried["fetch_ok"] is False and carried["is_stale"] is True
    assert "North Arm elevation" in carried["fetch_error"]


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
    lakes.validate_payload(payload, walker_only())


def test_a_reservoir_field_on_a_lake_is_refused():
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3), daily("volume_af", 1_150_000, 40_000), TODAY)
    record["pct_of_capacity"] = 55.0
    with pytest.raises(ValueError, match="no full level"):
        lakes.validate_payload(build([record]), walker_only())


def test_a_quiet_lake_is_withdrawn_with_a_notice_and_no_measurement():
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3, stale_days=90),
        daily("volume_af", 1_150_000, 40_000, stale_days=90), TODAY)
    payload = build([record])
    assert payload["lakes"] == [] and payload["withdrawn_count"] == 1
    notice = payload["withdrawn"][0]
    assert set(notice) <= lakes.NOTICE_FIELDS
    assert "elevation" not in notice and "volume" not in notice
    lakes.validate_payload(payload, walker_only())


def test_a_lake_missing_from_the_payload_fails_validation():
    with pytest.raises(ValueError, match="missing \\['Walker Lake'\\]"):
        lakes.validate_payload(build([]), walker_only())


# --- the orchestrator ----------------------------------------------------

def test_carry_forward_keeps_yesterday_marked_late(monkeypatch, tmp_path):
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3), daily("volume_af", 1_150_000, 40_000), TODAY)
    previous = tmp_path / "lakes.json"
    previous.write_text(json.dumps(build([record])))
    kept = refresh_lakes.load_previous(previous)
    assert set(kept) == {"Walker Lake"}
    carried = R.carry_forward(kept["Walker Lake"], TODAY + pd.Timedelta(days=3), "down")
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
        return {"10288500": (empty.assign(elevation_ft=[]), empty.assign(volume_af=[]))}

    tomorrow = TODAY + pd.Timedelta(days=1)
    monkeypatch.setattr(refresh_lakes, "admitted_terminal_lakes", walker_only)
    monkeypatch.setattr(refresh_lakes, "fetch_lake", down)
    monkeypatch.setattr(refresh_lakes, "local_today", lambda: tomorrow)
    monkeypatch.setattr(refresh_lakes, "LAKES_OUTPUT_PATH", path)
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
    lakes.validate_payload(payload, walker_only())


def test_the_daily_script_runs_the_lake_refresh_after_snow_and_before_the_commit():
    script = (ROOT / "scripts" / "refresh-daily.sh").read_text(encoding="utf-8")
    assert "refresh_lakes.py" in script
    assert script.index("refresh_snowpack.py") < script.index("refresh_lakes.py") \
        < script.index("git commit")
    plan = subprocess.run(["bash", str(ROOT / "scripts" / "refresh-daily.sh"), "--dry-run"],
                          cwd=ROOT, capture_output=True, text=True, check=True).stdout
    assert "refresh_lakes.py" in plan and "lakes.json" in plan
