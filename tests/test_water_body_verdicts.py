"""What settles a published point, and what only looks like it does.

Network-free and free of today's numbers: every row here is synthetic. Two
rules are held. A reviewer's notes column carries names *and* remarks, and a
remark read as a name can never match anything, so the row it belongs to can
never be settled by any evidence. And the dam inventory confirms a position,
not a name -- it is a register of structures, so it says where the water is
held, never what the water is called.
"""

import csv
import json

import pytest

import tools.verify_dam_position as dam_position
from tools.classify_water_body_points import claimed_name, judge
from tools.verify_dam_position import evidence


def row(**answers):
    """A verification row with every source silent unless named."""
    blank = {c: "" for c in ("gnis_1km", "nhd_waterbody_1km", "nhd_area_1km",
                             "nhd_medium_1km", "esri_1km", "dam_1km",
                             "dam_beyond_1km", "beyond_1km",
                             "sources_within_1km")}
    return blank | answers


def test_a_remark_about_the_point_is_not_a_name_for_the_water():
    assert claimed_name("Los Vaqueros Reservoir",
                        "point is slightly off") == "Los Vaqueros Reservoir"
    assert claimed_name("Scofield", "incorrect point") == "Scofield"
    assert claimed_name("Folsom Lake",
                        "this might be two separate dams") == "Folsom Lake"


def test_not_on_water_is_a_remark_because_water_is_not_a_water_body():
    assert claimed_name("Kolob Reservoir",
                        "incorrect lat long not on water") == "Kolob Reservoir"


def test_a_rename_survives_even_when_it_shares_no_word_with_the_reservoir():
    assert claimed_name("Crane Valley", "Bass Lake") == "Bass Lake"
    assert claimed_name("Oroville Dam", "Lake Oroville") == "Lake Oroville"


def test_a_dam_of_the_claimed_name_inside_the_threshold_confirms_the_position():
    # Built by the tool that writes the column, so the two cannot drift apart.
    verdict = judge(row(dam_1km=evidence(0.01, "Long Hollow", "CO03021")),
                    "Long Hollow Reservoir")
    assert verdict["verdict"] == "confirmed by dam position"
    # A dam's name is not a water body's name; nothing here has named the water.
    assert verdict["proposed_name"] == ""
    # ADR-015 rule 7: the identifier and the distance are the evidence.
    assert "CO03021" in verdict["why"] and "0.01 km" in verdict["why"]


def test_a_dam_beyond_the_threshold_settles_nothing_and_is_reported():
    verdict = judge(row(dam_beyond_1km=evidence(6.02, "Scofield Dam", "UT10133")),
                    "Scofield")
    assert verdict["verdict"] == "human review"
    assert "Scofield Dam" in verdict["why"]


def test_a_subsidiary_structure_does_not_confirm_the_reservoir():
    verdict = judge(
        row(dam_1km=evidence(0.4, "Grantsville Regulating Pond", "UT00577")),
        "Grantsville")
    assert verdict["verdict"] == "human review"


def test_a_water_publication_outranks_the_dam_inventory():
    """Both name the claimed water; the publication that names *water* wins."""
    verdict = judge(row(gnis_1km="Bass Lake",
                        dam_1km=evidence(0.10, "Bass", "CA00341"),
                        sources_within_1km="gnis"), "Bass Lake")
    assert verdict["verdict"] == "confirmed"
    assert verdict["proposed_name"] == "Bass Lake"
    assert verdict["agreeing_sources"] == "gnis_1km"


@pytest.mark.parametrize("answer", [
    None, {}, ["unexpected response"],
    {"features": [], "exceededTransferLimit": True},
])
def test_a_service_that_does_not_answer_keeps_the_evidence_it_cannot_replace(
        tmp_path, monkeypatch, answer):
    """An outage must not read as "no dam is there".

    The tool re-asks the rows it settled, so a run against a silent service
    would otherwise blank the columns and demote every dam confirmation back
    to human review the next time the classifier runs.
    """
    settled = evidence(0.19, "Los Vaqueros", "CA01396")
    (tmp_path / "reservoirs.json").write_text(json.dumps(
        {"reservoirs": [{"name": "Los Vaqueros Reservoir",
                         "lat": 37.838, "lon": -121.726}]}))
    verification = tmp_path / "point-verification.csv"
    with verification.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["reservoir", "verdict",
                                                    "dam_1km", "dam_beyond_1km"])
        writer.writeheader()
        writer.writerow({"reservoir": "Los Vaqueros Reservoir",
                         "verdict": "confirmed by dam position",
                         "dam_1km": settled, "dam_beyond_1km": ""})

    monkeypatch.setattr(dam_position, "ROOT", tmp_path)
    monkeypatch.setattr(dam_position, "get_json", lambda url, params: answer)
    assert dam_position.main() == 1, "a partial run must not exit clean"

    after = list(csv.DictReader(verification.open(encoding="utf-8")))
    assert after[0]["dam_1km"] == settled


def test_an_answer_of_no_dams_is_not_the_same_fact_as_no_answer(monkeypatch):
    """`None` is "the service did not answer"; `[]` is "it answered, nothing there"."""
    monkeypatch.setattr(dam_position.time, "sleep", lambda _: None)

    monkeypatch.setattr(dam_position, "get_json", lambda url, params: None)
    assert dam_position.dams_near(40.0, -111.0) is None

    monkeypatch.setattr(dam_position, "get_json",
                        lambda url, params: {"error": {"message": "refused"}})
    assert dam_position.dams_near(40.0, -111.0) is None

    monkeypatch.setattr(dam_position, "get_json",
                        lambda url, params: {"features": []})
    assert dam_position.dams_near(40.0, -111.0) == []
