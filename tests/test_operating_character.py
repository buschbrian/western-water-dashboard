"""A reviewed operating character on the roster (ADR-114, ADR-156).

Network-free. The characters here are fixtures written into temporary roster
files: no real reservoir carries one until a region is ruled, and nothing
below writes one into a committed roster.
"""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from admission import Decision, NEVER_FILLED_SHARE, discrepancies  # noqa: E402
from pipeline import roster  # noqa: E402

SOURCE = "https://geospatial.sec.usace.army.mil/dls/rest/services/NID/National_Inventory_of_Dams_Public_Service/FeatureServer/0"


def character(value="flood_space", **overrides) -> dict:
    found = {
        "character": value,
        "reviewed": "2026-11-12",
        "source_url": "https://www.spl.usace.army.mil/Missions/Civil-Works/",
        "evidence": [{"what": "primary purpose", "value": "Flood Risk Reduction",
                      "source": SOURCE}],
    }
    if value == "restricted":
        found.update(authority="California Division of Safety of Dams",
                     effective_from="2015-05-27")
    found.update(overrides)
    return found


@pytest.mark.parametrize("value", roster.OPERATING_CHARACTERS)
def test_each_character_with_its_evidence_is_accepted(value):
    roster.validate_operating_character("Fixture", character(value))


def test_an_ordinary_reservoir_carries_nothing_and_passes():
    roster.validate_operating_character("Fixture", None)


@pytest.mark.parametrize("broken", [
    "flood_space",
    character("target_filled"),
    character(evidence=[]),
    character(evidence=None),
    character(evidence=[{"what": "primary purpose", "value": "Flood Risk Reduction"}]),
    character(evidence=[{"what": "", "value": "x", "source": SOURCE}]),
    character(evidence=[{"what": "x", "value": "y", "source": "http://example.org"}]),
    character(source_url="http://www.example.org/"),
    character(reviewed="2026-11"),
    {key: value for key, value in character().items() if key != "evidence"},
    {key: value for key, value in character().items() if key != "reviewed"},
])
def test_a_character_without_its_evidence_is_refused(broken):
    with pytest.raises(ValueError):
        roster.validate_operating_character("Fixture", broken)


def test_a_restricted_character_names_its_authority_and_start_date():
    for field in roster.RESTRICTED_CHARACTER_FIELDS:
        broken = character("restricted")
        del broken[field]
        with pytest.raises(ValueError):
            roster.validate_operating_character("Fixture", broken)
    with pytest.raises(ValueError):
        roster.validate_operating_character(
            "Fixture", character("restricted", effective_from="May 27, 2015"))


def test_only_a_restricted_character_carries_a_start_date():
    with pytest.raises(ValueError):
        roster.validate_operating_character(
            "Fixture", character("run_of_river", effective_from="2015-05-27"))


def roster_with(tmp_path: Path, source: Path, value) -> Path:
    document = json.loads(source.read_text(encoding="utf-8"))
    station = next(iter(document["reservoirs"]))
    document["reservoirs"] = {station: {**document["reservoirs"][station],
                                        "operating_character": value}}
    path = tmp_path / source.name
    path.write_text(json.dumps(document), encoding="utf-8")
    return path


@pytest.mark.parametrize("loader, source", [
    (roster.load_admitted_cdec_reservoirs, roster.ADMITTED_CDEC_RESERVOIRS_PATH),
    (roster.load_admitted_reservoirs, roster.ADMITTED_RESERVOIRS_PATH),
    (roster.load_admitted_rise_reservoirs, roster.ADMITTED_RISE_RESERVOIRS_PATH),
    (roster.load_admitted_cwms_reservoirs, roster.ADMITTED_CWMS_RESERVOIRS_PATH),
])
def test_every_roster_loader_reads_and_checks_the_character(tmp_path, loader, source):
    loaded = loader(roster_with(tmp_path, source, character()))
    assert next(iter(loaded.values()))["operating_character"]["character"] == "flood_space"
    with pytest.raises(ValueError, match="evidence"):
        loader(roster_with(tmp_path, source, character(evidence=[])))


def test_a_record_carries_only_what_a_reader_needs():
    assert roster.published_operating_character(character()) == {
        "character": "flood_space",
        "source_url": character()["source_url"]}
    restricted = roster.published_operating_character(character("restricted"))
    assert restricted["authority"] == "California Division of Safety of Dams"
    assert restricted["effective_from"] == "2015-05-27"


def test_a_character_reaches_its_own_record_and_leaves_with_the_roster():
    characters = roster.reviewed_operating_characters({
        "cwms": {"MDM": {"operating_character": character()}},
        "cdec": {"PRA": {"operating_character": None}},
    })
    records = [
        {"source_key": "cwms", "source_station_id": "MDM"},
        # The same station id from another provider is another reservoir.
        {"source_key": "cdec", "source_station_id": "MDM"},
        # A carried-forward record whose character the roster withdrew.
        {"source_key": "cdec", "source_station_id": "PRA",
         "operating_character": {"character": "flood_space"}},
    ]
    assert roster.attach_operating_characters(records, characters) == 1
    assert records[0]["operating_character"]["character"] == "flood_space"
    assert "operating_character" not in records[1]
    assert "operating_character" not in records[2]


def test_the_published_records_carry_exactly_the_reviewed_characters():
    """The payload and the rosters agree, whatever the rosters hold."""
    payload = json.loads((ROOT / "reservoirs.json").read_text(encoding="utf-8"))
    published = {
        (str(record["source_key"]), str(record["source_station_id"])):
            record["operating_character"]
        for record in payload["reservoirs"] if "operating_character" in record}
    assert published == roster.reviewed_operating_characters()


class TestNeverFilledFollowsTheLabel:
    """ADR-156: a reviewed `flood_space` water is no longer referred."""

    def held(self, **kwargs):
        decision = Decision("Martis Creek", True, "confirmed by name and position",
                            None, 20400.0, "normal_storage")
        low = 20400.0 * NEVER_FILLED_SHARE / 3
        return dict(discrepancies(decision, highest_readings=[low, low * 0.9, low * 0.8],
                                  **kwargs))

    def test_an_unlabelled_water_is_still_referred(self):
        assert "never seen a third full" in self.held()

    @pytest.mark.parametrize("value", ["run_of_river", "restricted"])
    def test_another_character_is_still_referred(self, value):
        assert "never seen a third full" in self.held(operating_character=value)

    def test_a_reviewed_flood_space_water_is_not_referred(self):
        assert "never seen a third full" not in self.held(operating_character="flood_space")

    def test_the_other_screens_still_run_for_it(self):
        decision = Decision("Somewhere", False, "no dam within reach")
        found = dict(discrepancies(decision, highest_readings=[9000, 1000, 900],
                                   operating_character="flood_space"))
        assert "no confirmed dam" in found
        assert "unstable maximum" in found
