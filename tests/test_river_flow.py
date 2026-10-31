"""Daily river flow at reviewed gauges (ADR-136, ADR-144), driven with synthetic rows.

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
from pipeline.constants import (
    RIVER_NORMAL_MIN_YEARS, RIVER_NORMAL_PERCENTILES, RIVER_WINDOW_DAYS, STALE_AFTER_DAYS,
    WITHDRAW_AFTER_DAYS,
)

ROOT = Path(__file__).resolve().parent.parent
TODAY = pd.Timestamp("2026-10-27")
SITE = "09379500"
NATURAL = "09183500"
SHAPED_SITES = {"09379500", "09180500", "09315000", "09333500"}
NATURAL_SITES = {"09183500", "09217900", "09378170"}


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

def test_the_rivers_are_admitted_with_display_and_survey_names():
    gauges = roster.admitted_river_gauges()
    assert set(gauges) == SHAPED_SITES | NATURAL_SITES
    for station, row in gauges.items():
        assert row["display_name"] != row["display_name"].upper()
        assert row["usgs_name"]
        assert row["series"]["parameter_code"] == "00060"
        if station in SHAPED_SITES:
            assert row["tier"]["tier"] == "shaped"
            assert row["tier"]["status"] == "pending_formal_ruling"
        else:
            assert row["tier"]["tier"] == "natural"
            assert row["tier"]["directed_on"] == "2026-10-31"
            assert row["tier"]["tier_ruled_on"] == "2026-10-27"


def test_every_gauge_meets_its_adr_137_rule():
    """ADR-137: a published reservoir inside the basin, or inventoried dams
    holding at least 10% of a year's flow, makes a gauge shaped; neither makes
    it natural. Every basis cites the ruling, and the evidence must meet it."""
    for row in roster.admitted_river_gauges().values():
        evidence = row["tier"]["evidence"]
        assert "ADR-137" in row["tier"]["basis"]
        assert "10%" in row["tier"]["basis"] or evidence["published_reservoirs_upstream"]
        if row["tier"]["tier"] == "natural":
            assert evidence["published_reservoirs_upstream"] == []
            assert evidence["storage_share_pct"] < 10.0
            assert evidence["gages2_class"] == "reference"
        elif not evidence["published_reservoirs_upstream"]:
            assert evidence["storage_share_pct"] >= 10.0


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
    row["tier"]["tier"] = "short"
    with pytest.raises(ValueError, match="publication decision"):
        roster.load_admitted_river_gauges(write_roster(tmp_path, row))


def natural_entry(**overrides) -> dict:
    row = json.loads(json.dumps(roster.admitted_river_gauges()[NATURAL]))
    row.update(overrides)
    return row


def test_the_loader_refuses_a_natural_gauge_that_fails_adr_137(tmp_path):
    roster.load_admitted_river_gauges(write_roster(tmp_path, natural_entry()))
    reservoir = natural_entry()
    reservoir["tier"]["evidence"]["published_reservoirs_upstream"] = ["Ken's Lake"]
    stored = natural_entry()
    stored["tier"]["evidence"]["storage_share_pct"] = 10.0
    unruled = natural_entry()
    del unruled["tier"]["tier_ruled_on"]
    for row, match in ((reservoir, "ADR-137"), (stored, "ADR-137"),
                       (unruled, "tier_ruled_on")):
        with pytest.raises(ValueError, match=match):
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


# --- the normals (ADR-144) ----------------------------------------------

def band(p10=2.0, p25=4.0, p50=6.0, p75=8.0, p90=10.0, years=44) -> dict:
    return {"years": years, "p10": p10, "p25": p25, "p50": p50, "p75": p75, "p90": p90}


def normals_entry(station=NATURAL, series=None, **day_overrides) -> dict:
    series = series or roster.admitted_river_gauges()[station]["series"]["time_series_id"]
    days = {day: band() for day in providers.DAYS_OF_YEAR}
    days["02-29"] = band(years=11)
    days.update(day_overrides)
    return {"time_series_id": series, "source_url": providers.usgs_flow_normals_url(station),
            "retrieved": "2026-10-31", "days": days}


def synthetic_normals(tmp_path, gauges=None) -> Path:
    gauges = gauges if gauges is not None else {s: normals_entry(s) for s in NATURAL_SITES}
    path = tmp_path / "river_normals.json"
    path.write_text(json.dumps({"percentiles": list(RIVER_NORMAL_PERCENTILES),
                                "min_years": RIVER_NORMAL_MIN_YEARS, "retrieved": "2026-10-31",
                                "gauges": gauges}))
    return path


def api_reply(site=NATURAL, series="abc", *, drop=(), **day_overrides) -> dict:
    values = []
    for day in providers.DAYS_OF_YEAR:
        if day in drop:
            continue
        value = {"time_of_year": day, "time_of_year_type": "day_of_year",
                 "values": ["1.0", "2.0", "4.0", "6.0", "8.0", "10.0", "12.0"],
                 "percentiles": ["5", "10", "25", "50", "75", "90", "95"],
                 "sample_count": 44, "approval_status": "approved",
                 "computation_id": "x", "computation": "percentile"}
        value.update(day_overrides.get("_" + day.replace("-", "_"), {}))
        values.append(value)
    return {"type": "FeatureCollection", "next": None, "features": [{
        "type": "Feature", "geometry": None,
        "properties": {"monitoring_location_id": f"USGS-{site}", "data": [{
            "parameter_code": "00060", "unit_of_measure": "ft^3/s",
            "parent_time_series_id": series, "parent_statistic_id": "00003",
            "values": values}]}}]}


def test_the_normals_adapter_reads_five_percentiles_and_keeps_nan_as_none():
    days = providers.fetch_usgs_flow_normals(NATURAL, "abc", RIVER_NORMAL_PERCENTILES,
                                             payload=api_reply(_02_29={
                                                 "values": ["nan", "nan", "3", "4", "5", "nan",
                                                            "nan"], "sample_count": 5}))
    assert list(days) == list(providers.DAYS_OF_YEAR)
    assert days["10-31"] == band(2.0, 4.0, 6.0, 8.0, 10.0, 44)
    assert days["02-29"]["p10"] is None and days["02-29"]["years"] == 5


@pytest.mark.parametrize("reply, match", [
    (api_reply(series="other"), "not the reviewed daily mean"),
    (api_reply(drop=("07-04",)), "365 of 366"),
    (api_reply(_10_31={"approval_status": "provisional"}), "approved day-of-year"),
    (api_reply(_10_31={"values": ["1", "9", "4", "6", "8", "10", "12"]}), "out of order"),
    (api_reply(_10_31={"values": ["1", "2", "lots", "6", "8", "10", "12"]}), "p25"),
    (api_reply(_10_31={"percentiles": ["5", "10", "50", "75", "90", "95", "99"]}),
     "unreadable"),
    ({**api_reply(), "next": "token"}, "more than one page"),
    (api_reply(site="09217900"), "one monitoring location"),
])
def test_the_normals_adapter_refuses_a_reply_it_cannot_trust(reply, match):
    with pytest.raises(ValueError, match=match):
        providers.fetch_usgs_flow_normals(NATURAL, "abc", RIVER_NORMAL_PERCENTILES,
                                          payload=reply)


@pytest.mark.parametrize("key", ["", "a-real-looking-key"])
def test_the_normals_key_goes_in_a_header_only(monkeypatch, key):
    seen = {}

    class Reply:
        def raise_for_status(self):
            return None

        def json(self):
            return api_reply()

    def get(url, params=None, timeout=None, headers=None):
        seen.update(url=url, params=params, headers=headers)
        return Reply()
    monkeypatch.setattr(providers.SESSION, "get", get)
    monkeypatch.setenv(providers.USGS_API_KEY_ENV, key)
    providers.fetch_usgs_flow_normals(NATURAL, "abc", RIVER_NORMAL_PERCENTILES)
    assert ("X-Api-Key" in seen["headers"]) is bool(key)
    assert key == "" or key not in seen["url"]
    assert "computation_type=percentile" in seen["url"] and "normal_type=DOY" in seen["url"]


@pytest.mark.parametrize("cfs, expected", [
    (1.9, "much_below_normal"), (2.0, "below_normal"), (3.9, "below_normal"),
    (4.0, "normal"), (8.0, "normal"), (8.1, "above_normal"), (10.0, "above_normal"),
    (10.1, "much_above_normal"), (0.0, "much_below_normal"),
])
def test_a_flow_class_takes_the_class_nearer_normal_at_a_boundary(cfs, expected):
    assert rivers.flow_class(cfs, band()) == expected


def test_tied_percentiles_still_give_one_class():
    tied = band(p10=3.0, p25=3.0)
    assert rivers.flow_class(3.0, tied) == "normal"
    assert rivers.flow_class(2.9, tied) == "much_below_normal"


def test_a_natural_record_carries_the_band_for_its_reading_date():
    end = dt.date(2026, 10, 26)
    record = rivers.summarize_gauge(natural_entry(), rows(end, base=3.0), TODAY,
                                    normals_entry())
    assert record["tier"] == "natural" and record["compared_with_normal"] is True
    assert record["normal_band"]["day"] == "10-26"
    assert record["normal_band"]["years"] == 44
    assert record["flow_class"] == rivers.flow_class(record["current_cfs"], record["normal_band"])
    assert record["normal_withheld"] is None
    rivers.validate_payload(rivers.build_payload([record], TODAY, "t"),
                            {NATURAL: natural_entry()})


@pytest.mark.parametrize("day, reason", [
    (band(years=RIVER_NORMAL_MIN_YEARS - 1), "fewer_than_30_years"),
    (band(p90=None), "percentile_missing"),
])
def test_a_day_without_a_usable_band_is_withheld_not_estimated(day, reason):
    end = dt.date(2026, 10, 26)
    record = rivers.summarize_gauge(natural_entry(), rows(end), TODAY,
                                    normals_entry(**{"10-26": day}))
    assert record["compared_with_normal"] is False
    assert record["normal_band"] is None and record["flow_class"] is None
    assert record["normal_withheld"] == reason
    rivers.validate_payload(rivers.build_payload([record], TODAY, "t"),
                            {NATURAL: natural_entry()})


def test_the_leap_day_is_withheld_on_thin_records():
    end = dt.date(2028, 2, 29)
    record = rivers.summarize_gauge(natural_entry(), rows(end), pd.Timestamp(end),
                                    normals_entry())
    assert record["normal_withheld"] == "fewer_than_30_years"


def test_a_shaped_gauge_never_takes_percentiles():
    with pytest.raises(ValueError, match="never compared"):
        rivers.summarize_gauge(entry(), rows(TODAY.date()), TODAY, normals_entry())
    with pytest.raises(ValueError, match="needs its percentiles"):
        rivers.summarize_gauge(natural_entry(), rows(TODAY.date()), TODAY)


def test_the_payload_refuses_a_normal_on_a_shaped_gauge_and_a_wrong_class():
    shaped = rivers.summarize_gauge(entry(), rows(TODAY.date()), TODAY)
    natural = rivers.summarize_gauge(natural_entry(), rows(TODAY.date(), base=3.0), TODAY,
                                     normals_entry())
    both = {SITE: entry(), NATURAL: natural_entry()}
    rivers.validate_payload(rivers.build_payload([shaped, natural], TODAY, "t"), both)
    bad = [
        ({**shaped, "normal_band": natural["normal_band"]}, "never compared"),
        ({**shaped, "flow_class": "normal"}, "never compared"),
        ({**natural, "flow_class": "much_above_normal"}, "does not follow"),
        ({**natural, "normal_band": {**natural["normal_band"], "day": "01-01"}},
         "not the reading's date"),
        ({**natural, "normal_band": {**natural["normal_band"], "years": 29}}, "too few years"),
        ({**natural, "normal_band": {**natural["normal_band"], "p25": 99.0}}, "out of order"),
        ({**natural, "normal_withheld": "fewer_than_30_years"}, "no reason"),
        ({**natural, "compared_with_normal": False}, "says why"),
        ({**natural, "tier": "shaped"}, "never compared"),
    ]
    for record, match in bad:
        records = [shaped, record] if record["source_station_id"] == NATURAL else [record, natural]
        with pytest.raises(ValueError, match=match):
            rivers.validate_payload(rivers.build_payload(records, TODAY, "t"), both)


def test_the_payload_refuses_a_tier_the_roster_does_not_give():
    record = rivers.summarize_gauge(natural_entry(), rows(TODAY.date()), TODAY, normals_entry())
    shaped_roster = natural_entry()
    shaped_roster["tier"] = entry()["tier"]
    with pytest.raises(ValueError, match="roster's"):
        rivers.validate_payload(rivers.build_payload([record], TODAY, "t"),
                                {NATURAL: shaped_roster})


def test_the_normals_loader_refuses_what_no_one_reviewed(tmp_path):
    gauges = roster.admitted_river_gauges()
    assert set(rivers.load_river_normals(gauges, synthetic_normals(tmp_path))) == NATURAL_SITES
    cases = [
        ({s: normals_entry(s) for s in NATURAL_SITES - {NATURAL}}, "no percentiles"),
        ({**{s: normals_entry(s) for s in NATURAL_SITES},
          NATURAL: normals_entry(series="other")}, "not the reviewed series"),
        ({**{s: normals_entry(s) for s in NATURAL_SITES},
          NATURAL: {**normals_entry(), "days": dict(list(normals_entry()["days"].items())[:365])}},
         "366 days"),
        ({**{s: normals_entry(s) for s in NATURAL_SITES},
          NATURAL: normals_entry(**{"05-01": band(p50=1.0)})}, "out of order"),
        ({**{s: normals_entry(s) for s in NATURAL_SITES},
          NATURAL: {**normals_entry(),
                    "days": {d: band(years=22) for d in providers.DAYS_OF_YEAR}}},
         "fewer than 30 years"),
    ]
    for normals, match in cases:
        with pytest.raises(ValueError, match=match):
            rivers.load_river_normals(gauges, synthetic_normals(tmp_path, normals))


def test_a_percentile_file_that_fails_leaves_the_last_payload_alone(tmp_path):
    out = tmp_path / "rivers.json"
    out.write_text("previous\n")
    broken = synthetic_normals(tmp_path, {})
    assert refresh_rivers.main([], fetch=stub_fetch(), output=out, today=TODAY, pause=0,
                               normals_path=broken) == 1
    assert out.read_text() == "previous\n"


def test_the_builder_merges_and_holds_out_a_gauge_that_fails(tmp_path, monkeypatch):
    import sys
    sys.path.insert(0, str(ROOT / "tools"))
    import build_river_normals as builder
    out = synthetic_normals(tmp_path)
    before = json.loads(out.read_text())["gauges"]

    def fetch(site, series, percentiles):
        if site == "09217900":
            raise ValueError("the service answered with another series")
        reply = api_reply(site=site, series=series)
        return providers.fetch_usgs_flow_normals(site, series, percentiles, payload=reply)
    code = builder.main([], fetch=fetch, output=out, today=dt.date(2026, 11, 2), pause=0)
    document = json.loads(out.read_text())
    assert code == 1
    assert document["gauges"]["09217900"] == before["09217900"]
    assert document["gauges"][NATURAL]["retrieved"] == "2026-11-02"
    assert document["retrieved"] == "2026-10-31"
    rivers.load_river_normals(roster.admitted_river_gauges(), out)


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
    assert refresh_rivers.main([], fetch=stub_fetch(), output=out, today=TODAY, pause=0, normals_path=synthetic_normals(tmp_path)) == 0
    payload = json.loads(out.read_text())
    assert payload["gauge_count"] == 7 and payload["withdrawn"] == []
    natural = [g for g in payload["gauges"] if g["tier"] == "natural"]
    assert {g["source_station_id"] for g in natural} == NATURAL_SITES
    assert all(g["compared_with_normal"] and g["flow_class"] in rivers.FLOW_CLASSES
               for g in natural)
    assert all(not rivers.NORMAL_FIELDS & set(g) for g in payload["gauges"]
               if g["tier"] == "shaped")
    assert payload["window_days"] == RIVER_WINDOW_DAYS
    assert all(len(g["daily"]) == RIVER_WINDOW_DAYS for g in payload["gauges"])


def test_a_failed_gauge_is_carried_forward_late(tmp_path):
    out = tmp_path / "rivers.json"
    refresh_rivers.main([], fetch=stub_fetch(), output=out, today=TODAY, pause=0, normals_path=synthetic_normals(tmp_path))
    later = TODAY + pd.Timedelta(days=4)
    assert refresh_rivers.main([], fetch=stub_fetch(failing={SITE}), output=out,
                               today=later, pause=0, normals_path=synthetic_normals(tmp_path)) == 0
    carried = next(g for g in json.loads(out.read_text())["gauges"]
                   if g["source_station_id"] == SITE)
    assert carried["fetch_ok"] is False and carried["is_stale"] is True
    assert carried["days_stale"] == 5
    assert "provider down" in carried["fetch_error"]


def test_a_withdrawn_gauge_stays_stated_when_its_fetch_fails(tmp_path):
    out = tmp_path / "rivers.json"
    refresh_rivers.main([], fetch=stub_fetch(), output=out, today=TODAY, pause=0, normals_path=synthetic_normals(tmp_path))
    gone = TODAY + pd.Timedelta(days=WITHDRAW_AFTER_DAYS + 5)
    everything = set(roster.admitted_river_gauges())
    refresh_rivers.main([], fetch=stub_fetch(failing=everything), output=out,
                        today=gone, pause=0, normals_path=synthetic_normals(tmp_path))
    payload = json.loads(out.read_text())
    assert payload["gauge_count"] == 0 and payload["withdrawn_count"] == 7
    refresh_rivers.main([], fetch=stub_fetch(failing=everything), output=out,
                        today=gone + pd.Timedelta(days=1), pause=0, normals_path=synthetic_normals(tmp_path))
    again = json.loads(out.read_text())
    assert again["withdrawn_count"] == 7
    assert all(n["days_stale"] == WITHDRAW_AFTER_DAYS + 7 for n in again["withdrawn"])


def test_a_gauge_that_never_fetched_leaves_the_last_file_alone(tmp_path):
    out = tmp_path / "rivers.json"
    out.write_text("previous\n")
    assert refresh_rivers.main([], fetch=stub_fetch(failing={SITE}), output=out,
                               today=TODAY, pause=0, normals_path=synthetic_normals(tmp_path)) == 1
    assert out.read_text() == "previous\n"


def test_the_committed_payload_matches_the_roster():
    payload = json.loads((ROOT / "rivers.json").read_text(encoding="utf-8"))
    rivers.validate_payload(payload, roster.admitted_river_gauges())
    assert payload["schema_version"] == 2


def test_the_committed_percentiles_load_for_every_natural_gauge():
    normals = rivers.load_river_normals(roster.admitted_river_gauges())
    assert set(normals) == NATURAL_SITES
