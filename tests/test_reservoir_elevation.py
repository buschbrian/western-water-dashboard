"""Reviewed reservoir surface elevation (ADR-135), on synthetic series.

Network-free: the RISE helper is stubbed where the HTTP path is under test
and everything else runs on frames built here. Nothing asserts today's
numbers; the roster is read for which reservoirs carry a level.
"""

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import refresh_reservoirs as R  # noqa: E402
from pipeline import elevation, lakes, measurement, roster  # noqa: E402

TODAY = pd.Timestamp("2026-10-27")
POWELL = "509"


def entry(**overrides) -> dict:
    row = json.loads(json.dumps(roster.admitted_reservoir_elevations()[POWELL]))
    row.update(overrides)
    return row


def levels(*, years: int = 8, end: pd.Timestamp = TODAY, seed: int = 5,
           gap: bool = False) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    idx = pd.date_range(end - pd.Timedelta(days=365 * years), end, freq="D")
    if gap:
        idx = idx[(idx < end - pd.Timedelta(days=40)) | (idx > end - pd.Timedelta(days=30))]
    doy = idx.day_of_year.to_numpy()
    values = 3550 + 30 * np.sin((doy - 100) / 365 * 2 * np.pi) + rng.normal(0, 0.3, len(idx))
    return pd.DataFrame({"date": idx, "elevation_ft": values})


def write_roster(tmp_path, row, station=POWELL) -> Path:
    document = json.loads((ROOT / "admitted_reservoir_elevations.json").read_text())
    document["reservoirs"] = {station: row}
    path = tmp_path / "roster.json"
    path.write_text(json.dumps(document))
    return path


def load(path):
    return roster.load_admitted_reservoir_elevations(path, rise_stations={POWELL})


# --- the roster ----------------------------------------------------------

def test_the_committed_roster_loads_and_names_published_reservoirs():
    rows = roster.admitted_reservoir_elevations()
    assert rows, "the elevation roster is empty"
    for station, row in rows.items():
        assert station in R.RESERVOIRS, f"{row['name']} is not a Reclamation reservoir"
        assert row["vertical_datum"] in roster.ELEVATION_DATUMS | {roster.PROJECT_DATUM}


def test_lake_mead_is_on_its_project_datum_and_claims_no_measured_offset():
    """Mead's level is tied to Reclamation's Hoover Dam powerhouse datum, by
    Reclamation's own report; no Geological Survey series exists to measure
    against, so its NAVD 1988 difference is derived and says so."""
    row = roster.admitted_reservoir_elevations()["6124"]
    assert row["vertical_datum"] == roster.PROJECT_DATUM
    assert row["datum_relation"]["datum"] == "NGVD29"
    assert row["datum_offset"] is None
    assert row["derived_offset"]["basis"].startswith("Calculated, not measured")


def test_the_loader_accepts_the_committed_entry(tmp_path):
    assert POWELL in load(write_roster(tmp_path, entry()))


@pytest.mark.parametrize("field", ["vertical_datum"])
def test_the_loader_refuses_an_entry_without_a_datum(tmp_path, field):
    row = entry()
    del row[field]
    with pytest.raises(ValueError, match="without its datum"):
        load(write_roster(tmp_path, row))


def test_the_loader_refuses_an_unknown_datum(tmp_path):
    with pytest.raises(ValueError, match="unknown vertical datum"):
        load(write_roster(tmp_path, entry(vertical_datum="local")))


MEAD_STYLE = {
    "vertical_datum": "project",
    "datum_name": "Hoover Dam powerhouse datum",
    "datum_relation": {
        "datum": "NGVD29", "add_ft": 0.55,
        "quote": "Add 0.55 feet to convert to NGVD29",
        "source_url": "https://example.gov/survey.pdf",
    },
    "datum_offset": None,
}


def test_the_loader_accepts_a_project_datum_with_its_stated_relation(tmp_path):
    assert POWELL in load(write_roster(tmp_path, entry(**MEAD_STYLE)))


@pytest.mark.parametrize("missing", ["datum_name", "datum_relation"])
def test_the_loader_refuses_a_project_datum_without_its_name_or_relation(tmp_path, missing):
    row = entry(**json.loads(json.dumps(MEAD_STYLE)))
    del row[missing]
    with pytest.raises(ValueError, match="project datum"):
        load(write_roster(tmp_path, row))


@pytest.mark.parametrize("field", ["source_url", "quote", "add_ft"])
def test_the_loader_refuses_a_project_relation_without_its_source(tmp_path, field):
    row = entry(**json.loads(json.dumps(MEAD_STYLE)))
    del row["datum_relation"][field]
    with pytest.raises(ValueError, match="stated relation"):
        load(write_roster(tmp_path, row))


def test_a_national_datum_carries_no_project_relation(tmp_path):
    row = entry(datum_relation=MEAD_STYLE["datum_relation"])
    with pytest.raises(ValueError, match="only a project datum"):
        load(write_roster(tmp_path, row))


def test_a_project_datum_travels_into_the_block_and_a_national_one_adds_nothing():
    block = elevation.summarize_elevation(entry(**MEAD_STYLE), levels())
    assert block["vertical_datum"] == "project"
    assert block["datum_name"] == "Hoover Dam powerhouse datum"
    assert block["datum_relation"]["add_ft"] == 0.55
    assert "datum_relation" not in elevation.summarize_elevation(entry(), levels())


@pytest.mark.parametrize("field", ["basis", "checked", "sources"])
def test_the_loader_refuses_a_derived_offset_without_its_basis_or_sources(tmp_path, field):
    row = json.loads(json.dumps(roster.admitted_reservoir_elevations()["6124"]))
    row["source_station_id"] = POWELL
    del row["derived_offset"][field]
    with pytest.raises(ValueError, match="derived offset|checked"):
        load(write_roster(tmp_path, row))


@pytest.mark.parametrize("field", ["source_url", "quote", "date"])
def test_the_loader_refuses_a_record_start_without_its_source(tmp_path, field):
    row = entry()
    del row["record_starts"][field]
    with pytest.raises(ValueError, match="record_starts"):
        load(write_roster(tmp_path, row))


def test_the_summary_starts_after_first_filling_and_the_history_keeps_every_day():
    frame = levels(years=8)
    start = (TODAY - pd.Timedelta(days=365 * 3)).date().isoformat()
    row = entry()
    row["record_starts"] = {**row["record_starts"], "date": start}
    block = elevation.summarize_elevation(row, frame)
    assert block["first_obs"] == start
    assert block["record_starts"]["date"] == start
    assert block["seasonal_rank_of"] == 4
    assert block["n_obs"] < len(frame)
    history = elevation.history_entry(POWELL, row, frame)
    assert history["start"] == frame["date"].iloc[0].date().isoformat()
    assert len(history["values"]) == len(frame)


def test_the_loader_refuses_an_offset_with_no_measurement_date(tmp_path):
    row = entry()
    del row["datum_offset"]["measured"]
    with pytest.raises(ValueError, match="measurement date"):
        load(write_roster(tmp_path, row))


def test_the_loader_refuses_datum_evidence_with_no_checked_date(tmp_path):
    row = entry()
    del row["datum_evidence"]["checked"]
    with pytest.raises(ValueError, match="checked"):
        load(write_roster(tmp_path, row))


@pytest.mark.parametrize("field", ["authority", "url"])
def test_the_loader_refuses_a_reference_level_without_its_authority_or_source(
        tmp_path, field):
    row = entry()
    del row["reference_levels"][0][field]
    with pytest.raises(ValueError, match="authority|HTTPS"):
        load(write_roster(tmp_path, row))


def test_the_loader_refuses_a_reference_level_spelled_as_a_share(tmp_path):
    row = entry()
    row["reference_levels"][0]["pct"] = 50
    with pytest.raises(ValueError, match="never a share"):
        load(write_roster(tmp_path, row))


def test_the_loader_refuses_a_station_off_the_reclamation_roster(tmp_path):
    row = entry(source_station_id="99999")
    with pytest.raises(ValueError, match="already on the roster"):
        roster.load_admitted_reservoir_elevations(
            write_roster(tmp_path, row, station="99999"), rise_stations={POWELL})


# --- the fetcher ---------------------------------------------------------

def test_the_rise_fetcher_names_its_value_column_and_cleans_the_same(monkeypatch):
    def fake_get(params):
        return {"data": [
            {"attributes": {"dateTime": "2020-01-01T07:00:00+00:00", "result": 3600.1}},
            {"attributes": {"dateTime": "2020-01-02T07:00:00+00:00", "result": None}},
            {"attributes": {"dateTime": "2020-01-02T07:00:00+00:00", "result": 3600.4}},
        ], "meta": {"itemsPerPage": 2000, "totalItems": 3}}

    monkeypatch.setattr(R.providers, "_get_json", fake_get)
    frame = R.fetch_rise_series(508, "19000101", "20260810", column="elevation_ft")
    assert list(frame.columns) == ["date", "elevation_ft"]
    assert frame["elevation_ft"].tolist() == [3600.1, 3600.4]
    assert list(R.fetch_rise_series(509, "20150101", "20260810").columns) == [
        "date", "storage_af"]


# --- the block -----------------------------------------------------------

def test_a_rostered_reservoir_carries_a_level_and_no_percentage():
    block = elevation.summarize_elevation(entry(), levels())
    assert block["unit"] == "ft" and block["vertical_datum"] == "NGVD29"
    assert block["source_item_id"] == 508
    assert not [key for key in block if key.endswith("_pct")]
    for window in ("7d", "30d", "365d"):
        assert block[f"change_{window}_reference_date"] is not None
        assert block[f"change_{window}_elapsed_days"] is not None
    assert block["seasonal_rank_of"] == 9
    assert block["datum_offset"]["measured"] and block["datum_offset"]["offset_ft"]
    assert all(level["authority"] and level["url"] for level in block["reference_levels"])


def test_the_block_has_the_shape_a_lake_level_has():
    """One summary for both: the lake's level block and the reservoir's
    share every measurement field, and only their provenance differs."""
    lake_entry = roster.admitted_terminal_lakes()["10288500"]
    frame = levels()
    lake = lakes.summarize_lake(
        lake_entry, frame, frame.rename(columns={"elevation_ft": "volume_af"}), TODAY)
    reservoir = elevation.summarize_elevation(entry(), frame)
    shared = measurement.summarize_measurement(
        frame.set_index("date")["elevation_ft"], frame["date"].iloc[-1],
        places=2, with_pct=False)
    for key, value in shared.items():
        assert lake["elevation"][key] == value
        assert reservoir[key] == value


def test_lake_output_is_unchanged_by_the_shared_summary():
    """Pinned before the summary moved out of `pipeline.lakes`: the same
    synthetic lake, summarised the same way, to the byte."""
    lake_entry = roster.admitted_terminal_lakes()["10288500"]
    rng = np.random.default_rng(1)
    idx = pd.date_range(TODAY - pd.Timedelta(days=365 * 6), TODAY, freq="D")
    doy = idx.day_of_year.to_numpy()
    el = 3900 + 8 * np.sin((doy - 100) / 365 * 2 * np.pi) + rng.normal(0, 0.2, len(idx))
    vol = 1.4e6 + 9e4 * np.sin((doy - 100) / 365 * 2 * np.pi) + rng.normal(0, 900, len(idx))
    record = lakes.summarize_lake(lake_entry, pd.DataFrame({"date": idx, "elevation_ft": el}),
                                  pd.DataFrame({"date": idx, "volume_af": vol}), TODAY)
    body = json.dumps({"elevation": record["elevation"], "volume": record["volume"]},
                      indent=2).encode()
    assert hashlib.sha256(body).hexdigest() == LAKE_MEASUREMENT_SHA256


# --- the run -------------------------------------------------------------

def record(station: str, name: str) -> dict:
    return {"name": name, "source_station_id": station}


def test_only_rostered_reservoirs_are_given_a_block(monkeypatch):
    monkeypatch.setattr(R, "fetch_rise_series",
                        lambda item, start, end, column: levels())
    monkeypatch.setattr(R.time, "sleep", lambda seconds: None)
    records = [record(POWELL, "Lake Powell"), record("6124", "Lake Mead")]
    history = R.refresh_elevations(records, {POWELL: entry()}, {}, {}, "20261028")
    assert "elevation" in records[0]
    assert "elevation" not in records[1]
    assert [h["source_station_id"] for h in history] == [POWELL]
    assert elevation.validate_records(records, {POWELL: entry()}) == []


def test_a_failed_elevation_fetch_keeps_yesterdays_block(monkeypatch):
    def fail(*args, **kwargs):
        raise RuntimeError("down")
    monkeypatch.setattr(R, "fetch_rise_series", fail)
    monkeypatch.setattr(R.time, "sleep", lambda seconds: None)
    yesterday = elevation.summarize_elevation(entry(), levels(end=TODAY - pd.Timedelta(days=1)))
    previous_history = {POWELL: elevation.history_entry(POWELL, entry(), levels())}
    records = [record(POWELL, "Lake Powell")]
    history = R.refresh_elevations(
        records, {POWELL: entry()}, {POWELL: {"elevation": yesterday}},
        previous_history, "20261028")
    assert records[0]["elevation"] == yesterday
    assert history == [previous_history[POWELL]]


def test_the_validator_refuses_a_block_the_roster_did_not_review():
    records = [{**record("6124", "Lake Mead"),
                "elevation": elevation.summarize_elevation(entry(), levels())}]
    with pytest.raises(ValueError, match="does not review"):
        elevation.validate_records(records, {POWELL: entry()})


def test_the_validator_refuses_a_level_with_a_percentage():
    block = elevation.summarize_elevation(entry(), levels())
    block["change_7d_pct"] = 0.2
    with pytest.raises(ValueError, match="no percentage"):
        elevation.validate_records([{**record(POWELL, "Lake Powell"), "elevation": block}],
                                   {POWELL: entry()})


def test_a_rostered_reservoir_without_a_block_is_named():
    assert elevation.validate_records(
        [record(POWELL, "Lake Powell")], {POWELL: entry()}) == ["Lake Powell"]


# --- the history payload -------------------------------------------------

def test_the_history_writes_each_day_once_and_a_missing_day_as_null():
    frame = levels(gap=True)
    item = elevation.history_entry(POWELL, entry(), frame)
    days = (pd.Timestamp(item["end"]) - pd.Timestamp(item["start"])).days + 1
    assert len(item["values"]) == days
    assert item["values"].count(None) == days - len(frame)
    assert item["values"][-1] == round(float(frame["elevation_ft"].iloc[-1]), 2)
    assert item["vertical_datum"] == "NGVD29" and item["source_item_id"] == 508
    payload = elevation.build_history_payload([item], "2026-10-27T12:00:00+00:00", TODAY)
    assert payload["schema_version"] == R.constants.ELEVATION_HISTORY_SCHEMA_VERSION
    assert payload["unit"] == "ft" and payload["run_date"] == "2026-10-27"
    elevation.validate_history_payload(payload)


def test_a_history_whose_length_disagrees_with_its_dates_is_refused():
    item = elevation.history_entry(POWELL, entry(), levels())
    item["values"].pop()
    with pytest.raises(ValueError, match="values for"):
        elevation.validate_history_payload(
            elevation.build_history_payload([item], "x", TODAY))


def test_the_committed_payloads_agree_with_the_roster():
    """What today's files must satisfy, not what they say: each rostered
    reservoir that is published carries a block, nothing else does, and the
    history names the same reservoirs."""
    payload = json.loads((ROOT / "reservoirs.json").read_text())
    rows = roster.admitted_reservoir_elevations()
    assert elevation.validate_records(payload["reservoirs"], rows) == []
    history = json.loads((ROOT / "elevation_history.json").read_text())
    elevation.validate_history_payload(history)
    published = {r["source_station_id"] for r in payload["reservoirs"]}
    assert {e["source_station_id"] for e in history["reservoirs"]} == set(rows) & published


#: sha256 of the synthetic lake's two measurement blocks, taken from the
#: summary as it was inside `pipeline.lakes` before ADR-135 shared it.
LAKE_MEASUREMENT_SHA256 = (
    "cd1c3232c87492e43e7ccf15e0176b38c91e648f007da85ff6831ddbb23bd535")
