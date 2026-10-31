"""A published reservoir name is the water's name, not the provider's text.

ADR-079 renamed twenty-six roster names that carried provider debris; this
holds the whole roster to the same standard so the debris cannot return.
Network-free: it reads the reviewed rosters and the built-in Utah rosters,
never the daily payload.

A name that looks odd but is real goes in `REAL_NAMES` with the reason. A name
that is probably wrong but has no documented replacement yet goes in
`HELD_FOR_REVIEW`; those are listed for the reviewer, and a held name that no
longer exists in a roster fails the test so the list cannot go stale.
"""

import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from pipeline import constants  # noqa: E402

ROSTERS = {
    "admitted_reservoirs.json": "reservoirs",
    "admitted_rise_reservoirs.json": "reservoirs",
    "admitted_cdec_reservoirs.json": "reservoirs",
    "admitted_cdss_reservoirs.json": "reservoirs",
    "admitted_usgs_reservoirs.json": "reservoirs",
    "admitted_srp_reservoirs.json": "reservoirs",
    "admitted_dnrc_reservoirs.json": "reservoirs",
    "admitted_cwms_reservoirs.json": "reservoirs",
    "admitted_cap_reservoirs.json": "reservoirs",
    "admitted_reservoir_elevations.json": "reservoirs",
    "admitted_terminal_lakes.json": "lakes",
}

#: Real names the rules below would flag.
REAL_NAMES = {
    "Harry L. Englebright Lake": "a person's initial, with its period",
    "Franklin D. Roosevelt Lake": "a person's initial, with its period",
    "Lake Herbert G. West": "a person's initial, with its period",
    "Howard A. Hanson": "a person's initial, with its period",
    "C.C. Cragin Reservoir": "initials, with their periods, as the National Hydrography Dataset spells it",
    "D M A D Reservoir": "single capitals spaced as the National Hydrography Dataset spells it",
}

#: Names that carry a dam word, or are otherwise probably not the water's own
#: name, where no source cited in the roster names the water. Not changed; see
#: the review list. Each is removed from here when it is renamed.
HELD_FOR_REVIEW = {
    "Seven Oaks Dam",
}

PROVIDER_WORDS = {
    "re", "res", "resv", "rsvr", "rsv", "nr", "near", "abv", "blw", "bl",
    "lk", "cr", "crk", "ck", "riv", "rv", "co", "wd", "dist", "sta", "storage",
}
SPANISH_ARTICLES = {"de", "la", "del", "los", "las"}


def _roster_names() -> list[tuple[str, str]]:
    found = []
    for filename, key in ROSTERS.items():
        entries = json.loads((ROOT / filename).read_text())[key]
        found += [(f"{filename}:{k}", v["name"]) for k, v in entries.items()]
    for table in ("BASE_RISE_RESERVOIRS", "BASE_AWDB_RESERVOIRS"):
        found += [(f"pipeline/constants.py:{table}:{k}", v[0])
                  for k, v in getattr(constants, table).items()]
    return found


def debris(name: str) -> list[str]:
    """What is wrong with a name, as short phrases; empty when nothing is."""
    problems = []
    if name != name.strip() or "  " in name:
        problems.append("stray whitespace")
    if re.search(r"[(),;/]", name):
        problems.append("punctuation a provider adds")
    words = re.findall(r"[A-Za-z&']+\.?", name)
    for word in words:
        bare = word.rstrip(".").lower()
        if bare in PROVIDER_WORDS:
            problems.append(f"provider word '{word}'")
        if len(bare) > 1 and word.rstrip(".").isupper():
            problems.append(f"all capitals '{word}'")
        if re.fullmatch(r"M[ac][a-z]+", word) and word.startswith("Mc"):
            problems.append(f"'{word}' should be Mc plus a capital")
        if "&" in word:
            problems.append("operator initials")
    if re.search(r"\bMc [A-Za-z]", name):
        problems.append("space inside a Mc name")
    if re.search(r"\bDam\b", name):
        problems.append("dam word in the water's name")
    if re.search(r"\bL\.", name) and name not in REAL_NAMES:
        problems.append("abbreviated Lake")
    if name[:1].islower():
        problems.append("starts in lower case")
    for index, word in enumerate(words):
        if index and word.lower() in SPANISH_ARTICLES and word != word.lower():
            problems.append(f"'{word}' should be lower case inside a name")
    return problems


def test_roster_is_read():
    assert len(_roster_names()) > 300


@pytest.mark.parametrize("where,name", _roster_names())
def test_published_name_is_the_waters_name(where, name):
    if name in REAL_NAMES or name in HELD_FOR_REVIEW:
        pytest.skip("allowed or held for review")
    assert not debris(name), f"{where}: {name!r}: {'; '.join(debris(name))}"


def test_allow_lists_name_something_that_exists():
    present = {name for _, name in _roster_names()}
    for listed in (REAL_NAMES, HELD_FOR_REVIEW):
        stale = sorted(set(listed) - present)
        assert not stale, f"no longer in any roster, remove: {stale}"


@pytest.mark.parametrize("sample", [
    "Rye Patch Re nr Rye Patch, NV", "Stagecoach Reservoir nr Oak Creek",
    "Mcphee Reservoir", "Lake Mc Swain", "Courtright (Pg&E)",
    "Marlette Lk nr Carson City", "Bucks Lake Storage", "TOPAZ LAKE",
    "Lake San Antonio, Monterey Co", "Oroville Dam", " Gem  Lake",
    "Cache La Poudre Reservoir",
])
def test_the_rules_catch_known_debris(sample):
    assert debris(sample), sample


@pytest.mark.parametrize("sample", [
    "Lake McClure", "McPhee Reservoir", "Mackay Reservoir",
    "Harry L. Englebright Lake", "Ken's Lake", "Del Valle", "Los Vaqueros Reservoir",
    "Cache la Poudre Reservoir",
])
def test_the_rules_pass_real_names(sample):
    problems = [p for p in debris(sample) if sample not in REAL_NAMES]
    assert not problems, (sample, problems)


def _former_names() -> dict[str, str]:
    source = (ROOT / "src/data/former-names.ts").read_text()
    return dict(re.findall(r'^\s+"([^"]+)":\s*"([^"]+)"', source, re.M))


def _stations() -> dict[str, str]:
    stations = {}
    for filename, key in ROSTERS.items():
        entries = json.loads((ROOT / filename).read_text())[key]
        stations.update({k: v["name"] for k, v in entries.items()})
    for table in ("BASE_RISE_RESERVOIRS", "BASE_AWDB_RESERVOIRS"):
        stations.update({k: v[0] for k, v in getattr(constants, table).items()})
    return stations


def test_every_former_name_leads_to_a_published_station():
    stations = _stations()
    former = _former_names()
    assert len(former) > 40
    missing = {k: v for k, v in former.items() if v not in stations}
    assert not missing, f"former names pointing at no roster station: {missing}"


def test_a_former_name_is_not_a_current_name():
    current = {name.lower() for name in _stations().values()}
    clash = sorted(set(_former_names()) & current)
    assert not clash, f"former name equals a live name, remove it: {clash}"
