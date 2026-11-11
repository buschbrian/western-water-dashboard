"""The tests ADR-158 admits a reading by, and the batch they write.

Nothing here touches the network: the provider fetch is stubbed in
`pipeline.providers`, as `tests/AGENTS.md` asks, and the rest runs on synthetic
series.
"""

import json
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from pipeline import providers  # noqa: E402
from pipeline.roster import load_excluded_readings  # noqa: E402
from tools import batch_mechanical_exclusions as batch  # noqa: E402


def series_of(values, start="2022-03-01", excluded=()):
    """A daily series as the tool reads one: stamp, day, value, excluded."""
    days = pd.date_range(start, periods=len(values))
    return [{"stamp": f"{day.year}-{day.month}-{day.day} 00:00", "day": day,
             "value": float(value), "excluded": index in excluded}
            for index, (day, value) in enumerate(zip(days, values))]


def verdict(values, at, **kwargs):
    series = series_of(values, **kwargs)
    return batch.assess(series, series[at]["day"], float(values[at]), "daily")


# --- the three tests ---------------------------------------------------------

def test_a_zero_between_two_nonzero_days_is_a_mechanical_error():
    result = verdict([8100, 0, 8115], 1)
    assert result["admitted"]
    assert result["members"][0]["test"] == "zero"


def test_a_zero_beside_a_zero_neighbour_is_not_the_zero_test():
    assert batch.zero_test(0, 0, 8115) is None
    assert batch.zero_test(5, 8100, 8115) is None


def test_a_monthly_zero_is_not_the_zero_test():
    """ADR-152 names a daily reading of 0; Fairmont's monthly zero stays individual."""
    assert batch.zero_test(0, 8100, 8115, "monthly") is None
    assert batch.mechanical_test(0, 8100, 8115, "monthly") is None
    series = [
        {"stamp": "2020-9", "day": pd.Timestamp("2020-09-30"), "value": 8100.0, "excluded": False},
        {"stamp": "2020-10", "day": pd.Timestamp("2020-10-31"), "value": 0.0, "excluded": False},
        {"stamp": "2020-11", "day": pd.Timestamp("2020-11-30"), "value": 8115.0, "excluded": False},
    ]
    assert not batch.assess(series, series[1]["day"], 0.0, "monthly")["admitted"]


def test_a_power_of_ten_shift_needs_neighbours_that_agree():
    assert batch.power_of_ten_test(3111, 30964, 30584)[0] == "power-of-ten shift"
    assert batch.power_of_ten_test(277789, 27378, 27614)[0] == "power-of-ten shift"
    assert batch.power_of_ten_test(342, 342770, 341024)[0] == "power-of-ten shift"
    assert batch.power_of_ten_test(3111, 30964, 20000) is None, \
        "neighbours that differ by more than 10 percent are a real change, not a shift"


def test_a_power_of_ten_shift_must_land_between_the_neighbours_with_two_percent():
    assert batch.power_of_ten_test(2940, 30000, 30100) is not None, "2 percent below the low neighbour"
    assert batch.power_of_ten_test(2900, 30000, 30100) is None, "more than 2 percent below"
    assert batch.power_of_ten_test(3200, 30000, 30100) is None


def test_one_digit_dropped_or_added_is_found_in_both_directions():
    assert batch.one_digit_test(3257, 13257, 14253)[0] == "one digit dropped or added"
    assert batch.one_digit_test(4128, 44184, 42866)[0] == "one digit dropped or added"
    assert batch.one_digit_test(99999, 9999, 9990) is not None, "a digit added"


def test_a_changed_digit_is_not_one_digit_dropped_or_added():
    """Grant Lake's 82,410 becomes 22,410 only by changing a digit (ADR-152)."""
    assert batch.one_digit_test(82410, 47575, 47525) is None


def test_the_digit_test_needs_a_reading_of_a_thousand_and_whole_acre_feet():
    assert batch.one_digit_test(327, 1327, 1400) is None
    assert batch.one_digit_test(3257.5, 13257, 14253) is None


def test_the_test_that_fires_is_the_first_of_zero_then_power_then_digit():
    assert batch.mechanical_test(0, 8100, 8115)[0] == "zero"
    assert batch.mechanical_test(3111, 30964, 30584)[0] == "power-of-ten shift"
    assert batch.mechanical_test(3257, 13257, 14253)[0] == "one digit dropped or added"
    assert batch.mechanical_test(9000, 8100, 8115) is None


# --- ADR-158's three conditions --------------------------------------------

def test_a_reading_that_meets_no_test_is_dropped_with_the_neighbours_named():
    result = verdict([8100, 9776, 8115], 1)
    assert not result["admitted"]
    assert "no ADR-152 test" in result["why"] and "8,100" in result["why"]


def test_a_run_of_three_at_one_value_is_never_admitted():
    for length in (3, 7, 15):
        result = verdict([8100] + [0] * length + [8115], 1)
        assert not result["admitted"]
        assert f"{length} consecutive readings" in result["why"]


def test_a_run_of_two_is_one_unit_and_each_member_skips_the_other():
    """Strictly, neither zero is between non-zero days until the other is gone."""
    result = verdict([25318, 0, 0, 24488], 1)
    assert result["admitted"]
    assert [member["day"].day for member in result["members"]] == [2, 3]
    assert all(member["before"]["value"] == 25318 and member["after"]["value"] == 24488
               for member in result["members"])


def test_a_group_is_written_whole_or_not_at_all():
    """The first zero has its before-neighbour 15 days back; the second has it 16."""
    series = series_of([25318, 0, 0, 24488])
    series[0]["day"] = series[1]["day"] - pd.Timedelta(days=14)
    assert batch.assess(series, series[1]["day"], 0.0, "daily")["admitted"]
    series[0]["day"] = series[1]["day"] - pd.Timedelta(days=15)
    assert not batch.assess(series, series[1]["day"], 0.0, "daily")["admitted"]


def test_a_reading_changed_at_the_provider_is_not_admitted():
    series = series_of([8100, 0, 8115])
    result = batch.assess(series, series[1]["day"], 12.0, "daily")
    assert not result["admitted"] and "changed or absent" in result["why"]
    absent = batch.assess(series, pd.Timestamp("2030-01-01"), 0.0, "daily")
    assert not absent["admitted"]


def test_a_neighbour_beyond_fifteen_days_does_not_count():
    series = series_of([8100, 0, 8115])
    series[2]["day"] = series[1]["day"] + pd.Timedelta(days=16)
    assert not batch.assess(series, series[1]["day"], 0.0, "daily")["admitted"]
    series[2]["day"] = series[1]["day"] + pd.Timedelta(days=15)
    assert batch.assess(series, series[1]["day"], 0.0, "daily")["admitted"]


def test_a_monthly_neighbour_may_be_three_months_away():
    middle = pd.Timestamp("2020-03-31")
    assert batch.within(middle, pd.Timestamp("2020-06-30"), "monthly")
    assert not batch.within(middle, pd.Timestamp("2020-07-01"), "monthly")
    assert batch.within(middle, pd.Timestamp("2019-12-31"), "monthly")


def test_an_excluded_reading_is_never_a_neighbour_but_still_counts_toward_a_run():
    series = series_of([8100, 0, 7000, 8115], excluded={2})
    result = batch.assess(series, series[1]["day"], 0.0, "daily")
    assert result["admitted"]
    assert result["members"][0]["after"]["value"] == 8115

    run = series_of([8100, 0, 0, 0, 8115], excluded={2})
    assert not batch.assess(run, run[1]["day"], 0.0, "daily")["admitted"]


def test_a_neighbour_missing_on_either_side_admits_nothing():
    series = series_of([0, 8115])
    assert not batch.assess(series, series[0]["day"], 0.0, "daily")["admitted"]


# --- the record it writes --------------------------------------------------

def test_the_reason_is_generated_from_the_test_and_names_both_neighbours():
    result = verdict([13257, 3257, 14253], 1)
    reason = batch.build_reason(result["members"][0], "2026-11-11")
    assert "one digit dropped or added" in reason
    assert "3,257 acre-feet between 13,257 on 2022-03-01 and 14,253 on 2022-03-03" in reason
    assert "2026-11-11" in reason


def test_the_record_carries_the_seven_fields_and_the_provider_placeholder():
    member = verdict([8100, 0, 8115], 1)["members"][0]
    cdec = batch.exclusion_record("cdec", "ELC", "daily", member, "2026-11-11")
    assert set(cdec) == {"sensor", "stamp", "value", "reason", "source_url",
                         "reviewed_on", "issue_url"}
    assert cdec["sensor"] == 15 and cdec["stamp"] == "2022-3-2 00:00" and cdec["value"] == 0
    assert cdec["issue_url"].endswith("/issues/BATCH-CDEC")
    assert "Stations=ELC&SensorNums=15&dur_code=D&Start=2022-03-01&End=2022-03-03" \
        in cdec["source_url"]
    awdb = batch.exclusion_record("awdb", "09009040:CO:BOR", "daily", member, "2026-11-11")
    assert awdb["sensor"] == "09009040:CO:BOR"
    assert awdb["issue_url"].endswith("/issues/BATCH-AWDB")
    assert awdb["source_url"].startswith("https://") and "RESC" in awdb["source_url"]


def test_the_candidates_are_the_adr152_items_of_a_record_check_file(tmp_path):
    items = [
        {"station": "ELC", "provider": "cdec", "cadence": "daily", "date": "2024-08-27",
         "value": 0.0, "rule_fired": "adr152_zero", "flag_line": "El Capitan Lake (ELC) -- x"},
        {"station": "ANT", "provider": "cdec", "cadence": "daily", "date": "2017-02-09",
         "value": 26867.0, "rule_fired": "no_rule_fired", "flag_line": "Antelope Lake (ANT) -- x"},
    ]
    path = tmp_path / "checks.json"
    path.write_text(json.dumps(items), encoding="utf-8")
    found = batch.candidates_from_file(path)
    assert [item["station"] for item in found] == ["ELC"]
    assert found[0]["label"] == "El Capitan Lake (ELC)"


# --- fetch and write, with the provider stubbed -------------------------------

def stub_cdec(monkeypatch, rows):
    monkeypatch.setattr(providers, "_get_cdec_json", lambda params: [
        {"date": stamp, "value": value} for stamp, value in rows])


def test_the_fetch_keeps_the_stamp_as_written_and_drops_the_missing_sentinel(monkeypatch):
    stub_cdec(monkeypatch, [("2022-3-1 00:00", 8100), ("2022-3-2 00:00", -9999),
                            ("2022-3-3 00:00", 0), ("2022-3-4 00:00", 8115)])
    series = batch.fetch_series("cdec", "ELC", "daily", pd.Timestamp("2022-03-01").date(),
                                pd.Timestamp("2022-03-10").date())
    assert [row["stamp"] for row in series] == ["2022-3-1 00:00", "2022-3-3 00:00", "2022-3-4 00:00"]


def test_a_committed_exclusion_is_marked_not_dropped_by_the_fetch(monkeypatch):
    table = {"ELC": [{"stamp": "2022-3-3 00:00", "value": 0}]}
    monkeypatch.setattr(providers, "CDEC_EXCLUDED_READINGS", table)
    stub_cdec(monkeypatch, [("2022-3-1 00:00", 8100), ("2022-3-3 00:00", 0),
                            ("2022-3-4 00:00", 8115)])
    series = batch.fetch_series("cdec", "ELC", "daily", pd.Timestamp("2022-03-01").date(),
                                pd.Timestamp("2022-03-10").date())
    assert [row["excluded"] for row in series] == [False, True, False]


def test_awdb_readings_are_read_with_the_stations_own_stamp(monkeypatch):
    monkeypatch.setattr(providers, "_get_awdb_json", lambda params: [{"data": [{"values": [
        {"date": "2023-06-12", "value": 22928}, {"date": "2023-06-13", "value": 0},
        {"date": "2023-06-14", "value": 16511}, {"date": "2023-06-15", "value": None}]}]}])
    series = batch.fetch_series("awdb", "09009040:CO:BOR", "daily",
                                pd.Timestamp("2023-06-01").date(), pd.Timestamp("2023-06-30").date())
    assert [(row["stamp"], row["value"]) for row in series] == [
        ("2023-06-12", 22928.0), ("2023-06-13", 0.0), ("2023-06-14", 16511.0)]


def temporary_roster(tmp_path, monkeypatch):
    path = tmp_path / "roster.json"
    path.write_text(json.dumps({"reservoirs": {"ELC": {"name": "Test"}}, "withheld": {},
                                "keyed_by": "station_id"}, indent=2) + "\n", encoding="utf-8")
    monkeypatch.setitem(batch.PROVIDERS, "cdec", {"path": path, "sensor": 15})
    return path


def test_write_adds_valid_records_once_and_keeps_the_file_loadable(tmp_path, monkeypatch):
    path = temporary_roster(tmp_path, monkeypatch)
    member = verdict([8100, 0, 8115], 1)["members"][0]
    record = batch.exclusion_record("cdec", "ELC", "daily", member, "2026-11-11")
    assert batch.write({("cdec", "ELC"): [record]}) == 1
    assert batch.write({("cdec", "ELC"): [record]}) == 0, "a second run adds nothing"
    document = json.loads(path.read_text(encoding="utf-8"))
    assert list(document) == ["reservoirs", "withheld", "excluded_readings", "keyed_by"]
    assert load_excluded_readings(path, 15)["ELC"][0]["stamp"] == "2022-3-2 00:00"
    assert b"\r" not in path.read_bytes()


def test_write_restores_the_file_when_the_loader_refuses_the_batch(tmp_path, monkeypatch):
    path = temporary_roster(tmp_path, monkeypatch)
    before = path.read_bytes()
    member = verdict([8100, 0, 8115], 1)["members"][0]
    record = batch.exclusion_record("cdec", "ELC", "daily", member, "2026-11-11")
    record["issue_url"] = "http://example.test/not-https"
    with pytest.raises(ValueError):
        batch.write({("cdec", "ELC"): [record]})
    assert path.read_bytes() == before


def test_every_committed_batch_record_carries_a_generated_reason():
    for spec in batch.PROVIDERS.values():
        for records in load_excluded_readings(spec["path"], spec["sensor"]).values():
            for record in records:
                if "/issues/BATCH-" in record["issue_url"] or "ADR-158" in record["reason"]:
                    assert record["reason"].startswith("ADR-152 test met: ")
