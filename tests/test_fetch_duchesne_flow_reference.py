"""The one-time Duchesne reference writer's arithmetic, without the network."""

import datetime as dt
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from tools import fetch_duchesne_flow_reference as F  # noqa: E402


def test_legacy_daily_values_drop_the_sentinel_and_keep_the_approval_code():
    payload = {"value": {"timeSeries": [
        {"name": "USGS:09302000:00060:00003", "values": [{"value": [
            {"dateTime": "1991-10-01T00:00:00.000", "value": "312", "qualifiers": ["A"]},
            {"dateTime": "1991-10-02T00:00:00.000", "value": "-999999", "qualifiers": ["A"]},
            {"dateTime": "1991-10-03T00:00:00.000", "value": "5", "qualifiers": ["P"]}]}]},
        {"name": "USGS:09302000:00010:00003", "values": [{"value": [
            {"dateTime": "1991-10-01T00:00:00.000", "value": "9.5"}]}]}]}}
    days, approval = F.parse_legacy_daily(payload)
    assert days == {dt.date(1991, 10, 1): 312.0, dt.date(1991, 10, 3): 5.0}
    assert approval == {dt.date(1991, 10, 1): "A", dt.date(1991, 10, 3): "P"}


def test_reference_keeps_whole_water_years_with_their_approval_counts():
    start = dt.date(1990, 10, 1)
    days = {start + dt.timedelta(n): 10.0 for n in range(365)}
    days[dt.date(1991, 10, 1)] = 99.0
    approval = {day: "A" for day in days}
    approval[dt.date(1991, 9, 30)] = "P"
    reference = F.build_reference(days, approval, "2026-10-31T00:00:00Z", "https://x")
    assert list(reference["water_years"]) == ["1991"]
    assert reference["water_years"]["1991"] == {
        "mean_cfs": 10.0, "days": 365, "approved_days": 364, "provisional_days": 1}
