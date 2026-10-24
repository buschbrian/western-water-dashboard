"""The names index behind the shared header's Find a place search."""

import gzip
import json

from tools import build_assistant_indexes as builder

SOURCES = {
    "reservoirs.json": {
        "generated_at": "2026-01-02T15:00:00+00:00",
        "reservoirs": [
            {"name": "Lost Creek", "state": "OR", "current_storage_af": 1},
            {"name": "Lost Creek", "state": "UT", "current_storage_af": 2},
            {"name": "Grant Lake", "state": None},
        ],
    },
    "snowpack.json": {
        "sites": [{"station": "1030:CO:SNTL", "name": "Arapaho Ridge",
                   "state": "CO", "series_values": [1.0]}],
    },
    "reference.json": {"geography": {"watersheds": {
        "drawn_scopes": {"6": "west-huc6", "2": "west-huc2"},
        "scopes": {
            "west-huc2": {"units": [{"huc2": "14", "name": "Upper Colorado Region",
                                     "states": "AZ,CO,NM,UT,WY", "bbox": [0, 0, 1, 1]}]},
            "west-huc6": {"units": [{"huc6": "140100", "name": "Colorado Headwaters",
                                     "states": "CO,UT"},
                                    {"huc6": "140200"}]},
        },
    }}},
}


def test_the_index_carries_names_and_no_measurement(monkeypatch):
    monkeypatch.setattr(builder, "read", lambda path: SOURCES[path])
    index = builder.places_index()
    assert index["topic"] == "places"
    assert index["as_of"] == "2026-01-02"
    assert index["reservoirs"] == [
        {"name": "Lost Creek", "state": "OR"},
        {"name": "Lost Creek", "state": "UT"},
        {"name": "Grant Lake", "state": None},
    ]
    # Ordered by level, and an unnamed area falls back to its code, as the
    # browser's own roster parser does.
    assert index["areas"] == [
        {"level": 2, "code": "14", "name": "Upper Colorado Region",
         "states": "AZ,CO,NM,UT,WY"},
        {"level": 6, "code": "140100", "name": "Colorado Headwaters", "states": "CO,UT"},
        {"level": 6, "code": "140200", "name": "140200", "states": ""},
    ]
    assert index["sites"] == [
        {"station": "1030:CO:SNTL", "name": "Arapaho Ridge", "state": "CO"}]


def test_the_committed_sources_build_a_small_complete_index():
    """Against today's rosters: every name is there, and the file a reader
    fetches on first focus stays small. Counts come from the sources, never
    from a literal, so a roster change cannot turn this red."""
    index = builder.places_index()
    reservoirs = builder.read("reservoirs.json")["reservoirs"]
    sites = builder.read("snowpack.json")["sites"]
    watersheds = builder.read("reference.json")["geography"]["watersheds"]
    assert len(index["reservoirs"]) == len(reservoirs)
    assert {site["station"] for site in index["sites"]} == {s["station"] for s in sites}
    for level, scope in watersheds["drawn_scopes"].items():
        codes = [area["code"] for area in index["areas"] if area["level"] == int(level)]
        assert len(codes) == len(watersheds["scopes"][scope]["units"])
        assert all(len(code) == int(level) for code in codes)
    assert len(gzip.compress(builder.encoded(index))) < 30_000


def test_main_writes_the_places_index_beside_the_others(monkeypatch, tmp_path):
    drought = {"map_date": "2026-01-01", "release_date": "2026-01-02", "units": []}
    history = {"weeks": [drought]}
    sources = dict(SOURCES)
    sources["upstream_index.json"] = {"traces": {}}
    sources["snowpack.json"] = {**SOURCES["snowpack.json"], "as_of": "2026-01-02",
                                "generated_at": "x", "rollups": [], "source": "s",
                                "normal_period": {}}
    for level in (2, 4, 6, 8):
        sources[f"data/drought/usdm-huc{level}.json"] = drought
        sources[f"data/drought/usdm-huc{level}-history.json"] = history
    sources["reservoirs.json"] = {**SOURCES["reservoirs.json"], "reservoirs": [
        {**item, "as_of": "2026-01-02"} for item in SOURCES["reservoirs.json"]["reservoirs"]]}
    monkeypatch.setattr(builder, "read", lambda path: sources[path])
    monkeypatch.setattr(builder, "ROOT", tmp_path)
    monkeypatch.setattr(builder, "OUTPUT_DIR", tmp_path / "data" / "assistant")
    assert builder.main() == 0
    written = json.loads((tmp_path / "data" / "assistant" / "places.json").read_text())
    assert [item["name"] for item in written["reservoirs"]] == [
        "Lost Creek", "Lost Creek", "Grant Lake"]
