"""What settles a published point, and what only looks like it does.

Network-free and free of today's numbers: every row here is synthetic. Two
rules are held. A reviewer's notes column carries names *and* remarks, and a
remark read as a name can never match anything, so the row it belongs to can
never be settled by any evidence. And the dam inventory confirms a position,
not a name -- it is a register of structures, so it says where the water is
held, never what the water is called.
"""

from tools.classify_water_body_points import claimed_name, judge


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
    verdict = judge(row(dam_1km="Long Hollow (CO03021) at 0.01 km"),
                    "Long Hollow Reservoir")
    assert verdict["verdict"] == "confirmed by dam position"
    # A dam's name is not a water body's name; nothing here has named the water.
    assert verdict["proposed_name"] == ""
    # ADR-015 rule 7: the identifier and the distance are the evidence.
    assert "CO03021" in verdict["why"] and "0.01 km" in verdict["why"]


def test_a_dam_beyond_the_threshold_settles_nothing_and_is_reported():
    verdict = judge(row(dam_beyond_1km="Scofield Dam (UT10133) at 6.02 km"),
                    "Scofield")
    assert verdict["verdict"] == "human review"
    assert "Scofield Dam" in verdict["why"]


def test_a_subsidiary_structure_does_not_confirm_the_reservoir():
    verdict = judge(row(dam_1km="Grantsville Regulating Pond (UT00577) at 0.4 km"),
                    "Grantsville")
    assert verdict["verdict"] == "human review"


def test_a_water_publication_outranks_the_dam_inventory():
    """Both name the claimed water; the publication that names *water* wins."""
    verdict = judge(row(gnis_1km="Bass Lake",
                        dam_1km="Bass (CA00341) at 0.10 km",
                        sources_within_1km="gnis"), "Bass Lake")
    assert verdict["verdict"] == "confirmed"
    assert verdict["proposed_name"] == "Bass Lake"
    assert verdict["agreeing_sources"] == "gnis_1km"
