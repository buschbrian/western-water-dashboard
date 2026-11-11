import math
from datetime import date

from tools import build_precipitation_history as builder


def record(values):
    return {"stationTriplet": "1:UT:SNTL", "data": [{"stationElement": {
        "elementCode": "WTEQ", "durationName": "DAILY"}, "values": [
            {"date": day, "value": value} for day, value in values.items()]}]}


def test_snow_history_keeps_zero_and_melt_but_refuses_missing_steps():
    item = record({"2023-10-01": 0, "2024-03-01": 12.4, "2024-03-08": 10.1})
    site = builder.build_site("1:UT:SNTL", item, range(2024, 2025),
                              ["10-01", "03-01", "03-08"], element="WTEQ")
    assert site["available"]
    assert site["years"] == [[0, 124, -23]]
    assert not builder.build_site("1:UT:SNTL", item, range(2023, 2025),
                                  ["10-01", "03-01"], element="WTEQ")["available"]


def test_snow_steps_share_calendar_dates_and_never_borrow_another_season():
    assert builder.step_date(2024, "03-01") == date(2024, 3, 1)
    assert builder.step_date(2025, "03-01") == date(2025, 3, 1)
    item = record({"2023-09-30": 1, "2024-02-29": 2.3})
    assert not builder.build_site("1:UT:SNTL", item, range(2024, 2025),
                                  ["10-01"], element="WTEQ")["available"]
    site = builder.build_site("1:UT:SNTL", item, range(2024, 2025),
                              ["03-01"], element="WTEQ")
    assert site["years"] == [[23]]
    assert site["substituted_steps"] == 1


def test_invalid_snow_readings_cannot_form_a_complete_record():
    for value in (-1, math.inf, math.nan):
        assert not builder.build_site("1:UT:SNTL", record({"2023-10-01": value}),
                                      range(2024, 2025), ["10-01"], element="WTEQ")["available"]


def test_a_snow_file_names_its_own_writer_and_units_and_precipitation_keeps_its_own():
    snow = builder.build_payload([], first=1991, last=1992, month_days=["10-01"],
                                 checked="2026-11-11", element="WTEQ")
    assert (snow["element"], snow["generated_by"], snow["units"]) == (
        "WTEQ", "tools/build_snow_history.py", "tenths of an inch, water held in snow")
    precipitation = builder.build_payload([], first=1991, last=1992, month_days=["10-01"],
                                          checked="2026-11-11")
    assert (precipitation["element"], precipitation["generated_by"], precipitation["units"]) == (
        "PREC", "tools/build_precipitation_history.py",
        "tenths of an inch, accumulated since 1 October")


def test_precipitation_still_keeps_a_falling_or_negative_reading_as_published():
    item = record({"2023-10-01": -0.2})
    item["data"][0]["stationElement"]["elementCode"] = "PREC"
    assert builder.readings_by_date(item) == {"2023-10-01": -0.2}
    assert builder.readings_by_date(item, element="WTEQ") == {}


def test_a_run_refuses_to_merge_into_a_history_of_another_element(tmp_path, monkeypatch):
    inventory = tmp_path / "inventory.json"
    inventory.write_text('{"sites": [{"station": "1:UT:SNTL"}]}', encoding="utf-8")
    output = tmp_path / "history.json"
    output.write_text('{"element": "PREC", "sites": []}', encoding="utf-8")
    monkeypatch.setattr("sys.argv", ["build", "--inventory", str(inventory),
                                     "--output", str(output), "--dry-run"])
    assert builder.main(element="WTEQ", output_path=output) == 2
    assert output.read_text(encoding="utf-8") == '{"element": "PREC", "sites": []}'
