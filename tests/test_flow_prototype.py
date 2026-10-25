"""Local flow preview: exact daily identity/quality and complete replacement."""

import datetime as dt
import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from tools import build_flow_prototype as F  # noqa: E402

START = dt.date(2026, 9, 24)
END = dt.date(2026, 10, 23)


def metadata(site=F.SITES[0], series_id="primary-1", **changes):
    return {"id": series_id, "properties": {
        "monitoring_location_id": f"USGS-{site}", "parameter_code": "00060",
        "statistic_id": "00003", "unit_of_measure": F.UNIT, "primary": "Primary", **changes}}


def feature(**changes):
    return {"properties": {"monitoring_location_id": f"USGS-{F.SITES[0]}",
        "time_series_id": "primary-1", "parameter_code": "00060", "statistic_id": "00003",
        "unit_of_measure": F.UNIT, "time": START.isoformat(), "value": "0",
        "approval_status": "Provisional", "qualifier": ["ESTIMATED"], **changes}}


def bundle(tmp_path):
    root = tmp_path / "review"
    (root / "maps").mkdir(parents=True)
    gauges = []
    for site in F.SITES:
        gauges.append({"site": site, "name": f"Synthetic gauge {site}", "lat": 40.5, "lon": -111.5,
            "area": 100, "traced": 102, "reservoirs": ["Synthetic reservoir"],
            "page": f"https://waterdata.usgs.gov/monitoring-location/USGS-{site}/",
            "shape": [], "map": {"width": 960, "height": 600, "xmin": -12500000,
                "xmax": -12000000, "ymin": 4500000, "ymax": 5000000}})
        (root / "maps" / f"{site}.jpg").write_bytes(b"test map")
    (root / "gauges.json").write_text(json.dumps({"screened": "2026-10-23", "gauges": gauges}))
    return root


def test_primary_series_is_pinned_and_ambiguity_refused():
    primary = metadata()
    assert F.primary_series([metadata(primary="Secondary"), primary], F.SITES[0]) == primary
    for features in ([], [metadata(unit_of_measure="m3/s")], [primary, metadata(series_id="other")]):
        with pytest.raises(ValueError, match="one primary"):
            F.primary_series(features, F.SITES[0])


def test_zero_null_absence_and_quality_are_distinct():
    rows = F.observations([feature(), feature(time=(START + dt.timedelta(days=1)).isoformat(), value=None)],
                          F.SITES[0], "primary-1", START, END)
    assert len(rows) == 30
    assert rows[0]["value"] == 0 and rows[0]["qualifier"] == ["ESTIMATED"]
    assert rows[0]["approval_status"] == "Provisional"
    assert rows[1]["reported"] and rows[1]["value"] is None
    assert not rows[2]["reported"] and rows[2]["value"] is None
    assert rows[-1]["date"] == END.isoformat()


@pytest.mark.parametrize("change", [
    {"monitoring_location_id": "USGS-99999999"}, {"time_series_id": "other"},
    {"parameter_code": "00054"}, {"statistic_id": "00001"}, {"unit_of_measure": "m3/s"},
    {"time": "2026-09-23"}, {"time": "2026-10-24"}, {"time": "2026-10-01T00:00:00Z"},
    {"value": "NaN"}, {"value": "Infinity"}, {"value": True}, {"value": "bad"},
    {"approval_status": 1}, {"qualifier": [5]},
])
def test_wrong_identity_dates_or_types_refuse_snapshot(change):
    with pytest.raises((ValueError, TypeError)):
        F.observations([feature(**change)], F.SITES[0], "primary-1", START, END)


def test_conflicting_days_refused_identical_paging_duplicates_deduplicated():
    with pytest.raises(ValueError, match="conflicting"):
        F.observations([feature(), feature(value=10)], F.SITES[0], "primary-1", START, END)
    rows = F.observations([feature(), feature()], F.SITES[0], "primary-1", START, END)
    assert sum(row["reported"] for row in rows) == 1


def test_complete_refetch_replaces_revisions_and_preserves_flags(tmp_path):
    source = bundle(tmp_path)
    value = 10
    calls = []

    def fetch(url):
        calls.append(url)
        site = next((site for site in F.SITES if site in url), None)
        if '/time-series-metadata/' in url:
            return [metadata(site, f"primary-{site}")]
        site = next(site for site in F.SITES if site in url)
        return [feature(monitoring_location_id=f"USGS-{site}", time_series_id=f"primary-{site}", value=value)]

    first = F.build(source, END, fetch=fetch)
    value = 12
    revised = F.build(source, END, fetch=fetch)
    assert len(calls) == 12
    assert all('2026-09-24%2F2026-10-23' in url for url in calls if '/daily/' in url)
    assert first["gauges"][0]["observations"][0]["value"] == 10
    assert revised["gauges"][0]["observations"][0]["value"] == 12
    assert len(revised["gauges"][0]["observations"]) == 30
    assert revised["gauges"][0]["observations"][0]["qualifier"] == ["ESTIMATED"]


def test_provider_failure_never_replaces_previous_snapshot(tmp_path, monkeypatch):
    source = bundle(tmp_path)
    output = tmp_path / "preview"
    F.publish_local(F.build(source, END, demo=True), source, output)
    original = (output / "snapshot.json").read_bytes()

    def fail(url):
        raise RuntimeError("synthetic provider outage")

    with pytest.raises(RuntimeError, match="outage"):
        snapshot = F.build(source, END, fetch=fail)
        F.publish_local(snapshot, source, output)
    assert (output / "snapshot.json").read_bytes() == original
    assert json.loads(original)["data_kind"] == "synthetic"


def test_demo_never_contacts_the_agency_and_budget_is_enforced(tmp_path, monkeypatch):
    source = bundle(tmp_path)
    def fail(url):
        pytest.fail("demo contacted the agency")
    snapshot = F.build(source, END, demo=True, fetch=fail)
    assert snapshot["data_kind"] == "synthetic"
    assert len(snapshot["gauges"]) == 3
    monkeypatch.setattr(F, "MAX_GZIP_BYTES", 1)
    with pytest.raises(ValueError, match="budget"):
        F.build(source, END, demo=True, fetch=fail)
