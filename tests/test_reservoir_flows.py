import copy
import json

import pandas as pd
import pytest

from pipeline import daily_history, reservoir_flows as F


def test_roster_refuses_forecasts_unregulated_units_and_missing_definitions(tmp_path):
    roster = json.loads(F.ROSTER.read_text())
    assert F.load_roster()["6124"]["inflow"] is None
    for key, value in [("modeled", True), ("parameter", "Lake/Reservoir Inflow - Unregulated"),
                       ("unit", "af"), ("definition", ""), ("definition_url", "")]:
        invalid = copy.deepcopy(roster)
        invalid["reservoirs"]["509"]["inflow"][key] = value
        path = tmp_path / "roster.json"
        path.write_text(json.dumps(invalid))
        with pytest.raises(ValueError):
            F.load_roster(path)


def test_daily_merge_corrections_and_failed_fetch_keeps_own_date(tmp_path):
    records = [dict(name="Powell", source_station_id="509")]
    today = pd.Timestamp("2026-11-10")
    path = tmp_path / "flow.json"

    def fetch(entry, start, end):
        return pd.DataFrame({"date": pd.to_datetime(["2026-11-08", "2026-11-10", "2026-11-11"]),
                             "cfs": [1., 2., 999.]})

    first = F.refresh(records, {}, today, path, fetch)
    daily_history.write_compact(path, first)
    assert records[0]["water_flow"]["inflow"]["as_of"] == "2026-11-10"
    assert first["reservoirs"][0]["inflow"]["values"] == [1, None, 2]

    def failed(*args):
        raise ValueError("Provider down")

    previous = {"509": copy.deepcopy(records[0])}
    second = F.refresh(records, previous, today + pd.Timedelta(days=1), path, failed)
    assert second["reservoirs"] == first["reservoirs"]
    assert records[0]["water_flow"] == previous["509"]["water_flow"]
    F.refresh(records, previous, today + pd.Timedelta(days=61), path, failed)
    assert records[0]["water_flow"]["inflow"] is None
    assert records[0]["water_flow"]["release"] is None


def test_live_catalog_must_match_reviewed_identity(monkeypatch):
    class Response:
        def raise_for_status(self):
            pass

        def json(self):
            return {"data": {"attributes": {"isModeled": True},
                             "relationships": {"catalogRecord": {"data": {"id": "/rise/api/catalog-record/2362"}}}}}

    monkeypatch.setattr(F.P.SESSION, "get", lambda *a, **kw: Response())
    with pytest.raises(ValueError, match="identity"):
        F.fetch(F.load_roster()["509"]["inflow"], "20261001", "20261101")


def test_no_mead_inflow_is_computed_from_release_or_other_records(tmp_path):
    records = [dict(name="Mead", source_station_id="6124")]
    def fetch(*args):
        return pd.DataFrame({"date": pd.to_datetime(["2026-11-10"]), "cfs": [100.]})
    history = F.refresh(records, {}, pd.Timestamp("2026-11-10"), tmp_path / "history.json", fetch)
    assert records[0]["water_flow"]["inflow"] is None
    assert "inflow" not in history["reservoirs"][0]
