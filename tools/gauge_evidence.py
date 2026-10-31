"""Keyless evidence about a gauge from two federal reference sources (ADR-138).

* GAGES-II (U.S. Geological Survey, ScienceBase, 2011): a point file of 9,322
  gauges, each classed `Ref` (least disturbed) or `Non-ref`. A static
  release; a gauge that did not exist in 2011 is not listed. The 0.7 MB zip is
  fetched at build time and nothing is committed. The disturbance index sits
  in a 55 MB archive that cannot be fetched in part, so it is not read.
* NRCS AWDB: the stations that carry both `SRVO` (stream volume adjusted for
  upstream projects) and `SRVOO` (observed). An NRCS station for a
  U.S. Geological Survey gauge has that gauge's number as its station id, and
  only that match counts: a station a kilometre away can measure other water.
  Most pairs are identical month for month, so the pair is not the evidence;
  the evidence is how far the adjusted volume sits from the observed one.

Pure parsing is separate from the fetches so the tests need no network.
"""

from __future__ import annotations

import io
import struct
import urllib.parse
import urllib.request
import zipfile
from typing import Iterable

import build_upstream_index as upstream

GAGES2_URL = ("https://www.sciencebase.gov/catalog/file/get/631405bbd34e36012efa304a"
              "?f=__disk__53%2Fba%2F17%2F53ba17cfb64d2d50d3876864edf519eb7295945a")
GAGES2_CHECKED = "2026-10-27"
GAGES2_TIMEOUT = 180
GAGES2_CLASSES = {"Ref": "reference", "Non-ref": "non_reference"}

AWDB_BASE = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1"
AWDB_TIMEOUT = 120
AWDB_BATCH = 5
#: The start of the 1991-2020 climate period the pilot compares against.
AWDB_BEGIN = "1991-10-01"
#: Adjusted and observed volumes this far apart (percent of observed, summed
#: over the months both exist) count as an adjustment. Pairs that differ by
#: under a percent are rounding.
NRCS_MATERIAL_PCT = 5.0


def dbf_records(data: bytes, fields: list[str]) -> list[dict[str, str]]:
    """The named columns of every record in a dBASE III table."""
    count, header_length, record_length = struct.unpack("<IHH", data[4:12])
    columns: dict[str, tuple[int, int]] = {}
    offset, position = 32, 1
    while data[offset] != 0x0D:
        name = data[offset:offset + 11].split(b"\0")[0].decode("ascii")
        length = data[offset + 16]
        columns[name] = (position, length)
        position += length
        offset += 32
    wanted = [name for name in fields if name in columns]
    if len(wanted) != len(fields):
        raise ValueError(f"the table lacks columns: {sorted(set(fields) - set(columns))}")
    records = []
    for index in range(count):
        record = data[header_length + index * record_length:
                      header_length + (index + 1) * record_length]
        records.append({name: record[columns[name][0]:columns[name][0] + columns[name][1]]
                        .decode("latin-1").strip() for name in wanted})
    return records


def parse_gages2(archive: bytes) -> dict[str, str]:
    """Site number to `reference` or `non_reference` from the point-file zip."""
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        names = [n for n in bundle.namelist() if n.lower().endswith(".dbf")]
        if len(names) != 1:
            raise ValueError("the GAGES-II archive should hold one table")
        table = bundle.read(names[0])
    classes = {}
    for record in dbf_records(table, ["STAID", "CLASS"]):
        if record["CLASS"] in GAGES2_CLASSES:
            classes[record["STAID"]] = GAGES2_CLASSES[record["CLASS"]]
    return classes


def fetch_gages2() -> dict[str, str]:
    request = urllib.request.Request(GAGES2_URL, headers={"User-Agent": upstream.USER_AGENT})
    with urllib.request.urlopen(request, timeout=GAGES2_TIMEOUT) as response:
        return parse_gages2(response.read())


def pair_sites(srvo: list[dict], srvoo: list[dict]) -> dict[str, str]:
    """Site number to station triplet for stations that carry both elements.

    Only a station whose id is the gauge's number is taken.
    """
    observed = {s["stationTriplet"] for s in srvoo}
    return {s["stationId"]: s["stationTriplet"] for s in srvo
            if s["stationTriplet"] in observed and s.get("networkCode") == "USGS"}


def adjustment_pct(station: dict) -> float | None:
    """Adjusted volume over observed, minus one, in percent, over the months
    both exist; None when they share no month or observed sums to zero."""
    series: dict[str, dict[tuple[int, int], float]] = {}
    for element in station.get("data") or []:
        code = (element.get("stationElement") or {}).get("elementCode")
        series[code] = {(v["year"], v["month"]): float(v["value"])
                        for v in element.get("values") or [] if v.get("value") is not None}
    adjusted, observed = series.get("SRVO", {}), series.get("SRVOO", {})
    common = set(adjusted) & set(observed)
    total = sum(observed[k] for k in common)
    if not common or total <= 0:
        return None
    return round((sum(adjusted[k] for k in common) / total - 1) * 100, 1)


def fetch_nrcs_adjustments(sites: Iterable[str], end: str) -> dict[str, float | None]:
    """Site number to adjustment percent for each gauge that has an NRCS pair.

    A gauge with no pair is absent; a gauge with a pair and no comparable
    months maps to None.
    """
    def stations(element: str) -> list[dict]:
        return upstream.get_json(
            f"{AWDB_BASE}/stations?" + urllib.parse.urlencode(
                {"elements": element, "activeOnly": "false"}), timeout=AWDB_TIMEOUT)

    pairs = pair_sites(stations("SRVO"), stations("SRVOO"))
    mine = sorted(site for site in set(sites) if site in pairs)
    result: dict[str, float | None] = {}
    for start in range(0, len(mine), AWDB_BATCH):
        batch = mine[start:start + AWDB_BATCH]
        payload = upstream.get_json(
            f"{AWDB_BASE}/data?" + urllib.parse.urlencode({
                "stationTriplets": ",".join(pairs[s] for s in batch),
                "elements": "SRVO,SRVOO", "duration": "MONTHLY",
                "beginDate": AWDB_BEGIN, "endDate": end}), timeout=AWDB_TIMEOUT)
        by_triplet = {entry["stationTriplet"]: entry for entry in payload}
        for site in batch:
            result[site] = adjustment_pct(by_triplet.get(pairs[site], {}))
    return result
