"""The gauge review builder's rules, without the network.

What is tested is what the worksheet may claim: which series count as an
active Utah gauge, that a service failure is never written as a finding
about the river, that an upstream reservoir is listed by containment and
nothing else, and that a rerun keeps every ruling and every row it was not
asked about.
"""

import datetime as dt
import json
import sys
import urllib.error
import urllib.parse
from pathlib import Path

import pytest

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


# --- the storage evidence ----------------------------------------------------

def dam(name, lon=-111.5, lat=40.5, storage=1000.0, irrigation=False):
    return {"id": name, "name": name, "lon": lon, "lat": lat,
            "storage_af": storage, "irrigation": irrigation}


GAUGE_ROW = {"usgs_site_no": "1", "longitude": "-111.01", "latitude": "40.01"}


def test_a_dam_without_a_position_is_dropped_and_irrigation_is_read_from_purposes():
    assert G.dam_record({"NAME": "X", "LATITUDE": None, "LONGITUDE": -111}) is None
    record = G.dam_record({"NAME": "Mill Meadow", "LATITUDE": 38.5, "LONGITUDE": -111.6,
                           "NID_STORAGE": 6870, "PURPOSES": "Recreation, Irrigation"})
    assert record["storage_af"] == 6870 and record["irrigation"] is True


def test_annual_means_are_read_from_the_rdb_answer():
    rdb = ("# comment\nagency_cd\tsite_no\tparameter_cd\tts_id\tloc_web_ds\tyear_nu\tmean_va\n"
           "5s\t15s\t5s\t10n\t15s\t4s\t12n\n"
           "USGS\t09379500\t00060\t1\t\t1990\t3000\nUSGS\t09379500\t00060\t1\t\t1991\t2000\n")
    assert G.parse_annual_means(rdb) == {"09379500": {1990: 3000.0, 1991: 2000.0}}


def test_mean_flow_prefers_1991_on_and_falls_back_to_the_whole_record():
    long = {year: 100.0 if year >= 1991 else 900.0 for year in range(1980, 2000)}
    assert G.mean_flow(long) == (100.0, 9)
    short = {1985: 10.0, 1992: 20.0}
    assert G.mean_flow(short) == (15.0, 2)
    assert G.mean_flow({}) == (None, 0)


def test_storage_is_summed_inside_the_basin_and_shared_against_a_years_flow():
    dams = [dam("Inside", storage=7244.0, irrigation=True),
            dam("Outside", lon=-110.0, storage=99999.0)]
    years = {year: 100.0 for year in range(1991, 2001)}
    result = G.storage_evidence(GAUGE_ROW, SQUARE_BASIN, dams, years)
    assert result["dams_upstream"] == 1
    assert result["dam_storage_af"] == 7244
    # 100 cfs for a year is about 72,445 acre-feet.
    assert result["storage_share_pct"] == 10.0
    assert result["irrigation_dams"] == 1
    assert result["largest_dams"] == "Inside (7,244 AF)"
    assert result["dams_near_gauge"] == ""


def test_a_dike_is_not_counted_as_a_second_pool():
    dams = [dam("Granby Dam", storage=539760.0),
            dam("Granby Dike 1", lon=-111.45, storage=539760.0),
            dam("Far Twin", lon=-111.05, lat=40.95, storage=539760.0)]
    result = G.storage_evidence(GAUGE_ROW, SQUARE_BASIN, dams, None)
    assert result["dams_upstream"] == 3
    assert result["dam_storage_af"] == 2 * 539760
    assert "Granby Dike" not in result["largest_dams"]
    assert result["storage_share_pct"] == "" and result["mean_flow_cfs"] == ""


def test_a_dam_beside_the_gauge_is_named_because_it_may_be_below_it():
    result = G.storage_evidence(GAUGE_ROW, SQUARE_BASIN, [dam("Weir", lon=-111.012, lat=40.012)], None)
    assert result["dams_near_gauge"] == "Weir"


def test_no_basin_gives_flow_but_no_storage_claims():
    result = G.storage_evidence(GAUGE_ROW, [], [dam("Inside")], {2000: 5.0})
    assert result["mean_flow_cfs"] == 5.0
    assert result["dams_upstream"] == ""


def test_dams_are_fetched_by_id_and_a_short_answer_is_refused(monkeypatch):
    attrs = {i: {"OBJECTID": i, "NAME": f"D{i}", "LATITUDE": 40.5, "LONGITUDE": -111.5,
                 "NID_STORAGE": i} for i in range(1, 6)}

    def fake(url, timeout=None, headers=None):
        if "returnIdsOnly" in url:
            return {"objectIds": [5, 3, 1, 2, 4]}
        asked = [int(i) for i in urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)["objectIds"][0].split(",")]
        return {"features": [{"attributes": attrs[i]} for i in asked if i in attrs]}

    monkeypatch.setattr(G.upstream, "get_json", fake)
    monkeypatch.setattr(G, "NID_BATCH", 2)
    assert [d["name"] for d in G.fetch_dams((-112, 40, -111, 41))] == ["D1", "D2", "D3", "D4", "D5"]
    del attrs[4]
    with pytest.raises(RuntimeError, match="named 5 dams and returned 4"):
        G.fetch_dams((-112, 40, -111, 41))


def test_page_basins_read_each_ring_as_its_own_polygon(tmp_path):
    ring = [[-112, 40], [-111, 40], [-111, 41], [-112, 40]]
    lobe = [[-110, 40], [-109, 40], [-109, 41], [-110, 40]]
    path = tmp_path / "gauges.json"
    path.write_text(json.dumps({"gauges": [
        {"site": "1", "shape": [ring, lobe]}, {"site": "3", "shape": []}]}))
    basins = G.load_page_basins(path)
    assert len(basins["1"]) == 2 and "3" not in basins
    box = G.upstream.bounds_of(G.upstream.polygons_to_rings(basins["1"]))
    assert G.upstream.points_in_basin((-109.5, 40.5), basins["1"], box)


# --- the suggestion with storage evidence, and the queue -----------------------

def test_small_storage_suggests_natural_and_large_storage_suggests_shaped():
    small = plain_row(dams_upstream="3", dam_storage_af="500", storage_share_pct="1.6",
                      upstream_reservoirs="Trial Lake")
    tier, reason = G.suggest(small)
    assert tier == "natural"
    assert "hold 1.6% of a year's flow" in reason
    assert G.suggest(plain_row(dams_upstream="1", storage_share_pct="2"))[0] == "shaped"


def test_storage_with_no_flow_to_compare_is_shaped_and_dams_without_storage_are_not():
    assert G.suggest(plain_row(dams_upstream="2", dam_storage_af="900"))[0] == "shaped"
    tier, reason = G.suggest(plain_row(dams_upstream="2", dam_storage_af="0"))
    assert tier == "natural" and "list no storage" in reason


def test_irrigation_dams_and_a_dam_by_the_gauge_are_kept_as_findings():
    tier, reason = G.suggest(plain_row(dams_upstream="1", dam_storage_af="10",
                                       storage_share_pct="0.1", irrigation_dams="1",
                                       dams_near_gauge="Weir"))
    assert tier == "natural"
    assert "1 irrigation dam upstream" in reason and "perhaps below it: Weir" in reason


def test_only_the_safe_direction_is_queued_for_bulk_agreement():
    queue = lambda **kw: G.review_queue(plain_row(**kw), G.suggest(plain_row(**kw))[0])
    assert queue(site_name="FAIRVIEW TUNNEL NEAR FAIRVIEW, UT") == "bulk"
    assert queue(dams_upstream="4", storage_share_pct="12") == "bulk"
    assert queue(site_name="BEAR RIVER BELOW O-LINE CANAL NR BRIGHAM CITY, UT") == "bulk"
    assert queue(dams_upstream="4", storage_share_pct="12", dams_near_gauge="Weir") == "review"
    # Storage known only from the published roster has no share to judge.
    assert queue(upstream_reservoirs="Deer Creek") == "review"
    assert queue() == "review"
    assert queue(trace_check="traced about 404 sq mi") == "check"


def test_writing_names_the_watershed_and_the_queue(tmp_path, monkeypatch):
    monkeypatch.setattr(G, "huc8_names", lambda: {"16020203": "Provo"})
    path = tmp_path / "gauge-review.csv"
    G.write_rows({"1": plain_row(huc8="16020203")}, path)
    row = G.read_rows(path)["1"]
    assert row["huc8_name"] == "Provo"
    assert row["review_queue"] == "review"


# --- states ----------------------------------------------------------------

def test_utah_keeps_the_worksheet_the_importer_and_the_page_read():
    assert G.STATES["UT"].output == G.OUTPUT_PATH
    assert G.OUTPUT_PATH.name == "gauge-review.csv"


def test_each_state_has_its_own_code_box_and_worksheet():
    assert {k: v.code for k, v in G.STATES.items()} == {
        "UT": "49", "CO": "08", "NM": "35", "AZ": "04"}
    assert len({v.output for v in G.STATES.values()}) == len(G.STATES)
    for key, state in G.STATES.items():
        west, south, east, north = map(float, state.bbox.split(","))
        assert west < east and south < north
        if key != "UT":
            assert state.output.name == f"gauge-review-{key.lower()}.csv"


def test_the_screen_asks_for_the_chosen_states_box_and_code(monkeypatch):
    urls = []
    monkeypatch.setattr(G, "usgs_features", lambda url: urls.append(url) or [])
    G.fetch_screen_inputs(G.STATES["CO"])
    queries = [urllib.parse.parse_qs(urllib.parse.urlparse(u).query) for u in urls]
    assert queries[0]["bbox"] == [G.STATES["CO"].bbox]
    assert queries[1]["state_code"] == ["08"]
    G.fetch_screen_inputs()
    assert urllib.parse.parse_qs(urllib.parse.urlparse(urls[3]).query)["state_code"] == ["49"]


def _run(monkeypatch, tmp_path, *argv):
    paths = {key: tmp_path / s.output.name for key, s in G.STATES.items()}
    monkeypatch.setattr(G, "STATES", {k: s._replace(output=paths[k])
                                      for k, s in G.STATES.items()})
    monkeypatch.setattr(G, "fetch_screen_inputs", lambda state=None: (
        [series("9")], [location("9")]))
    assert G.main([*argv, "--no-trace"]) == 0
    return paths


def test_a_state_run_writes_only_its_own_worksheet(monkeypatch, tmp_path):
    paths = _run(monkeypatch, tmp_path, "--state", "NM")
    assert paths["NM"].exists()
    assert [k for k, p in paths.items() if p.exists()] == ["NM"]


def test_no_state_means_utah(monkeypatch, tmp_path):
    paths = _run(monkeypatch, tmp_path)
    assert [k for k, p in paths.items() if p.exists()] == ["UT"]


def test_an_unknown_state_is_refused(capsys):
    with pytest.raises(SystemExit):
        G.main(["--state", "WY"])
