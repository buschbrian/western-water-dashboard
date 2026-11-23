"""On-demand tools stop at a bound instead of waiting on a service forever."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

import audit_candidate_capacity as candidates  # noqa: E402
import audit_cwms_stations as cwms  # noqa: E402
import audit_new_mexico_reservoirs as nm  # noqa: E402
import build_capacity_table as capacity  # noqa: E402
import build_operating_character_census as census  # noqa: E402
import build_river_normals as river_normals  # noqa: E402
import export_review_lists as export  # noqa: E402
import probe_nwis_storage as nwis  # noqa: E402
from pipeline import providers  # noqa: E402


def full_page(count: int) -> dict:
    return {"features": [{"attributes": {"n": i}, "geometry": {"x": 1.0, "y": 2.0}}
                         for i in range(count)],
            "exceededTransferLimit": True}


def test_the_utah_dam_query_raises_when_the_service_never_ends():
    calls = []

    def never_ends(*_args, **_kwargs):
        calls.append(1)
        return full_page(1000)

    capacity.get, original = never_ends, capacity.get
    try:
        with pytest.raises(RuntimeError, match="pagination exceeded"):
            capacity.fetch_utah_dams("https://example.invalid/layer", "1=1")
    finally:
        capacity.get = original
    assert len(calls) == providers.MAX_PAGES


def test_the_candidate_dam_query_raises_when_the_service_never_ends(monkeypatch):
    calls = []
    monkeypatch.setattr(candidates, "get_json",
                        lambda *_a, **_k: calls.append(1) or full_page(1000))
    fields = {"name": "n", "state": "n"}
    with pytest.raises(RuntimeError, match="pagination exceeded"):
        candidates.fetch_dams("https://example.invalid/layer", fields, "1=1")
    assert len(calls) == providers.MAX_PAGES


def test_the_census_inventory_raises_when_the_service_never_ends(monkeypatch, tmp_path):
    monkeypatch.setattr(census, "fetch_json",
                        lambda *_a, **_k: full_page(census.NID_PAGE_SIZE))
    service = census.Service("nid", "https://example.invalid", "dams")
    with pytest.raises(RuntimeError, match="pagination exceeded"):
        census.fetch_nid_rows("https://example.invalid/layer", ["UT"], tmp_path,
                              service, False)
    assert service.asked == providers.MAX_PAGES


def never_ending_catalog(*_args, **_kwargs):
    return {"entries": [], "next-page": "more"}


def test_the_cwms_catalog_raises_when_the_service_never_ends(monkeypatch):
    monkeypatch.setattr(cwms, "_get_cwms_json", never_ending_catalog)
    with pytest.raises(RuntimeError, match="pagination exceeded"):
        cwms.catalog("SPA")


def test_the_new_mexico_cwms_catalog_raises_when_the_service_never_ends(monkeypatch):
    monkeypatch.setattr(providers, "_get_cwms_json", never_ending_catalog)
    with pytest.raises(RuntimeError, match="pagination exceeded"):
        nm.cwms_candidates(__import__("datetime").date(2026, 1, 1))


def test_the_nwis_probe_raises_when_next_links_never_end(monkeypatch):
    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_exc):
            return False

        def read(self):
            return b'{"features": [], "links": [{"rel": "next", "href": "https://example.invalid/n"}]}'

    calls = []
    monkeypatch.setattr(nwis.urllib.request, "urlopen",
                        lambda *_a, **_k: calls.append(1) or Response())
    monkeypatch.setattr(nwis.time, "sleep", lambda _s: None)
    with pytest.raises(RuntimeError, match="pagination exceeded"):
        nwis._get_features("https://example.invalid/items", None)
    assert len(calls) == nwis.MAX_PAGES


def test_a_probe_that_outlives_its_deadline_is_a_failure(monkeypatch, tmp_path):
    seen = {}

    def run(*_args, **kwargs):
        seen.update(kwargs)
        raise subprocess.TimeoutExpired("probe", kwargs["timeout"])

    monkeypatch.setattr(export.subprocess, "run", run)
    with pytest.raises(RuntimeError, match="ran past"):
        export.load_nhd_report(tmp_path / "absent.txt")
    assert seen["timeout"] == export.NHD_PROBE_TIMEOUT_SECONDS


def test_the_river_normals_description_names_the_retrieval_date():
    text = river_normals.describe("2027-11-02")
    assert "daily record on 2027-11-02)" in text
    assert "2026-10-31" not in text
