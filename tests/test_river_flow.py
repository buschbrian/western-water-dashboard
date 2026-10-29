"""Daily river flow at reviewed gauges (ADR-136), driven with synthetic rows.

Network-free: the provider's HTTP getter is stubbed where the request is
under test, and everything else runs on rows built here. Nothing asserts
today's numbers; the committed payload is checked for shape only.
"""

import datetime as dt
import json
from pathlib import Path

import pandas as pd
import pytest

import refresh_rivers
from pipeline import providers, rivers, roster
from pipeline.constants import RIVER_WINDOW_DAYS, STALE_AFTER_DAYS, WITHDRAW_AFTER_DAYS

ROOT = Path(__file__).resolve().parent.parent
TODAY = pd.Timestamp("2026-10-27")
SITE = "09379500"


def entry(**overrides) -> dict:
    row = json.loads(json.dumps(roster.admitted_river_gauges()[SITE]))
    row.update(overrides)
    return row


def rows(end: dt.date, days: int = 40, *, missing=(), empty=(), base: float = 100.0,
         approval: str = "Provisional") -> list[dict]:
    out = []
    for offset in range(days - 1, -1, -1):
        day = end - dt.timedelta(days=offset)
        if offset in missing:
            continue
        out.append({"date": day.isoformat(),
                    "cfs": None if offset in empty else base + offset,
                    "approval": approval, "qualifiers": []})
    return out


def feature(site=SITE, series="abc", day="2026-10-20", value="12.5", **extra) -> dict:
    props = {"monitoring_location_id": f"USGS-{site}", "time_series_id": series,
             "parameter_code": "00060", "statistic_id": "00003",
             "unit_of_measure": "ft^3/s", "time": day, "value": value,
             "approval_status": "Provisional", "qualifier": None}
    props.update(extra)
    return {"properties": props}


# --- the roster ----------------------------------------------------------

def test_the_four_rivers_are_admitted_with_display_and_survey_names():
    gauges = roster.admitted_river_gauges()
    assert set(gauges) == {"09379500", "09180500", "09315000", "09333500"}
    for station, row in gauges.items():
        assert row["display_name"] != row["display_name"].upper()
        assert row["usgs_name"]
        assert row["tier"]["tier"] == "shaped"
        assert row["tier"]["status"] == "pending_formal_ruling"
        assert row["series"]["parameter_code"] == "00060"


def test_every_shaped_gauge_meets_an_adr_137_rule():
    """ADR-137 makes a gauge shaped when a published reservoir sits inside
    its basin, or when inventoried dams hold at least 10% of a year's flow.
    Every basis cites the ruling, and the evidence must meet one of them."""
    for row in roster.admitted_river_gauges().values():
        evidence = row["tier"]["evidence"]
        assert "ADR-137" in row["tier"]["basis"]
        if not evidence["published_reservoirs_upstream"]:
            assert evidence["storage_share_pct"] >= 10.0
            assert "10%" in row["tier"]["basis"]


def write_roster(tmp_path, row) -> Path:
    document = json.loads((ROOT / "admitted_river_gauges.json").read_text())
    document["gauges"] = {row["station"]: row}
    path = tmp_path / "admitted_river_gauges.json"
    path.write_text(json.dumps(document))
    return path


@pytest.mark.parametrize("name", [None, "", "SAN JUAN RIVER NEAR BLUFF, UT",
                                  "Dirty Devil R ab Poison Sp Wsh nr Hanksville"])
def test_the_loader_refuses_a_gauge_without_a_readable_display_name(tmp_path, name):
    row = entry()
    if name is None:
        del row["display_name"]
    else:
        row["display_name"] = name
    with pytest.raises(ValueError, match="display name"):
        roster.load_admitted_river_gauges(write_roster(tmp_path, row))


def test_the_loader_refuses_a_tier_with_no_publication_decision(tmp_path):
    row = entry()
    row["tier"]["tier"] = "natural"
    with pytest.raises(ValueError, match="publication decision"):
        roster.load_admitted_river_gauges(write_roster(tmp_path, row))


@pytest.mark.parametrize("path, match", [
    (("series", "time_series_id"), "time_series_id"),
    (("series", "checked"), "series.checked"),
    (("tier", "directed_on"), "tier.directed_on"),
    (("tier", "basis"), "tier.basis"),
    (("flows_toward", "evidence"), "flows_toward"),
    (("usgs_name",), "station name"),
])
def test_the_loader_refuses_an_entry_missing_its_evidence(tmp_path, path, match):
    row = entry()
    target = row
    for key in path[:-1]:
        target = target[key]
    del target[path[-1]]
    with pytest.raises(ValueError, match=match):
        roster.load_admitted_river_gauges(write_roster(tmp_path, row))


def test_the_loader_refuses_another_unit_or_a_normal(tmp_path):
    row = entry()
    row["series"]["unit"] = "m^3/s"
    with pytest.raises(ValueError, match="daily mean flow"):
        roster.load_admitted_river_gauges(write_roster(tmp_path, row))
    with pytest.raises(ValueError, match="normal_cfs"):
        roster.load_admitted_river_gauges(write_roster(tmp_path, entry(normal_cfs=1)))


# --- the provider --------------------------------------------------------

START, END = dt.date(2026, 10, 1), dt.date(2026, 10, 27)


def test_the_provider_keeps_flags_missing_values_and_zero():
    out = providers.fetch_usgs_flow_series(SITE, "abc", START, END, features=[
        feature(day="2026-10-21", value="0.00", qualifier=["ESTIMATED"]),
        feature(day="2026-10-20", value=None, approval_status="Approved", qualifier="Ice"),
        feature(day="2026-10-22", value="5", approval_status="Approved"),
    ])
    assert [r["date"] for r in out] == ["2026-10-20", "2026-10-21", "2026-10-22"]
    assert out[0] == {"date": "2026-10-20", "cfs": None, "approval": "Approved",
                      "qualifiers": ["Ice"]}
    assert out[1]["cfs"] == 0.0 and out[1]["qualifiers"] == ["ESTIMATED"]


@pytest.mark.parametrize("bad, match", [
    ({"unit_of_measure": "ft^3/d"}, "unit_of_measure"),
    ({"time_series_id": "other"}, "time_series_id"),
    ({"monitoring_location_id": "USGS-09180500"}, "monitoring_location_id"),
    ({"value": "-1"}, "impossible"),
    ({"value": "NaN"}, "impossible"),
    ({"value": "lots"}, "non-numeric"),
    ({"time": "2026-11-30"}, "outside"),
    ({"qualifier": 3}, "qualifier"),
])
def test_the_provider_refuses_a_row_it_cannot_publish(bad, match):
    with pytest.raises(ValueError, match=match):
        providers.fetch_usgs_flow_series(SITE, "abc", START, END, features=[feature(**bad)])


def test_the_provider_refuses_two_flows_for_one_day_and_accepts_a_repeat():
    same = [feature(), feature()]
    assert len(providers.fetch_usgs_flow_series(SITE, "abc", START, END, features=same)) == 1
    with pytest.raises(ValueError, match="two different flows"):
        providers.fetch_usgs_flow_series(SITE, "abc", START, END,
                                         features=[feature(), feature(value="13")])


def test_the_reviewed_series_must_still_be_the_only_primary():
    def meta(id_, primary="Primary"):
        return {"id": id_, "properties": {"primary": primary, "unit_of_measure": "ft^3/s"}}
    providers.confirm_usgs_flow_series(SITE, "abc", features=[meta("abc"), meta("x", None)])
    with pytest.raises(ValueError, match="primary"):
        providers.confirm_usgs_flow_series(SITE, "abc", features=[meta("xyz")])
    with pytest.raises(ValueError, match="primary"):
        providers.confirm_usgs_flow_series(SITE, "abc", features=[meta("abc"), meta("xyz")])


class FakeResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {"features": [], "links": []}


@pytest.mark.parametrize("key", ["", "a-real-looking-key"])
def test_the_key_goes_in_a_header_only_when_one_is_configured(monkeypatch, key):
    seen = {}

    def get(url, params=None, timeout=None, headers=None):
        seen.update(url=url, params=params, headers=headers)
        return FakeResponse()
    monkeypatch.setattr(providers.SESSION, "get", get)
    monkeypatch.setenv(providers.USGS_API_KEY_ENV, key)
    providers.fetch_usgs_flow_series(SITE, "abc", START, END)
    assert ("X-Api-Key" in seen["headers"]) is bool(key)
    assert key == "" or key not in seen["url"] + json.dumps(seen["params"])
    assert seen["params"]["time_series_id"] == "abc"
    assert seen["params"]["datetime"] == "2026-10-01/2026-10-27"


# --- the record ----------------------------------------------------------

def test_the_window_ends_on_the_newest_reported_day():
    yesterday = (TODAY - pd.Timedelta(days=1)).date()
    record = rivers.summarize_gauge(entry(), rows(yesterday, empty=(0,), missing=(5,)), TODAY)
    assert len(record["daily"]) == RIVER_WINDOW_DAYS
    assert record["as_of"] == (yesterday - dt.timedelta(days=1)).isoformat()
    assert record["window_end"] == record["as_of"] == record["daily"][-1]["date"]
    assert record["current_cfs"] == record["daily"][-1]["cfs"]
    gap = record["daily"][-5]
    assert gap["cfs"] is None and gap["approval"] is None and gap["qualifiers"] == []
    assert record["reported_days"] == RIVER_WINDOW_DAYS - 1
    assert record["days_stale"] == 2 and record["is_stale"] is (2 > STALE_AFTER_DAYS)
    assert record["compared_with_normal"] is False
    assert record["name"] == "San Juan River near Bluff"
    assert record["usgs_name"] == "SAN JUAN RIVER NEAR BLUFF, UT"


def test_the_seven_day_change_needs_the_reading_seven_days_earlier():
    end = TODAY.date()
    record = rivers.summarize_gauge(entry(), rows(end), TODAY)
    assert record["change_7d_cfs"] == -7.0
    assert record["change_7d_reference_date"] == (end - dt.timedelta(days=7)).isoformat()
    record = rivers.summarize_gauge(entry(), rows(end, missing=(7,)), TODAY)
    assert record["change_7d_cfs"] is None and record["change_7d_reference_date"] is None


def test_provisional_and_approved_days_are_counted_apart():
    end = TODAY.date()
    data = rows(end, approval="Approved")
    for row in data[-3:]:
        row["approval"] = "Provisional"
    record = rivers.summarize_gauge(entry(), data, TODAY)
    assert record["provisional_days"] == 3
    assert record["current_approval"] == "Provisional"


def test_a_gauge_with_no_reported_flow_is_a_fault_not_a_record():
    with pytest.raises(rivers.NoReportedFlow):
        rivers.summarize_gauge(entry(), rows(TODAY.date(), days=3, empty=(0, 1, 2)), TODAY)


# --- the payload ---------------------------------------------------------

def roster_of(*stations):
    return {s: roster.admitted_river_gauges()[s] for s in stations}


def test_a_payload_refuses_a_total_a_normal_and_a_measured_notice():
    record = rivers.summarize_gauge(entry(), rows(TODAY.date()), TODAY)
    payload = rivers.build_payload([record], TODAY, "2026-10-27T12:00:00+00:00")
    rivers.validate_payload(payload, roster_of(SITE))
    with pytest.raises(ValueError, match="never adds gauges"):
        rivers.validate_payload({**payload, "total_cfs": 1}, roster_of(SITE))
    with pytest.raises(ValueError, match="normal_cfs"):
        rivers.validate_payload({**payload, "gauges": [{**record, "normal_cfs": 1}]},
                                roster_of(SITE))
    with pytest.raises(ValueError, match="compared with normal"):
        rivers.validate_payload(
            {**payload, "gauges": [{**record, "compared_with_normal": True}]}, roster_of(SITE))
    notice = {"name": "x", "as_of": "2026-01-01", "days_stale": 99, "source_label": "s",
              "reason": "r", "source_station_id": "09180500", "current_cfs": 3}
    with pytest.raises(ValueError, match="carries no measurement"):
        rivers.validate_payload({**payload, "withdrawn": [notice]},
                                roster_of(SITE, "09180500"))


def test_a_gauge_missing_from_both_lists_refuses_the_payload():
    record = rivers.summarize_gauge(entry(), rows(TODAY.date()), TODAY)
    payload = rivers.build_payload([record], TODAY, "t")
    with pytest.raises(ValueError, match="roster and payload disagree"):
        rivers.validate_payload(payload, roster_of(SITE, "09180500"))


def test_an_old_record_is_withdrawn_by_station_without_its_measurement():
    end = (TODAY - pd.Timedelta(days=WITHDRAW_AFTER_DAYS + 5)).date()
    record = rivers.summarize_gauge(entry(), rows(end), TODAY)
    payload = rivers.build_payload([record], TODAY, "t")
    rivers.validate_payload(payload, roster_of(SITE))
    assert payload["gauges"] == [] and payload["withdrawn_count"] == 1
    assert payload["withdrawn"][0]["source_station_id"] == SITE
    assert set(payload["withdrawn"][0]) <= rivers.NOTICE_FIELDS


# --- the refresh ---------------------------------------------------------

def stub_fetch(failing=()):
    def fetch(station, entry_, start, end):
        if station in failing:
            raise RuntimeError("provider down")
        assert (end - start).days + 1 == refresh_rivers.RIVER_FETCH_DAYS
        return rows(end - dt.timedelta(days=1))
    return fetch


def test_a_full_run_writes_every_gauge(tmp_path):
    out = tmp_path / "rivers.json"
    assert refresh_rivers.main([], fetch=stub_fetch(), output=out, today=TODAY, pause=0) == 0
    payload = json.loads(out.read_text())
    assert payload["gauge_count"] == 4 and payload["withdrawn"] == []
    assert payload["window_days"] == RIVER_WINDOW_DAYS
    assert all(len(g["daily"]) == RIVER_WINDOW_DAYS for g in payload["gauges"])


def test_a_failed_gauge_is_carried_forward_late(tmp_path):
    out = tmp_path / "rivers.json"
    refresh_rivers.main([], fetch=stub_fetch(), output=out, today=TODAY, pause=0)
    later = TODAY + pd.Timedelta(days=4)
    assert refresh_rivers.main([], fetch=stub_fetch(failing={SITE}), output=out,
                               today=later, pause=0) == 0
    carried = next(g for g in json.loads(out.read_text())["gauges"]
                   if g["source_station_id"] == SITE)
    assert carried["fetch_ok"] is False and carried["is_stale"] is True
    assert carried["days_stale"] == 5
    assert "provider down" in carried["fetch_error"]


def test_a_withdrawn_gauge_stays_stated_when_its_fetch_fails(tmp_path):
    out = tmp_path / "rivers.json"
    refresh_rivers.main([], fetch=stub_fetch(), output=out, today=TODAY, pause=0)
    gone = TODAY + pd.Timedelta(days=WITHDRAW_AFTER_DAYS + 5)
    everything = set(roster.admitted_river_gauges())
    refresh_rivers.main([], fetch=stub_fetch(failing=everything), output=out,
                        today=gone, pause=0)
    payload = json.loads(out.read_text())
    assert payload["gauge_count"] == 0 and payload["withdrawn_count"] == 4
    refresh_rivers.main([], fetch=stub_fetch(failing=everything), output=out,
                        today=gone + pd.Timedelta(days=1), pause=0)
    again = json.loads(out.read_text())
    assert again["withdrawn_count"] == 4
    assert all(n["days_stale"] == WITHDRAW_AFTER_DAYS + 7 for n in again["withdrawn"])


def test_a_gauge_that_never_fetched_leaves_the_last_file_alone(tmp_path):
    out = tmp_path / "rivers.json"
    out.write_text("previous\n")
    assert refresh_rivers.main([], fetch=stub_fetch(failing={SITE}), output=out,
                               today=TODAY, pause=0) == 1
    assert out.read_text() == "previous\n"


def test_the_committed_payload_matches_the_roster():
    payload = json.loads((ROOT / "rivers.json").read_text(encoding="utf-8"))
    rivers.validate_payload(payload, roster.admitted_river_gauges())
    assert payload["schema_version"] == 1
