"""The operating-character census's rules, on synthetic rows and no network.

Every proposal the census makes is a named test over evidence rows, so the
rules are what is tested here: what each one requires, what it refuses, and
the two properties ADR-114 is strict about --

  * the observed series never decides a character. Two reservoirs with
    opposite series and identical evidence get identical proposals;
  * an NHD FType alone never types a water, because ADR-078 measured it
    calling twenty-five of twenty-six dammed impoundments a lake.

The arithmetic is here too. A residence-time proxy and an elongation are the
two figures a reviewer reads off this census without checking, so both are
pinned to worked examples rather than to whatever the code returns today.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from tools.audit_operating_character import (  # noqa: E402
    AF_PER_CFS_DAY, agreement, convex_hull, elongation_from_bbox,
    elongation_from_rings, natural_lake_flag, observed_signature,
    oriented_extent, point_in_rings, principal_structure, propose,
    propose_flood_space, propose_restricted, propose_run_of_river,
    purpose_list, residence_time_days, review_links,
)


# --- the residence-time proxy ---------------------------------------------

def test_a_navigation_pool_replaces_itself_in_days():
    """Lake Wallula's committed figures: 1,350,000 acre-feet on 181,527 cfs."""
    days = residence_time_days(1_350_000.0, 181_527.0)
    assert days is not None
    assert 3.5 < days < 4.0


def test_a_storage_reservoir_replaces_itself_in_years():
    days = residence_time_days(1_350_000.0, 500.0)
    assert days is not None and days > 365


def test_the_proxy_is_the_stated_arithmetic_and_not_an_approximation_of_it():
    assert residence_time_days(1000.0, 10.0) == 1000.0 / (10.0 * AF_PER_CFS_DAY)


def test_a_missing_or_zero_flow_is_unanswered_rather_than_infinite():
    assert residence_time_days(1000.0, None) is None
    assert residence_time_days(1000.0, 0.0) is None
    assert residence_time_days(None, 100.0) is None
    assert residence_time_days(0.0, 100.0) is None


# --- shape -----------------------------------------------------------------

#: Square on the ground rather than square in degrees: at latitude 40 a
#: degree of longitude is 0.766 of a degree of latitude, so a pool drawn
#: 0.01 by 0.01 in degrees is a third longer north to south than it is wide.
SQUARE = [[0.0, 40.0], [0.0130541, 40.0], [0.0130541, 40.01], [0.0, 40.01],
          [0.0, 40.0]]


def test_a_square_pool_is_not_elongated():
    shape = elongation_from_rings([SQUARE])
    assert shape is not None
    assert 0.9 < shape["elongation"] < 1.15


def test_a_riverine_pool_reads_long_and_narrow():
    ring = [[0.0, 40.0], [0.2, 40.0], [0.2, 40.002], [0.0, 40.002], [0.0, 40.0]]
    shape = elongation_from_rings([ring])
    assert shape["elongation"] > 20
    assert shape["long_axis_km"] > shape["short_axis_km"]


def test_the_shape_is_measured_from_the_water_and_not_from_a_north_south_box():
    """The reason the census does not settle for a bounding-box ratio.

    A long, narrow pool lying north-east fills a nearly square bounding box.
    The oriented rectangle turns with the water and still calls it narrow.
    """
    ring = [[0.0, 40.0], [0.1, 40.08], [0.1002, 40.0801], [0.0002, 40.0001]]
    oriented = elongation_from_rings([ring])
    box = elongation_from_bbox({"xmin": 0.0, "ymin": 40.0,
                                "xmax": 0.1002, "ymax": 40.0801})
    assert oriented["elongation"] > 20
    assert box["elongation"] < 3


def test_the_bounding_box_fallback_says_that_is_what_it_is():
    box = elongation_from_bbox({"xmin": 0.0, "ymin": 40.0,
                                "xmax": 0.2, "ymax": 40.002})
    assert "fallback" in box["basis"]
    assert "oriented" in elongation_from_rings([SQUARE])["basis"]


def test_a_degenerate_shape_returns_nothing_rather_than_a_ratio():
    assert elongation_from_rings([]) is None
    assert elongation_from_rings([[[0.0, 40.0], [0.1, 40.0]]]) is None
    assert elongation_from_bbox(None) is None


def test_the_hull_drops_a_point_inside_the_water():
    hull = convex_hull([(0, 0), (10, 0), (10, 10), (0, 10), (5, 5)])
    assert (5, 5) not in hull
    assert len(hull) == 4


def test_the_oriented_rectangle_turns_with_a_diagonal_shape():
    long_side, short_side = oriented_extent(
        [(0, 0), (100, 100), (101, 99), (1, -1)])
    assert long_side > 100 and short_side < 3


# --- which polygon holds the point -----------------------------------------

OUTER = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [0.0, 0.0]]
ISLAND = [[4.0, 4.0], [6.0, 4.0], [6.0, 6.0], [4.0, 6.0], [4.0, 4.0]]
SECOND_PART = [[20.0, 0.0], [30.0, 0.0], [30.0, 10.0], [20.0, 10.0], [20.0, 0.0]]


def test_a_point_in_the_water_is_inside():
    assert point_in_rings((1.0, 1.0), [OUTER, ISLAND]) is True


def test_a_point_on_an_island_is_not_in_the_water():
    assert point_in_rings((5.0, 5.0), [OUTER, ISLAND]) is False


def test_a_point_in_a_second_part_is_still_in_the_water():
    """Why even-odd and not `huc.in_polygon`.

    A reservoir published as several rings is parts and islands, not one
    outer boundary and a list of holes, so reading ring 0 as the boundary
    would place a point in the far arm outside its own lake.
    """
    assert point_in_rings((25.0, 5.0), [OUTER, ISLAND, SECOND_PART]) is True


# --- the inventory row that describes the project --------------------------

LOCK_AND_DAM = {"NAME": "Mcnary Lock and Dam", "IS_ASSOCIATED_STRUCTURE": "No",
                "NID_STORAGE": 1_350_000.0, "PURPOSES": "Navigation"}
LEVEE = {"NAME": "Mcnary Lock and Dam - Kennewick Levee 20",
         "IS_ASSOCIATED_STRUCTURE": "No", "NID_STORAGE": None,
         "PURPOSES": "Flood Risk Reduction"}
FOREBAY = {"NAME": "Box Canyon Forebay Dam", "IS_ASSOCIATED_STRUCTURE": "Yes",
           "NID_STORAGE": 36.0, "PURPOSES": "Hydroelectric"}


def test_a_project_resolves_to_its_dam_and_not_to_one_of_its_levees():
    assert principal_structure([LEVEE, LOCK_AND_DAM])["NAME"] == \
        "Mcnary Lock and Dam"


def test_an_associated_structure_never_speaks_for_the_project():
    assert principal_structure([FOREBAY, LOCK_AND_DAM])["NAME"] == \
        "Mcnary Lock and Dam"


def test_the_same_rows_in_another_order_name_the_same_structure():
    """A rebuild has to give the same answer twice; the service does not
    promise an order."""
    assert principal_structure([LEVEE, FOREBAY, LOCK_AND_DAM]) == \
        principal_structure([LOCK_AND_DAM, FOREBAY, LEVEE])


def test_a_project_of_nothing_but_dikes_still_resolves_to_one_of_them():
    rows = [{"NAME": "Some Dam - West Dike", "IS_ASSOCIATED_STRUCTURE": "Yes",
             "NID_STORAGE": None},
            {"NAME": "Some Dam - East Dike", "IS_ASSOCIATED_STRUCTURE": "Yes",
             "NID_STORAGE": None}]
    assert principal_structure(rows)["NAME"] == "Some Dam - East Dike"


def test_no_rows_is_no_record():
    assert principal_structure([]) is None


def test_purposes_are_read_as_a_list():
    assert purpose_list("Navigation, Hydroelectric, Recreation") == \
        ["Navigation", "Hydroelectric", "Recreation"]
    assert purpose_list(None) == []


# --- run_of_river ----------------------------------------------------------

NAVIGATION_DAM = {
    "purposes": ["Fish and Wildlife Pond", "Hydroelectric", "Navigation",
                 "Recreation"],
    "primary_purpose": "Navigation", "number_of_locks": 1,
    "source_url": "https://example.invalid/nid",
}
BIG_RIVER = {"gnis_name": "Snake River", "total_drainage_area_sq_km": 267_000.0,
             "mean_annual_flow_cfs": 50_000.0,
             "source_url": "https://example.invalid/nhd"}
SMALL_CREEK = {"gnis_name": "Martis Creek",
               "total_drainage_area_sq_km": 104.8,
               "mean_annual_flow_cfs": 63.2,
               "source_url": "https://example.invalid/nhd"}


def test_a_navigation_pool_on_a_big_river_that_turns_over_in_days():
    proposal = propose_run_of_river(NAVIGATION_DAM, BIG_RIVER, 4.25)
    assert proposal["operating_character"] == "run_of_river"
    assert proposal["confidence"] == "high"
    assert any(row["what"] == "residence-time proxy (days)"
               for row in proposal["evidence"])


def test_a_hydroelectric_dam_on_a_headwater_creek_is_not_run_of_river():
    dam = {**NAVIGATION_DAM, "purposes": ["Hydroelectric"],
           "number_of_locks": 0}
    assert propose_run_of_river(dam, SMALL_CREEK, 2.0) is None


def test_a_storage_reservoir_on_a_big_river_is_not_run_of_river():
    """Lake Mead is on the Colorado and holds five hundred days of it."""
    dam = {**NAVIGATION_DAM, "purposes": ["Hydroelectric", "Water Supply"],
           "number_of_locks": 0}
    assert propose_run_of_river(dam, BIG_RIVER, 500.15) is None


def test_a_water_supply_dam_never_reaches_the_other_two_legs():
    dam = {**NAVIGATION_DAM, "purposes": ["Water Supply", "Irrigation"],
           "number_of_locks": 0}
    assert propose_run_of_river(dam, BIG_RIVER, 2.0) is None


def test_a_fast_pool_without_a_lock_is_proposed_less_confidently():
    dam = {**NAVIGATION_DAM, "purposes": ["Hydroelectric"],
           "primary_purpose": "Hydroelectric", "number_of_locks": 0}
    assert propose_run_of_river(dam, BIG_RIVER, 3.0)["confidence"] == "medium"


def test_an_unanswered_flow_is_not_a_run_of_river_proposal():
    assert propose_run_of_river(NAVIGATION_DAM, BIG_RIVER, None) is None
    assert propose_run_of_river(NAVIGATION_DAM, None, 3.0) is None
    assert propose_run_of_river(None, BIG_RIVER, 3.0) is None


# --- flood_space -----------------------------------------------------------

SEVEN_OAKS = {"primary_purpose": "Flood Risk Reduction",
              "purposes": ["Flood Risk Reduction"], "normal_storage_af": None,
              "max_storage_af": 145_600.0, "federal_operator": None,
              "federal_owner": None, "source_url": "https://example.invalid/nid"}
MARTIS_CREEK = {"primary_purpose": "Flood Risk Reduction",
                "purposes": ["Flood Risk Reduction", "Hydroelectric",
                             "Recreation"],
                "normal_storage_af": 22_000.0, "max_storage_af": 34_600.0,
                "federal_operator": "US Army Corps of Engineers",
                "federal_owner": "US Army Corps of Engineers",
                "source_url": "https://example.invalid/nid"}
GRAND_COULEE = {"primary_purpose": "Flood Risk Reduction",
                "purposes": ["Flood Risk Reduction", "Irrigation"],
                "normal_storage_af": 9_562_000.0,
                "max_storage_af": 9_715_346.0,
                "federal_operator": "Bureau of Reclamation",
                "federal_owner": "Bureau of Reclamation",
                "source_url": "https://example.invalid/nid"}


def test_a_dam_built_for_floods_alone_is_proposed_with_confidence():
    proposal = propose_flood_space(SEVEN_OAKS)
    assert proposal["operating_character"] == "flood_space"
    assert proposal["confidence"] == "high"


def test_a_corps_flood_project_whose_pools_do_not_separate_it_is_still_proposed():
    """Martis Creek is why the operating-agency leg exists: its conservation
    pool is 64% of its maximum, which no storage test catches. On the
    inventory alone it is indistinguishable from a Corps project that fills
    every summer, so it is proposed and it is proposed with least confidence."""
    proposal = propose_flood_space(MARTIS_CREEK)
    assert proposal["operating_character"] == "flood_space"
    assert proposal["confidence"] == "low"


def test_a_pool_the_map_shows_nearly_empty_is_proposed_with_confidence():
    """The geospatial leg: NHD maps 62 acres of water inside Martis Creek's
    768-acre pool. Two agencies measuring the same reservoir from different
    sides, and neither of them is the series."""
    mapped = {"share": 0.081, "polygon_is_a_plausible_match": True,
              "basis": "mapped water over inventory pool"}
    assert propose_flood_space(MARTIS_CREEK, mapped)["confidence"] == "high"


def test_a_polygon_that_missed_the_reservoir_never_raises_confidence():
    """A waterbody match that landed on a side pond reads as an empty pool
    for a reservoir that is full."""
    missed = {"share": 0.001, "polygon_is_a_plausible_match": False,
              "basis": "mapped water over inventory pool"}
    assert propose_flood_space(MARTIS_CREEK, missed)["confidence"] == "low"


def test_the_mapped_pool_share_is_the_two_agencies_divided():
    from tools.audit_operating_character import mapped_pool_share
    share = mapped_pool_share(
        {"area_sq_km": 0.251, "contains_the_point": False,
         "candidates_within_tolerance": 1}, {"surface_area_acres": 768.0})
    assert share["share"] == 0.081
    assert share["polygon_is_a_plausible_match"] is True
    assert mapped_pool_share(None, {"surface_area_acres": 768.0}) is None
    assert mapped_pool_share({"area_sq_km": 0.251}, {"surface_area_acres": 0}) is None


def test_a_dam_point_outside_its_own_pool_is_still_a_usable_match():
    """124 of the 356 polygons this census found do not hold the published
    point, because a dam point is on the dam. One candidate inside the
    tolerance is what makes the match usable, not containment."""
    from tools.audit_operating_character import mapped_pool_share
    ambiguous = mapped_pool_share(
        {"area_sq_km": 0.251, "contains_the_point": False,
         "candidates_within_tolerance": 2}, {"surface_area_acres": 768.0})
    assert ambiguous["polygon_is_a_plausible_match"] is False


def test_a_polygon_a_hundredth_of_the_pool_is_not_the_pool():
    from tools.audit_operating_character import mapped_pool_share
    tiny = mapped_pool_share(
        {"area_sq_km": 0.002, "contains_the_point": False,
         "candidates_within_tolerance": 1}, {"surface_area_acres": 6900.0})
    assert tiny["polygon_is_a_plausible_match"] is False


def test_a_federal_flood_purpose_run_as_storage_is_not_flood_space():
    """Grand Coulee's primary purpose is flood risk reduction and it fills
    every year. The leg names the operating agency for exactly this."""
    assert propose_flood_space(GRAND_COULEE) is None


def test_a_conservation_pool_far_below_the_maximum_is_proposed():
    detroit = {**GRAND_COULEE, "normal_storage_af": 155_000.0,
               "max_storage_af": 455_000.0,
               "federal_operator": "Bureau of Reclamation"}
    assert propose_flood_space(detroit)["confidence"] == "medium"


def test_a_dam_with_another_primary_purpose_is_never_flood_space():
    supply = {**SEVEN_OAKS, "primary_purpose": "Water Supply",
              "purposes": ["Water Supply"]}
    assert propose_flood_space(supply) is None
    assert propose_flood_space(None) is None


# --- restricted ------------------------------------------------------------

def test_a_dated_order_carries_its_date_and_its_authority():
    proposal = propose_restricted(("cdec", "ELC"))
    assert proposal["operating_character"] == "restricted"
    assert proposal["confidence"] == "high"
    dates = [row["value"] for row in proposal["evidence"]
             if row["what"] == "effective date"]
    assert dates == ["2015-05-27"]


def test_a_restriction_with_no_state_date_says_so_and_is_less_confident():
    proposal = propose_restricted(("cdec", "CYC"))
    assert proposal["confidence"] == "medium"
    assert [row["value"] for row in proposal["evidence"]
            if row["what"] == "effective date"] == [None]


def test_an_unrestricted_station_proposes_nothing():
    assert propose_restricted(("cdec", "SHA")) is None


# --- the natural-lake flag -------------------------------------------------

LAKEPOND = {"ftype": 390, "gnis_name": "Bear Lake",
            "source_url": "https://example.invalid/nhd"}
FAR_DAM = {"name": "Sheep Creek", "distance_km": 19.0,
           "source_url": "https://example.invalid/nid"}
NEAR_DAM = {"name": "Utah Lake Outlet", "distance_km": 0.49,
            "source_url": "https://example.invalid/nid"}


def test_a_lake_with_no_dam_near_it_is_flagged_for_review():
    flag = natural_lake_flag(LAKEPOND, None, FAR_DAM)
    assert flag["flag"] == "review as natural lake"
    assert flag["axis"].startswith("water_type")


def test_the_ftype_alone_never_flags_a_water():
    """ADR-078's measurement, kept as a test: LakePond is what NHD calls
    twenty-five of twenty-six dammed impoundments."""
    assert natural_lake_flag(LAKEPOND, {"nid_id": "UT10117"}, FAR_DAM) is None
    assert natural_lake_flag(LAKEPOND, None, NEAR_DAM) is None


def test_a_water_named_reservoir_is_not_flagged_however_nhd_types_it():
    named = {**LAKEPOND, "gnis_name": "Courtright Reservoir"}
    assert natural_lake_flag(named, None, FAR_DAM) is None
    unnamed = {**LAKEPOND, "gnis_name": None}
    assert natural_lake_flag(unnamed, None, FAR_DAM) is None


def test_a_water_nhd_types_as_a_reservoir_is_not_flagged():
    assert natural_lake_flag({**LAKEPOND, "ftype": 436}, None, FAR_DAM) is None
    assert natural_lake_flag(None, None, FAR_DAM) is None


# --- precedence, and what a proposal may not read --------------------------

STEADY = {"pct_full_range": 2.0, "change_365d_pct": 0.5, "pct_full_max": 97.0}
SWINGING = {"pct_full_range": 60.0, "change_365d_pct": -30.0,
            "pct_full_max": 95.0}


def test_a_dam_safety_order_outranks_how_the_water_would_be_run():
    proposal = propose(("cdec", "ELC"), NAVIGATION_DAM, BIG_RIVER, 4.0, STEADY)
    assert proposal["operating_character"] == "restricted"


def test_a_navigation_pool_outranks_its_flood_purposes():
    both = {**NAVIGATION_DAM, "primary_purpose": "Flood Risk Reduction",
            "purposes": ["Flood Risk Reduction", "Navigation"],
            "normal_storage_af": None, "max_storage_af": 100.0,
            "federal_operator": "US Army Corps of Engineers",
            "federal_owner": None}
    assert propose(("cwms", "XXX"), both, BIG_RIVER, 4.0,
                   STEADY)["operating_character"] == "run_of_river"


def test_an_ordinary_reservoir_is_left_unlabelled():
    supply = {"purposes": ["Water Supply"], "primary_purpose": "Water Supply",
              "number_of_locks": 0, "normal_storage_af": 1000.0,
              "max_storage_af": 1100.0, "federal_operator": None,
              "federal_owner": None, "source_url": "https://example.invalid/nid"}
    proposal = propose(("cdec", "SHA"), supply, BIG_RIVER, 400.0, SWINGING)
    assert proposal["operating_character"] is None
    assert proposal["needs_review"] is True


def test_the_observed_series_cannot_change_a_proposal():
    """ADR-114's rule, as a property: the character is the same whichever way
    the water behaved. Only the agreement line moves."""
    steady = propose(("cwms", "MCN"), NAVIGATION_DAM, BIG_RIVER, 4.0, STEADY)
    swinging = propose(("cwms", "MCN"), NAVIGATION_DAM, BIG_RIVER, 4.0, SWINGING)
    assert steady["operating_character"] == swinging["operating_character"]
    assert steady["confidence"] == swinging["confidence"]
    assert steady["evidence"] == swinging["evidence"]
    assert steady["observed_agreement"] == "agrees"
    assert swinging["observed_agreement"] == "disagrees"


def test_every_proposal_asks_for_a_person():
    for key, nid in ((("cdec", "ELC"), None), (("cwms", "MCN"), NAVIGATION_DAM),
                     (("cdec", "SVO"), SEVEN_OAKS)):
        assert propose(key, nid, BIG_RIVER, 4.0, STEADY)["needs_review"] is True


# --- the corroboration line ------------------------------------------------

def test_the_signature_is_read_off_the_monthly_records():
    record = {"capacity_af": 1000.0, "change_365d_pct": -2.0,
              "monthly": [{"mean_af": 900.0}, {"mean_af": 950.0},
                          {"mean_af": 800.0}]}
    signature = observed_signature(record)
    assert signature["pct_full_min"] == 80.0
    assert signature["pct_full_max"] == 95.0
    assert signature["pct_full_range"] == 15.0
    assert signature["months"] == 3


def test_a_reservoir_with_no_denominator_has_no_signature():
    signature = observed_signature({"capacity_af": None, "monthly": []})
    assert signature["pct_full_min"] is None
    assert agreement("run_of_river", signature) == "not assessed"


def test_a_restriction_is_never_confirmed_or_denied_by_the_series():
    assert agreement("restricted", STEADY) == "not assessed"
    assert agreement(None, STEADY) == "not assessed"


def test_a_flood_space_proposal_agrees_when_the_water_never_fills():
    assert agreement("flood_space", {"pct_full_range": 4.0,
                                     "pct_full_max": 5.0}) == "agrees"
    assert agreement("flood_space", {"pct_full_range": 50.0,
                                     "pct_full_max": 90.0}) == "disagrees"


# --- what a reviewer is handed ---------------------------------------------

def test_the_review_links_point_at_this_reservoir():
    links = review_links({"lat": 45.9356, "lon": -119.2977}, "OR00616", "1529")
    assert "45.9356" in links["satellite_view"]
    assert "OR00616" in links["nid_dam_page"]
    assert "1529" in links["nhd_waterbody_record"]
    assert links["map_view"].startswith("https://")


def test_a_reservoir_with_no_inventory_record_still_gets_its_map_links():
    links = review_links({"lat": 42.1, "lon": -111.3}, None, None)
    assert "nid_dam_page" not in links
    assert "map_view" in links and "national_map_hydrography" in links


# --- which river the point is on -------------------------------------------

def test_the_minor_path_of_a_divergence_does_not_speak_for_the_river():
    """Little Goose: two flowlines claim the same 212,415 sq km, one carries
    57,640 cubic feet per second and the other carries 0.004."""
    from tools.audit_operating_character import choose_mainstem
    chosen = choose_mainstem([
        {"gnis_name": None, "totdasqkm": 212_415.4, "qama": 0.004393},
        {"gnis_name": "Snake River", "totdasqkm": 212_415.0, "qama": 57_639.7},
        {"gnis_name": None, "totdasqkm": 1.0, "qama": 0.014},
    ])
    assert chosen["gnis_name"] == "Snake River"


def test_a_smaller_river_never_wins_on_flow_alone():
    from tools.audit_operating_character import choose_mainstem
    chosen = choose_mainstem([
        {"gnis_name": "Columbia River", "totdasqkm": 500_000.0, "qama": 180_000.0},
        {"gnis_name": "Fifteenmile Creek", "totdasqkm": 945.0, "qama": 900_000.0},
    ])
    assert chosen["gnis_name"] == "Columbia River"
    assert choose_mainstem([{"gnis_name": "x", "totdasqkm": None}]) is None
    assert choose_mainstem([]) is None


def test_a_tributary_at_the_dam_fails_the_inventorys_drainage_area():
    """The Dalles drains 237,000 square miles; Fifteenmile Creek drains 945
    square kilometres, and the disagreement is what widens the search."""
    from tools.audit_operating_character import flowline_carries_the_dams_drainage
    dam = {"drainage_area_sq_mi": 237_000.0}
    assert flowline_carries_the_dams_drainage({"totdasqkm": 945.0}, dam) is False
    assert flowline_carries_the_dams_drainage({"totdasqkm": 613_000.0}, dam) is True
    assert flowline_carries_the_dams_drainage({"totdasqkm": 945.0}, None) is None
    assert flowline_carries_the_dams_drainage(
        {"totdasqkm": 945.0}, {"drainage_area_sq_mi": None}) is None


# --- which pool the point belongs to ---------------------------------------

def _feature(name, area, rings):
    return {"attributes": {"gnis_name": name, "areasqkm": area},
            "geometry": {"rings": rings}}


POOL_A = [[[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]]
POOL_B = [[[2.0, 0.0], [4.0, 0.0], [4.0, 2.0], [2.0, 2.0], [2.0, 0.0]]]


def test_the_polygon_holding_the_point_wins_over_a_bigger_neighbour():
    from tools.audit_operating_character import choose_waterbody
    chosen, how = choose_waterbody(
        [_feature("Lake Wallula", 106.6, POOL_A),
         _feature("Lake Umatilla", 202.5, POOL_B)], 0.5, 0.5, "Lake Wallula")
    assert chosen["attributes"]["gnis_name"] == "Lake Wallula"
    assert "holds the published point" in how


def test_a_dam_between_two_pools_is_given_the_pool_it_is_named_for():
    """McNary's point is inside neither Wallula nor Umatilla and beside both.
    Taking the larger hands Lake Wallula its neighbour's shape."""
    from tools.audit_operating_character import choose_waterbody
    chosen, how = choose_waterbody(
        [_feature("Lake Wallula", 106.6, POOL_A),
         _feature("Lake Umatilla", 202.5, POOL_B)], 1.5, 0.5, "Lake Wallula")
    assert chosen["attributes"]["gnis_name"] == "Lake Wallula"
    assert "its name is the reservoir's" in how


def test_position_decides_before_the_name_is_asked():
    """The name is the weak evidence `admission.py` treats it as: it is only
    asked between polygons the point is already beside."""
    from tools.audit_operating_character import choose_waterbody
    chosen, _ = choose_waterbody(
        [_feature("Lake Wallula", 1.0, POOL_A),
         _feature("Lake Wallula", 202.5, POOL_B)], 3.0, 1.0, "Lake Wallula")
    assert chosen["attributes"]["areasqkm"] == 202.5


def test_a_water_no_polygon_is_named_for_falls_back_to_the_largest():
    from tools.audit_operating_character import choose_waterbody
    chosen, how = choose_waterbody(
        [_feature("Some Other Water", 1.0, POOL_A),
         _feature(None, 202.5, POOL_B)], 1.5, 0.5, "Lake Wallula")
    assert chosen["attributes"]["areasqkm"] == 202.5
    assert "name is the reservoir's" not in how
