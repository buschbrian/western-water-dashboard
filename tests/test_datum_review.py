"""The datum review builder's rules, without the network.

What is tested is what the worksheet may claim: that a label is suggested only
from a Reclamation statement or two agreeing USGS locations, that a conversion
sentence or a drifting series never counts as a statement, and that a rerun
keeps every ruling and every row it was not asked about.
"""

import datetime as dt
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from tools import build_datum_review as D  # noqa: E402

TODAY = dt.date(2026, 10, 27)


# --- statements ------------------------------------------------------------

@pytest.mark.parametrize("sentence, family", [
    ("All elevations are referenced to NGVD29.", "NGVD29"),
    ("Elevations are in feet above the North American Vertical Datum of 1988.", "NAVD88"),
    ("Elevations are Hoover Dam powerhouse datum, 0.55 feet lower than NGVD29.", "project datum"),
    ("Davis RPVD equals NAVD88 minus 3.39 feet.", "project datum"),
    ("Convert NGVD29 to NAVD88 by adding 2.9 feet.", None),
    ("The survey is tied to the datum point.", None),
])
def test_a_sentence_names_the_one_vertical_datum_it_states(sentence, family):
    assert D.sentence_family(sentence) == family


def test_a_horizontal_datum_is_not_a_vertical_statement():
    text = "Coordinates are in the North American Datum of 1983 and the GPS datum of WGS-84."
    assert D.datum_sentences(text) == []


def test_datum_sentences_keep_reading_order_and_wrapped_words():
    text = ("Depths were referenced to the NGVD-\n29 datum. The pool is full. "
            "A project datum is used at the dam.")
    assert [family for family, _ in D.datum_sentences(text)] == ["NGVD29", "project datum"]


def test_several_datums_in_one_report_are_all_listed_not_picked():
    assert D.statement_family(["NGVD29", "NAVD88"]) == "NAVD88; NGVD29"
    assert D.statement_family(["NGVD29", "NGVD29"]) == "NGVD29"
    assert D.statement_family([]) == ""


def test_the_rise_vertical_datum_text_is_read_as_a_statement():
    text = ("USGS 1912 U.S. Geological Survey datum. Locally known at Hoover Dam as "
            "Power House Datum. Add 0.55 foot to convert to NGVD 1929.")
    assert D.datum_family(text) == "project datum"
    assert D.datum_family("EGM96") == ""


# --- the shift -------------------------------------------------------------

def test_the_ncat_shift_is_navd88_minus_ngvd29_in_feet():
    payload = {"srcOrthoht": "1000.000", "destOrthoht": "999.115", "heightUnits": "m"}
    assert D.ncat_shift_ft(payload) == pytest.approx(2.903, abs=0.001)
    assert D.ncat_shift_ft({}) is None


def test_a_datasheet_with_both_heights_gives_a_shift_and_one_without_gives_none():
    both = (" GP0118* NAVD 88 ORTHO HEIGHT -   973.142 (meters)     3192.72  (feet) ADJUSTED\n"
            " GP0118  NGVD 29 (??/??/92)  972.251  (m)         3189.79   (f) ADJ UNCH    1 2\n")
    assert D.datasheet_shift_ft(both) == pytest.approx(2.923, abs=0.002)
    assert D.datasheet_shift_ft(both.splitlines()[0]) is None
    wrapped = both.replace("NAVD 88 ORTHO HEIGHT", "<a href='x'>NAVD 88</a> ORTHO HEIGHT")
    assert D.datasheet_shift_ft(wrapped) == pytest.approx(2.923, abs=0.002)


# --- the series ------------------------------------------------------------

def days(start, count, value, step=0.0):
    first = dt.date(2026, 8, 1)
    return {(first + dt.timedelta(days=start + i)).isoformat(): value + step * i
            for i in range(count)}


def test_a_series_equal_to_rise_is_ngvd29_for_62614_and_navd88_for_62615():
    rise = days(0, 60, 3500.0)
    checks = D.series_checks({"62614": D.paired_difference(rise, days(0, 60, 3500.1)),
                              "62615": D.paired_difference(rise, days(0, 60, 3500.05))}, 2.9)
    assert checks == [("62614", "NGVD29"), ("62615", "NAVD88")]


def test_a_62615_series_a_shift_above_rise_says_rise_is_ngvd29():
    rise = days(0, 60, 3500.0)
    got = D.series_checks({"62615": D.paired_difference(rise, days(0, 60, 3502.9))}, 2.9)
    assert got == [("62615", "NGVD29")]


def test_a_difference_that_fits_no_national_datum_is_a_project_datum_flag():
    rise = days(0, 60, 1040.0)
    got = D.series_checks({"62614": D.paired_difference(rise, days(0, 60, 1040.55))}, 2.3)
    assert got == [("62614", "project datum")]


def test_a_drifting_difference_gives_no_label_and_00062_never_does():
    rise = days(0, 60, 3500.0)
    drifting = D.paired_difference(rise, days(0, 60, 3500.0, step=0.03))
    assert D.series_checks({"62614": drifting}, 2.9) == []
    steady = D.paired_difference(rise, days(0, 60, 3500.0))
    assert D.series_checks({"00062": steady}, 2.9) == []


def test_too_few_common_days_give_no_label():
    rise = days(0, 60, 3500.0)
    few = D.paired_difference(rise, days(0, 5, 3500.0))
    assert few[0] == 5 and D.series_checks({"62614": few}, 2.9) == []


def test_window_series_skips_null_results_and_uses_the_date_only():
    rows = [{"dateTime": "2026-10-26T07:00:00+00:00", "result": 3518.9},
            {"dateTime": "2026-10-25T07:00:00+00:00", "result": None}]
    assert D.window_series(rows) == {"2026-10-26": 3518.9}


# --- the suggestion --------------------------------------------------------

def row(**fields):
    base = {"rise_location_datum_family": "", "report_datum": "", "usgs_series_checks": ""}
    base.update(fields)
    return base


def test_a_single_report_gives_its_datum():
    assert D.suggest(row(report_datum="NGVD29"))[0] == "NGVD29"


def test_the_rise_location_datum_alone_gives_no_label():
    label, reason = D.suggest(row(rise_location_datum_family="NAVD88"))
    assert label == "unverified" and "no Reclamation report or USGS series agrees" in reason


def test_the_rise_location_datum_with_an_agreeing_report_gives_its_datum():
    label, reason = D.suggest(row(rise_location_datum_family="project datum",
                                  report_datum="project datum"))
    assert label == "project datum" and "and a Reclamation report" in reason


def test_statements_that_disagree_are_unverified():
    label, reason = D.suggest(row(rise_location_datum_family="NGVD29", report_datum="NAVD88"))
    assert label == "unverified" and "disagree" in reason


def test_a_report_that_names_several_datums_is_no_statement_alone():
    label, reason = D.suggest(row(report_datum="NAVD88; project datum"))
    assert label == "unverified" and "several datums" in reason


def test_a_report_naming_the_location_datum_among_others_keeps_the_label_and_says_so():
    label, reason = D.suggest(row(rise_location_datum_family="project datum",
                                  report_datum="NGVD29; project datum"))
    assert label == "project datum" and "also names NGVD29" in reason


def test_a_report_that_does_not_name_the_location_datum_is_a_disagreement():
    label, reason = D.suggest(row(rise_location_datum_family="NGVD29",
                                  report_datum="NAVD88; project datum"))
    assert label == "unverified" and "disagree" in reason


def test_a_usgs_series_that_contradicts_a_statement_makes_it_unverified():
    label, reason = D.suggest(row(rise_location_datum_family="NAVD88",
                                  usgs_series_checks="09091900 62614 NGVD29"))
    assert label == "unverified" and "NGVD29" in reason


def test_a_usgs_series_that_agrees_with_a_statement_is_noted():
    label, reason = D.suggest(row(rise_location_datum_family="NAVD88",
                                  usgs_series_checks="09091900 62615 NAVD88"))
    assert label == "NAVD88" and "09091900 agrees" in reason


def test_a_usgs_site_with_no_check_is_named_not_called_absent():
    label, reason = D.suggest(row(usgs_sites="09379900"))
    assert label == "unverified" and "09379900" in reason and "drifts" in reason


def test_two_usgs_locations_that_agree_give_a_label_one_location_does_not():
    two = "09379900 62614 NGVD29; 09380000 62614 NGVD29"
    assert D.suggest(row(usgs_series_checks=two))[0] == "NGVD29"
    one = "09379900 62614 NGVD29; 09379900 62615 NGVD29"
    label, reason = D.suggest(row(usgs_series_checks=one))
    assert label == "unverified" and "one monitoring location" in reason


def test_two_usgs_locations_that_disagree_are_unverified():
    split = "09379900 62614 NGVD29; 09380000 62615 NAVD88"
    assert D.suggest(row(usgs_series_checks=split))[0] == "unverified"


def test_no_evidence_is_unverified():
    assert D.suggest(row())[0] == "unverified"


# --- records and points ----------------------------------------------------

def record(title, location):
    return {"attributes": {"recordTitle": title},
            "relationships": {"location": {"data": {"id": f"/rise/api/location/{location}"}}}}


def test_a_report_record_matches_by_location_or_by_the_whole_name_only():
    survey = record("Lake Mead (Nevada/Arizona) Sedimentation Survey Data", "3514")
    assert D.record_matches(survey, "Lake Mead", "3514") == "location"
    assert D.record_matches(survey, "Lake Mead", "9999") == "name"
    assert D.record_matches(survey, "Mead Reservoir", "9999") == ""
    other = record("Lake Meadow Sedimentation Survey Data", "1")
    assert D.record_matches(other, "Lake Mead", "9999") == ""
    ops = record("Lake Mead Water Operations Monitoring Data", "3514")
    assert D.record_matches(ops, "Lake Mead", "3514") == ""


def test_the_shift_point_is_the_inventory_dam_then_a_dam_named_location():
    entry = {"lat": 1.0, "lon": 2.0, "huc_assignment_point": [-111.5, 36.9],
             "huc_assignment_source": "nid_dam_point"}
    assert D.choose_point(entry, {})[0] == (36.9, -111.5)
    entry = {"lat": 1.0, "lon": 2.0, "huc_assignment_point": [2.0, 1.0],
             "huc_assignment_source": "published_point_dam_on_divide"}
    place = {"point": (36.0, -114.7), "name": "Lake Mead Hoover Dam and Powerplant"}
    assert D.choose_point(entry, place) == ((36.0, -114.7), "RISE location named for the dam")
    assert D.choose_point(entry, {})[1] == "published drainage point"


# --- the file --------------------------------------------------------------

def test_a_report_step_without_pdftotext_degrades_to_empty_columns(monkeypatch):
    monkeypatch.setattr(D.shutil, "which", lambda _: None)
    got = D.report_evidence([], "Lake Mead", "3514")
    assert got["report_status"] == "pdftotext not installed"
    assert got["report_quotes"] == "" and got["report_datum"] == ""


def test_a_rerun_keeps_the_ruling_and_notes_and_the_rows_it_was_not_asked_about():
    old = dict.fromkeys(D.FIELDS, "")
    old.update(station="509", name="Lake Powell", reviewer_ruling="NGVD29",
               reviewer_notes="checked against the 2022 survey", check_status="complete")
    fresh = dict.fromkeys(D.FIELDS, "")
    fresh.update(station="509", name="Lake Powell", ncat_shift_ft=2.9,
                 reviewer_ruling="", reviewer_notes="", check_status="complete")
    merged = D.merge_row(old, fresh)
    assert merged["reviewer_ruling"] == "NGVD29"
    assert merged["reviewer_notes"] == "checked against the 2022 survey"
    assert merged["ncat_shift_ft"] == 2.9


def test_write_then_read_round_trips_and_suggests_offline(tmp_path):
    path = tmp_path / "datum-review.csv"
    one = dict.fromkeys(D.FIELDS, "")
    one.update(station="6124", name="Lake Mead", reviewer_ruling="project datum",
               rise_location_datum="Power House Datum. Add 0.55 foot to convert to NGVD 1929.",
               report_datum="project datum")
    two = dict.fromkeys(D.FIELDS, "")
    two.update(station="509", name="Lake Powell")
    D.write_rows({"6124": one, "509": two}, path)
    rows = D.read_rows(path)
    assert list(rows) == ["6124", "509"]
    assert rows["6124"]["suggested_datum"] == "project datum"
    assert rows["6124"]["reviewer_ruling"] == "project datum"
    assert rows["509"]["suggested_datum"] == "unverified"


def test_every_suggestion_is_one_of_the_four_labels():
    for fields in ({}, {"report_datum": "NAVD88"}, {"report_datum": "NAVD88; project datum"}):
        assert D.suggest(row(**fields))[0] in D.LABELS


# --- the USGS OGC daily service --------------------------------------------

def feature(site, code, day, value):
    return {"properties": {"monitoring_location_id": f"USGS-{site}", "parameter_code": code,
                           "time": day, "value": str(value)}}


def test_ogc_daily_features_group_by_site_code_and_date():
    got = D.group_daily([feature("09379900", "62614", "2026-10-21", 3520.9),
                         feature("09379900", "62615", "2026-10-21", 3523.8),
                         feature("09380000", "62614", "2026-10-20", "bad"),
                         {"properties": {}}])
    assert got == {"09379900": {"62614": {"2026-10-21": 3520.9},
                                "62615": {"2026-10-21": 3523.8}}}


def test_a_403_with_a_key_falls_back_to_a_keyless_request(monkeypatch):
    calls = []

    def fake_get(url, params=None, headers=None, **_):
        calls.append(headers)
        if headers and "X-Api-Key" in headers:
            raise D.ServiceError("403 Client Error: Forbidden")
        return {"features": []}

    monkeypatch.setenv("USGS_API_KEY", "not-a-real-key")
    monkeypatch.setattr(D, "get", fake_get)
    assert D.usgs_get("https://example.test") == {"features": []}
    assert "X-Api-Key" in calls[0] and "X-Api-Key" not in calls[1]


def test_no_key_means_one_keyless_request(monkeypatch):
    calls = []
    monkeypatch.delenv("USGS_API_KEY", raising=False)
    monkeypatch.setattr(D, "get", lambda url, params=None, headers=None, **_: calls.append(headers) or {})
    D.usgs_get("https://example.test")
    assert len(calls) == 1 and "X-Api-Key" not in calls[0]


def test_one_bad_day_does_not_hide_a_series_but_a_trend_does():
    rise = days(0, 60, 3500.0)
    usgs = days(0, 60, 3500.1)
    usgs["2026-08-10"] = 3490.0
    assert D.series_checks({"62614": D.paired_difference(rise, usgs)}, 2.9) == [("62614", "NGVD29")]
    trend = D.paired_difference(rise, days(0, 60, 3500.0, step=0.03))
    assert trend[2] > D.DRIFT_FT
