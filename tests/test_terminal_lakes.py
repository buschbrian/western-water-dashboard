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
    row = json.loads(json.dumps(roster.ADMITTED_TERMINAL_LAKES["10288500"]))
    row.update(overrides)
    return row


def daily(column: str, base: float, amplitude: float, *, years: int = 6,
          stale_days: int = 0, seed: int = 3) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    idx = pd.date_range(TODAY - pd.Timedelta(days=365 * years),
                        TODAY - pd.Timedelta(days=stale_days), freq="D")
    doy = idx.dayofyear.to_numpy()
    values = base + amplitude * np.sin((doy - 100) / 365 * 2 * np.pi) \
        + rng.normal(0, amplitude / 50, len(idx))
    return pd.DataFrame({"date": idx, column: values})


# --- the roster ----------------------------------------------------------

def test_walker_lake_is_admitted_with_the_evidence_the_decision_asks_for():
    row = roster.ADMITTED_TERMINAL_LAKES["10288500"]
    assert row["name"] == "Walker Lake"
    assert row["closed_basin"]["huc6"] == "160503"
    assert row["waterbody"]["nhdplus_hr_permanent_identifier"]
    assert row["elevation"]["vertical_datum"] == "NGVD29"
    assert row["volume"]["relation"]["source_url"].startswith("https://")
    assert "capacity" not in row


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
    row = roster.ADMITTED_TERMINAL_LAKES["10288500"]
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
    lakes.validate_payload(payload, roster.ADMITTED_TERMINAL_LAKES)


def test_a_reservoir_field_on_a_lake_is_refused():
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3), daily("volume_af", 1_150_000, 40_000), TODAY)
    record["pct_of_capacity"] = 55.0
    with pytest.raises(ValueError, match="no full level"):
        lakes.validate_payload(build([record]), roster.ADMITTED_TERMINAL_LAKES)


def test_a_quiet_lake_is_withdrawn_with_a_notice_and_no_measurement():
    record = lakes.summarize_lake(
        entry(), daily("elevation_ft", 3915, 3, stale_days=90),
        daily("volume_af", 1_150_000, 40_000, stale_days=90), TODAY)
    payload = build([record])
    assert payload["lakes"] == [] and payload["withdrawn_count"] == 1
    notice = payload["withdrawn"][0]
    assert set(notice) <= lakes.NOTICE_FIELDS
    assert "elevation" not in notice and "volume" not in notice
    lakes.validate_payload(payload, roster.ADMITTED_TERMINAL_LAKES)


def test_a_lake_missing_from_the_payload_fails_validation():
    with pytest.raises(ValueError, match="missing \\['Walker Lake'\\]"):
        lakes.validate_payload(build([]), roster.ADMITTED_TERMINAL_LAKES)


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


def test_the_daily_script_runs_the_lake_refresh_after_snow_and_before_the_commit():
    script = (ROOT / "scripts" / "refresh-daily.sh").read_text(encoding="utf-8")
    assert "refresh_lakes.py" in script
    assert script.index("refresh_snowpack.py") < script.index("refresh_lakes.py") \
        < script.index("git commit")
    plan = subprocess.run(["bash", str(ROOT / "scripts" / "refresh-daily.sh"), "--dry-run"],
                          cwd=ROOT, capture_output=True, text=True, check=True).stdout
    assert "refresh_lakes.py" in plan and "lakes.json" in plan
