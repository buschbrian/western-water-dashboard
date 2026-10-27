"""The review page's bundle takes the worksheet's fields and keeps its own."""

import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from tools import build_gauge_review as G  # noqa: E402
from tools import build_gauge_review_page as P  # noqa: E402


def row(site, **values):
    base = dict.fromkeys(G.FIELDS, "")
    base.update(usgs_site_no=site, site_name="PROVO RIVER NEAR WOODLAND, UT",
                trace_screen="traced", covers_1991_2020="yes", suggested_ruling="reservoir",
                suggestion_reason="4 inventoried dams upstream hold 12% of a year's flow",
                review_queue="bulk", huc8_name="Provo", mean_flow_cfs="165.8",
                flow_years="35", dams_upstream="4", dam_storage_af="541138",
                storage_share_pct="12.0", largest_dams="Jordanelle Dam (363,000 AF); Deer Creek Dam (161,070 AF)",
                irrigation_dams="2", dams_near_gauge="")
    base.update(values)
    return base


def test_worksheet_fields_replace_the_old_suggestion_and_the_page_keeps_its_own():
    bundle = {"screened": "2026-10-23", "outline": [[0, 0]], "gauges": [
        {"site": "1", "tier": "natural", "reason": "old", "shape": [[[0, 0]]], "map": {"width": 960}}]}
    page = P.refresh(bundle, {"1": row("1")})
    gauge = page["gauges"][0]
    assert gauge["tier"] == "reservoir" and gauge["queue"] == "bulk"
    assert gauge["shape"] == [[[0, 0]]] and gauge["map"] == {"width": 960}
    assert gauge["flow"] == 165.8 and gauge["flowYears"] == 35 and gauge["share"] == 12
    assert gauge["largest"] == ["Jordanelle Dam (363,000 AF)", "Deer Creek Dam (161,070 AF)"]
    assert gauge["nearDams"] == []
    assert page["screened"] == "2026-10-23" and page["outline"] == [[0, 0]]


def test_missing_evidence_is_null_not_zero():
    gauge = P.page_fields(row("1", mean_flow_cfs="", storage_share_pct="", dams_upstream=""))
    assert gauge["flow"] is None and gauge["share"] is None and gauge["dams"] is None


def test_the_bundle_and_the_worksheet_must_list_the_same_gauges():
    with pytest.raises(ValueError, match="disagree on 1 gauges: 2"):
        P.refresh({"gauges": [{"site": "1"}]}, {"1": row("1"), "2": row("2")})


def test_reference_evidence_and_the_diversion_flag_reach_the_page():
    plain = P.page_fields(row("1", dams_upstream="", storage_share_pct="", dam_storage_af="",
                              gages2_class="reference", usgs_site_type="ST", nrcs_adjustment_pct="25.9",
                              accepted_display_name="Provo River near Woodland"))
    assert plain["gages2"] == "reference" and plain["siteType"] == "ST" and plain["nrcs"] == 25.9
    assert plain["acceptedName"] == "Provo River near Woodland" and plain["diversion"] is True
    quiet = P.page_fields(row("2", nrcs_adjustment_pct="no_pair", upstream_reservoirs="Deer Creek"))
    assert quiet["nrcs"] is None and quiet["gages2"] is None and quiet["diversion"] is False


def test_the_page_names_the_tiers_as_the_worksheet_does():
    html = (ROOT / "tools" / "gauge-review" / "index.html").read_text(encoding="utf-8")
    block = html[html.index("const TIERS = ["):html.index("const TIER = ")]
    page = re.findall(r'id: "(\w+)", label: "([^"]+)"', block)
    assert page == [(key, G.TIER_WORDS[key]) for key in ("natural", "reservoir", "diversion",
                                                         "short", "check", "exclude")]
    assert set(key for key, _ in page) == set(G.SUGGESTIONS)
