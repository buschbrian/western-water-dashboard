"""GAGES-II and NRCS parsing for the gauge review worksheet, without the network."""

import io
import struct
import sys
import zipfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import gauge_evidence as E  # noqa: E402


def dbf(rows, widths=(("STAID", 15), ("CLASS", 8), ("STANAME", 30))):
    record = 1 + sum(w for _, w in widths)
    header = bytearray(struct.pack("<BBBBIHH", 3, 11, 10, 27, len(rows), 33 + 32 * len(widths), record))
    header += bytes(20)
    for name, width in widths:
        header += name.encode().ljust(11, b"\0") + b"C" + bytes(4) + bytes([width]) + bytes(15)
    header += b"\r"
    body = b"".join(b" " + b"".join(str(row.get(n, "")).encode().ljust(w) for n, w in widths) for row in rows)
    return bytes(header) + body


def archive(rows, name="gages.dbf"):
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as bundle:
        bundle.writestr(name, dbf(rows))
    return out.getvalue()


def test_gages2_keeps_leading_zeroes_and_both_classes_and_drops_anything_else():
    classes = E.parse_gages2(archive([
        {"STAID": "09379500", "CLASS": "Ref"},
        {"STAID": "10163000", "CLASS": "Non-ref"},
        {"STAID": "10000000", "CLASS": "Unknown"}]))
    assert classes == {"09379500": "reference", "10163000": "non_reference"}


def test_a_gages2_archive_without_its_table_or_columns_is_refused():
    with pytest.raises(ValueError):
        E.parse_gages2(archive([], name="readme.txt"))
    with pytest.raises(ValueError, match="lacks columns"):
        E.dbf_records(dbf([{"STAID": "1"}], widths=(("STAID", 15),)), ["STAID", "CLASS"])


def station(site, network="USGS", state="UT"):
    return {"stationTriplet": f"{site}:{state}:{network}", "stationId": site,
            "networkCode": network}


def test_a_pair_needs_both_elements_and_the_gauges_own_number():
    pairs = E.pair_sites([station("1"), station("2"), station("3", "BOR")],
                         [station("1"), station("3", "BOR")])
    assert pairs == {"1": "1:UT:USGS"}


def monthly(code, values):
    return {"stationElement": {"elementCode": code}, "values": [
        {"year": 2000, "month": m + 1, "value": v} for m, v in enumerate(values)]}


def test_the_adjustment_is_adjusted_over_observed_across_shared_months():
    entry = {"data": [monthly("SRVO", [150, 150, None]), monthly("SRVOO", [100, 100, 9999])]}
    assert E.adjustment_pct(entry) == 50.0
    same = {"data": [monthly("SRVO", [5, 6]), monthly("SRVOO", [5, 6])]}
    assert E.adjustment_pct(same) == 0.0
    assert E.adjustment_pct({"data": [monthly("SRVO", [5])]}) is None
    assert E.adjustment_pct({"data": [monthly("SRVO", [5]), monthly("SRVOO", [0])]}) is None
    assert E.adjustment_pct({}) is None


def test_only_gauges_with_a_pair_are_asked_about_in_small_batches(monkeypatch):
    asked = []

    def answer(url, timeout=None, headers=None):
        asked.append(url)
        if "/stations?" in url:
            return [station(s) for s in ("1", "2", "3", "4", "5", "6", "7")]
        sites = url.split("stationTriplets=")[1].split("&")[0].replace("%3A", ":").split("%2C")
        return [{"stationTriplet": t, "data": [monthly("SRVO", [120]), monthly("SRVOO", [100])]}
                for t in sites]

    monkeypatch.setattr(E.upstream, "get_json", answer)
    result = E.fetch_nrcs_adjustments(["1", "2", "3", "4", "5", "6", "7", "88888888"], "2026-10-27")
    assert result == dict.fromkeys("1234567", 20.0)
    data_calls = [u for u in asked if "/data?" in u]
    assert len(data_calls) == 2 and "88888888" not in "".join(data_calls)
