"""Network-free checks for the New Mexico admission screen."""

import datetime as dt
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))
import audit_new_mexico_reservoirs as nm  # noqa: E402

TODAY = dt.date(2026, 10, 27)


def reading(stat, day, value, parameter="00054"):
    return {"properties": {"statistic_id": stat, "time": day, "value": value,
                           "parameter_code": parameter,
                           "monitoring_location_id": "USGS-08286900"}}


def test_parse_daily_drops_sentinel_negative_and_other_parameters():
    features = [
        reading("32400", "2026-10-04", "120"),
        reading("32400", "2026-10-01", "100"),
        reading("32400", "2026-10-02", "-999999"),
        reading("32400", "2026-10-03", "-5"),
        reading("32400", "2026-10-05", None),
        reading("00003", "2026-10-04", "9", parameter="00062"),
    ]
    assert nm.parse_daily(features) == {
        "32400": [("2026-10-01", 100.0), ("2026-10-04", 120.0)]}


def test_statistic_with_the_freshest_reading_wins_not_the_longest():
    stats = {"30800": [("2020-01-01", 1.0)] * 50,
             "32400": [("2026-10-01", 1.0)] * 3}
    assert nm.choose_statistic(stats) == "32400"
    assert nm.choose_statistic({}) is None


def test_summarize_reports_length_and_freshness():
    points = [("2015-03-01", 10.0), ("2026-10-20", 30.0), ("2026-10-26", 20.0)]
    result = nm.summarize(points, TODAY)
    assert result["readings"] == 3
    assert result["first_reading"] == "2015-03-01"
    assert result["last_reading"] == "2026-10-26"
    assert result["days_since_last"] == 1 and result["current"] is True
    assert result["observed_max_af"] == 30.0 and result["latest_af"] == 20.0
    quiet = nm.summarize([("2026-08-01", 5.0)], TODAY)
    assert quiet["current"] is False
    assert nm.summarize([], TODAY)["readings"] == 0


def test_clean_name_follows_the_worksheet_conventions():
    assert nm.clean_name("LAKE SUMNER NR FORT SUMNER, NM") == "Lake Sumner"
    assert nm.clean_name("JEMEZ CANYON RES NR BERNALILLO N M") == "Jemez Canyon Reservoir"
    assert nm.clean_name("TWO R RES (RIO HONDO RES) NR ROSWELL,NM") == "Rio Hondo Reservoir"
    assert nm.clean_name("Brantley Lk  nr Carlsbad") == "Brantley Lake"


def test_one_named_nhd_water_wins_over_the_gauge_name():
    result = nm.propose_name("EAGLE NEST LAKE NR EAGLE NEST, NM", ["Eagle Nest Lake"])
    assert result["name"] == "Eagle Nest Lake" and "NHD" in result["name_basis"]
    result = nm.propose_name("LAKE AVALON NR CARLSBAD N MEX", ["", ""])
    assert result["name"] == "Lake Avalon" and "cleaned" in result["name_basis"]
    result = nm.propose_name("X LAKE", ["A Lake", "B Lake"])
    assert "A Lake" in result["name_basis"] and result["name_needs_review"]


def test_a_failed_nhd_lookup_never_becomes_the_proposal():
    result = nm.propose_name("LAKE SUMNER NR FORT SUMNER, NM", [], "HTTPError: 504")
    assert result["name"] is None and result["name_needs_review"] is True
    assert result["name_basis"] == "NHD unavailable: HTTPError: 504"
    assert result["gauge_name_cleaned"] == "Lake Sumner"


def row(provider, station, lon, lat, nid_id=None, readings=100, current=True):
    return {"provider": provider, "station": station, "name": station,
            "lon": lon, "lat": lat, "nid_id": nid_id, "readings": readings,
            "current": current}


def test_duplicates_keep_the_operators_feed_and_report_the_rest():
    rows = [dict(row("usgs", "08286900", -106.43, 36.24, "NM00001"), operator="cwms"),
            dict(row("cwms", "Abiquiu", -106.42, 36.23, "NM00001"), operator="cwms"),
            dict(row("usgs", "08294200", -105.91, 35.85, "NM00002"), operator="rise"),
            dict(row("cwms", "Heron", -105.90, 35.86, "NM00002"), operator="rise"),
            dict(row("rise", "900", -105.90, 35.86, "NM00002"), operator="rise"),
            dict(row("rise", "17", -108.11, 35.29, "NM00003"), operator=None),
            dict(row("usgs", "08341400", -108.11, 35.29, "NM00003"), operator=None)]
    nm.mark_duplicates(rows)
    by_station = {r["station"]: r for r in rows}
    assert "duplicate_of" not in by_station["Abiquiu"]
    assert by_station["08286900"]["duplicate_of"]["station"] == "Abiquiu"
    assert "duplicate_of" not in by_station["900"]
    assert by_station["Heron"]["duplicate_of"]["station"] == "900"
    assert by_station["08294200"]["duplicate_of"]["station"] == "900"
    # No operator feed on an unclaimed dam: the agency feed still outranks USGS.
    assert "duplicate_of" not in by_station["17"]
    assert by_station["08341400"]["duplicate_of"]["provider"] == "rise"


def test_usgs_is_kept_only_when_neither_operator_publishes():
    rows = [dict(row("usgs", "A", -105.0, 36.0, "NM9"), operator=None)]
    nm.mark_duplicates(rows)
    assert "duplicate_of" not in rows[0]
    rows = [dict(row("usgs", "A", -105.0, 36.0, "NM9"), operator="cwms"),
            dict(row("rise", "B", -105.0, 36.0, "NM9"), operator="cwms")]
    nm.mark_duplicates(rows)
    assert rows[0]["duplicate_of"]["provider"] == "rise"


def test_operator_comes_from_the_inventory_agency_fields():
    assert nm.operator_provider("US Army Corps of Engineers") == "cwms"
    assert nm.operator_provider(None, "Bureau of Reclamation") == "rise"
    assert nm.operator_provider("", None) is None
    assert nm.operator_provider("Bureau of Reclamation", "US Army Corps of Engineers") == "rise"
    assert nm.operator_provider("Local Government") is None


def test_position_alone_marks_a_duplicate_when_no_dam_matched():
    rows = [row("rise", "1", -105.0, 36.0), row("usgs", "2", -105.001, 36.001)]
    nm.mark_duplicates(rows)
    assert rows[1]["duplicate_of"]["station"] == "1"


def clear(**changes):
    base = {"readings": 50, "current": True, "in_scope": True,
            "rule_admitted": True, "match_confirmed_by": "position",
            "match_distance_km": 0.4, "nid_id": "NM1", "screens": [],
            "last_reading": "2026-10-26", "days_since_last": 1}
    base.update(changes)
    return base


def test_suggestion_admits_only_when_every_screen_is_clear():
    assert nm.suggest(clear())[0] == "admit"
    assert nm.suggest(clear(in_scope=False))[0] == "hold"
    assert "ADR-053" in nm.suggest(clear(in_scope=False))[1]
    assert nm.suggest(clear(rule_admitted=False, reason="no dam"))[0] == "hold"
    assert nm.suggest(clear(match_confirmed_by="name"))[0] == "hold"
    assert nm.suggest(clear(screens=[{"screen": "spike", "detail": "x"}]))[0] == "hold"
    assert nm.suggest(clear(current=False))[0] == "hold"
    assert nm.suggest(clear(readings=0))[0] == "reject"
    twin = {"provider": "rise", "station": "9", "name": "N"}
    assert nm.suggest(clear(duplicate_of=twin))[0] == "reject"


def test_one_rise_item_per_location_is_kept_and_the_rest_reported():
    rows = [
        {"station": "6170", "rise_location_id": "7", "readings": 80000,
         "last_reading": "2026-10-26"},
        {"station": "724", "rise_location_id": "7", "readings": 1966,
         "last_reading": "2026-10-26"},
        {"station": "268", "rise_location_id": "8", "readings": 1965,
         "last_reading": "2026-10-26"},
    ]
    kept = nm.best_item_per_location(rows)
    assert {r["station"] for r in kept} == {"6170", "268"}
    seven = next(r for r in kept if r["rise_location_id"] == "7")
    assert seven["other_items"][0]["item_id"] == "724"


def test_a_dam_already_on_the_roster_is_set_aside_by_identity():
    rows = [{"provider": "rise", "station": "613", "provider_name": "Navajo",
             "nid_id": "NM00120"},
            {"provider": "rise", "station": "335", "provider_name": "El Vado",
             "nid_id": "NM10008"},
            {"provider": "usgs", "station": "1", "provider_name": "No Dam",
             "nid_id": None}]
    fresh, held = nm.split_published(rows, {"NM00120": "09109090:NM:BOR"})
    assert [r["station"] for r in fresh] == ["335", "1"]
    assert held[0]["published_as"] == "09109090:NM:BOR"
    assert held[0]["published_by"] == "dam identity"
