"""The gauge review builder's rules, without the network.

What is tested is what the worksheet may claim: which series count as an
active Utah gauge, that a service failure is never written as a finding
about the river, that an upstream reservoir is listed by containment and
nothing else, and that a rerun keeps every ruling and every row it was not
asked about.
"""

import datetime as dt
import sys
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from tools import build_gauge_review as G  # noqa: E402

TODAY = dt.date(2026, 10, 23)


def series(site, begin="1950-10-01", end="2026-10-21", primary="Primary"):
    return {"properties": {
        "monitoring_location_id": f"USGS-{site}", "primary": primary,
        "begin": f"{begin}T07:00:00+00:00" if begin else None,
        "end": f"{end}T06:00:00+00:00" if end else None}}


def location(site, agency="USGS", area=100.0):
    return {"id": f"{agency}-{site}",
            "geometry": {"type": "Point", "coordinates": [-111.7, 40.2]},
            "properties": {"monitoring_location_name": f"RIVER {site}",
                           "county_name": "Utah County",
                           "hydrologic_unit_code": "160202030405",
                           "drainage_area": area}}


# --- the screen ------------------------------------------------------------

def test_an_active_primary_utah_series_is_listed_with_its_evidence():
    rows = G.screen([series("10163000")], [location("10163000")], TODAY)
    row = rows["10163000"]
    assert row["huc8"] == "16020203"
    assert row["last_daily_value"] == "2026-10-21"
    assert row["covers_1991_2020"] == "yes"
    assert row["screened_on"] == "2026-10-23"


def test_a_series_quiet_past_the_window_is_not_active():
    late = (TODAY - dt.timedelta(days=G.ACTIVE_WITHIN_DAYS + 1)).isoformat()
    assert G.screen([series("1", end=late)], [location("1")], TODAY) == {}


def test_a_series_with_no_end_is_not_active():
    assert G.screen([series("1", end=None)], [location("1")], TODAY) == {}


def test_a_secondary_series_or_a_site_outside_utah_is_not_listed():
    assert G.screen([series("1", primary="Secondary")], [location("1")], TODAY) == {}
    # No Utah stream location answered for site 2.
    assert G.screen([series("2")], [location("1")], TODAY) == {}


def test_another_agencys_location_does_not_join_a_usgs_series():
    assert G.screen([series("1")], [location("1", agency="USBLM")], TODAY) == {}


def test_a_record_starting_after_1991_does_not_cover_the_climate_period():
    rows = G.screen([series("1", begin="1991-10-01")], [location("1")], TODAY)
    assert rows["1"]["covers_1991_2020"] == "no"


# --- the trace -------------------------------------------------------------

SQUARE_BASIN = [[[(-112.0, 40.0), (-111.0, 40.0), (-111.0, 41.0), (-112.0, 41.0)]]]
RESERVOIRS = [{"name": "Inside", "lon": -111.5, "lat": 40.5},
              {"name": "Outside", "lon": -110.0, "lat": 40.5}]
SITES = [{"station": "820:UT:SNTL", "lon": -111.4, "lat": 40.6}]


def test_a_trace_lists_what_sits_inside_the_basin_and_nothing_else():
    row = {"usgs_site_no": "1", "drainage_area_sq_mi": ""}
    result = G.trace(row, RESERVOIRS, SITES, fetch=lambda _: SQUARE_BASIN)
    assert result["trace_screen"] == "traced"
    assert result["upstream_reservoirs"] == "Inside"
    assert result["upstream_snow_sites"] == "820:UT:SNTL"
    assert result["trace_check"] == ""


def test_a_trace_far_from_the_published_drainage_area_is_flagged():
    row = {"usgs_site_no": "1", "drainage_area_sq_mi": "10.0"}
    result = G.trace(row, RESERVOIRS, SITES, fetch=lambda _: SQUARE_BASIN)
    assert result["trace_screen"] == "traced"
    assert "the gauge publishes 10 sq mi" in result["trace_check"]


def _raise(error):
    def fetch(_site):
        raise error
    return fetch


def test_a_gauge_nldi_does_not_know_is_a_final_screen():
    error = urllib.error.HTTPError("u", 404, "Not Found", {}, None)
    result = G.trace({"usgs_site_no": "1"}, [], [], fetch=_raise(error))
    assert result["trace_screen"] == "not_indexed"
    assert result["trace_screen"] in G.TRACE_FINAL


def test_a_service_failure_is_not_written_as_a_finding():
    for error in (urllib.error.HTTPError("u", 503, "Unavailable", {}, None),
                  urllib.error.URLError("refused"), TimeoutError("slow")):
        result = G.trace({"usgs_site_no": "1"}, RESERVOIRS, SITES, fetch=_raise(error))
        assert result["trace_screen"] not in G.TRACE_FINAL
        assert result["upstream_reservoirs"] == ""


def test_an_empty_basin_is_no_basin_never_an_empty_upstream_set():
    result = G.trace({"usgs_site_no": "1"}, RESERVOIRS, SITES, fetch=lambda _: [])
    assert result["trace_screen"] == "no_basin"


# --- the merge -------------------------------------------------------------

def reviewed_row(site, **overrides):
    row = dict.fromkeys(G.FIELDS, "")
    row.update(usgs_site_no=site, huc8="16020203", screened_on="2026-10-01",
               trace_screen="traced", upstream_reservoirs="Deer Creek",
               reviewer_ruling="admit", notes="below Deer Creek Dam")
    row.update(overrides)
    return row


def test_a_rerun_keeps_rulings_notes_and_trace_and_refreshes_the_screen():
    existing = {"1": reviewed_row("1")}
    fresh = G.screen([series("1")], [location("1")], TODAY)
    merged = G.merge_screen(existing, fresh)
    assert merged["1"]["reviewer_ruling"] == "admit"
    assert merged["1"]["notes"] == "below Deer Creek Dam"
    assert merged["1"]["upstream_reservoirs"] == "Deer Creek"
    assert merged["1"]["screened_on"] == "2026-10-23"


def test_a_gauge_that_stopped_reporting_keeps_its_row_and_its_date():
    merged = G.merge_screen({"1": reviewed_row("1")}, {})
    assert merged["1"]["screened_on"] == "2026-10-01"


def test_only_leaves_every_other_row_untouched():
    existing = {"1": reviewed_row("1"), "2": reviewed_row("2")}
    fresh = G.screen([series("1"), series("2")],
                     [location("1"), location("2")], TODAY)
    merged = G.merge_screen(existing, fresh, only={"1"})
    assert merged["1"]["screened_on"] == "2026-10-23"
    assert merged["2"]["screened_on"] == "2026-10-01"


def test_the_worksheet_round_trips_in_a_stable_order(tmp_path):
    path = tmp_path / "gauge-review.csv"
    rows = {"2": reviewed_row("2", huc8="14060001"), "1": reviewed_row("1")}
    G.write_rows(rows, path)
    assert G.read_rows(path) == rows
    lines = path.read_text(encoding="utf-8").splitlines()
    assert lines[0].split(",") == G.FIELDS
    assert [line.split(",")[0] for line in lines[1:]] == ["2", "1"]


# --- the suggestion ----------------------------------------------------------

def plain_row(name="PROVO RIVER NEAR WOODLAND, UT", **overrides):
    row = dict.fromkeys(G.FIELDS, "")
    row.update(usgs_site_no="1", site_name=name, trace_screen="traced",
               covers_1991_2020="yes", upstream_snow_sites="Trial Lake")
    row.update(overrides)
    return row


def test_a_traced_long_record_with_nothing_upstream_is_natural():
    tier, reason = G.suggest(plain_row())
    assert tier == "natural"
    assert "snow sites upstream" in reason


def test_a_tunnel_is_excluded_but_a_creek_measured_at_one_is_not():
    assert G.suggest(plain_row("FAIRVIEW TUNNEL NEAR FAIRVIEW, UT"))[0] == "exclude"
    assert G.suggest(plain_row("MILL CREEK AT SHELEY TUNNEL, NEAR MOAB, UT"))[0] == "natural"
    assert G.suggest(plain_row("SUMMIT CREEK ABV SUMMIT CR CANAL NR SANTAQUIN UT"))[0] == "natural"


def test_a_basin_problem_outranks_storage_and_every_finding_is_kept():
    tier, reason = G.suggest(plain_row(
        trace_check="traced about 404 sq mi; the gauge publishes 50 sq mi",
        upstream_reservoirs="Deer Creek; Jordanelle", covers_1991_2020="no",
        record_begin="1993-05-01"))
    assert tier == "check"
    assert "2 published reservoirs upstream" in reason
    assert "record starts 1993-05-01" in reason


def test_storage_or_a_named_diversion_upstream_is_shaped():
    assert G.suggest(plain_row(upstream_reservoirs="Deer Creek"))[0] == "shaped"
    assert G.suggest(plain_row("BEAR RIVER BELOW O-LINE CANAL NR BRIGHAM CITY, UT"))[0] == "shaped"


def test_an_untraced_gauge_is_never_suggested_as_natural():
    assert G.suggest(plain_row(trace_screen=""))[0] == "check"


def test_writing_fills_the_suggestion_and_never_the_ruling(tmp_path):
    path = tmp_path / "gauge-review.csv"
    G.write_rows({"1": plain_row()}, path)
    row = G.read_rows(path)["1"]
    assert row["suggested_ruling"] == "natural"
    assert row["usgs_page"].endswith("/USGS-1/")
    assert row["reviewer_ruling"] == ""
