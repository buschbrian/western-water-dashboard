"""Build the vertical-datum review worksheet for published reservoir elevations.

A reservoir elevation is a number in a datum, and the source rarely says
which. NGVD29 and NAVD88 differ by about three feet in the interior West, and
a Reclamation project datum can differ from both (Lake Mead's Hoover Dam
powerhouse datum sits 0.55 feet below NGVD29). This tool gathers the evidence
for a datum label, one row per reservoir; the ruling is a person's (ADR-139).
It writes `datum-review.csv` and nothing else.

    .venv/bin/python tools/build_datum_review.py              # every published RISE reservoir
    .venv/bin/python tools/build_datum_review.py --missing    # rows not yet complete
    .venv/bin/python tools/build_datum_review.py --only 509 --only 6124
    .venv/bin/python tools/build_datum_review.py --no-reports # skip the PDF step
    .venv/bin/python tools/build_datum_review.py --suggest    # recompute suggestions offline

**The scope.** Every `source_key: rise` entry in `reservoirs.json` (keyed by
its RISE storage item id), found through the RISE catalog: the storage item's
catalog record lists the sibling items, and the one whose parameter is
"Lake/Reservoir Elevation" (parameter 2), daily first, is the elevation item.
A reservoir with no elevation item keeps its row and says so.

**The evidence, per row.**

1. The vertical shift S between NAVD88 and NGVD29 at the point, from the
   keyless NOAA NCAT service (GEOID18), and the same shift from NGS marks
   within `MARK_RADIUS_KM` (up to `MAX_MARKS` of the `MAX_SHEETS` nearest)
   whose datasheets carry both heights.
2. Datum statements. The RISE location's own `verticalDatum`, and sentences
   from Reclamation sedimentation or area-capacity reports found through the
   RISE catalog (a record whose location is the reservoir's, or whose title
   holds the reservoir's whole name), read with `pdftotext`. When `pdftotext`
   is not installed the report columns stay empty and `report_status` says so.
3. The USGS series 62614 (NGVD29), 62615 (NAVD88) and 00062 (datum not
   stated), daily means from the USGS OGC service (`X-Api-Key` only when
   `USGS_API_KEY` is set, keyless after a 403), at nearby monitoring locations, compared with the RISE elevation
   over the last `WINDOW_DAYS` days. USGS republishes Reclamation values and
   has mislabelled at least one reservoir, so a series alone is a check, not a
   statement.
4. The crest or full-pool elevation RISE publishes on the location, shown
   beside the highest elevation in the window. It is evidence for the
   reviewer; it never gives a suggestion.

**The suggestion.** `suggested_datum` is one of `NGVD29`, `NAVD88`,
`project datum` or `unverified`. A label is suggested only when a Reclamation
statement names exactly one datum (the RISE location or a report), or when two
checks at different USGS monitoring locations agree within `TOLERANCE_FT`. A
series whose difference from RISE moves by more than `DRIFT_FT` (10th to 90th percentile) across the window
gives no check. Statements that disagree, or any other state of the evidence,
give `unverified`. A suggestion is arithmetic over the columns beside it.

**Every run merges.** `reviewer_ruling` and `reviewer_notes` are never touched,
a row not asked about is kept as it was, the file is rewritten after every
reservoir, and `--missing` resumes an interrupted run.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import os
import re
import shutil
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / "datum-review.csv"
RESERVOIRS_PATH = ROOT / "reservoirs.json"

RISE_HOST = "https://data.usbr.gov"
RISE_API = f"{RISE_HOST}/rise/api"
RISE_RESULT = f"{RISE_API}/result"
NCAT_URL = "https://geodesy.noaa.gov/api/ncat/llh"
NDE_RADIAL_URL = "https://geodesy.noaa.gov/api/nde/radial"
DATASHEET_URL = "https://geodesy.noaa.gov/cgi-bin/ds_mark.prl"
USGS_DAILY_URL = "https://api.waterdata.usgs.gov/ogcapi/v1/collections/daily/items"

HEADERS = {"Accept": "application/vnd.api+json"}
TIMEOUT = 90
PDF_TIMEOUT = 180
RETRIES = 3
#: Seconds between requests: these are public services the project does not pay for.
DELAY = 0.3
ELEVATION_PARAMETER = "/rise/api/parameter/2"
M_TO_FT = 1 / 0.3048
FT_PER_M_NCAT_PROBE = 1000.0

WINDOW_DAYS = 90
MIN_COMMON_DAYS = 20
TOLERANCE_FT = 0.2
DRIFT_FT = 0.5
MARK_RADIUS_KM = 1
MAX_MARKS = 5
MAX_SHEETS = 8
USGS_BOX_DEGREES = 0.05
MAX_REPORTS = 3
MAX_QUOTES = 6
MAX_QUOTE_CHARS = 320
MAX_PDF_BYTES = 80_000_000
USGS_CODES = ("62614", "62615", "00062")

LABELS = ("NGVD29", "NAVD88", "project datum", "unverified")

FIELDS = [
    "station", "name", "state", "latitude", "longitude", "point_source",
    "rise_location_id",
    "rise_elevation_item", "elevation_status", "ncat_shift_ft", "ngs_marks",
    "ngs_shift_ft", "ngs_mark_ids", "rise_location_datum", "crest_ft",
    "crest_note", "window_max_ft", "report_status", "report_urls",
    "report_quotes", "report_datum", "usgs_sites", "common_days",
    "rise_median_ft", "usgs_62614_median_ft", "usgs_62615_median_ft",
    "usgs_00062_median_ft", "usgs_series_checks", "check_status",
    "suggested_datum", "suggestion_reason", "reviewer_ruling",
    "reviewer_notes", "checked_on",
]
#: Fields a run recomputes; everything else on a row is the reviewer's or derived.
EVIDENCE_FIELDS = FIELDS[FIELDS.index("rise_location_id"):FIELDS.index("check_status") + 1]


# --- datum statements ------------------------------------------------------

PROJECT_TERMS = re.compile(
    r"power\s?house datum|project datum|\bRPVD\b|reservoir project vertical datum|"
    r"spillway datum|USGS 1912|construction datum", re.I)
NGVD_TERMS = re.compile(
    r"\bNGVD\s?-?(?:19)?29\b|\bNGVD\b|National Geodetic Vertical Datum of 1929|"
    r"sea level datum of 1929", re.I)
NAVD_TERMS = re.compile(
    r"\bNAVD\s?-?(?:19)?88\b|\bNAVD\b|North American Vertical Datum of 1988", re.I)
DATUM_SENTENCE = re.compile(
    r"\bdatum\b|\bNGVD|\bNAVD|\bRPVD\b", re.I)
#: The horizontal datums are not what this worksheet is about.
HORIZONTAL_ONLY = re.compile(
    r"North American Datum|NAD\s?-?(?:19)?(?:27|83)|WGS\s?-?84|GPS datum", re.I)


def sentence_family(sentence: str) -> str | None:
    """The one vertical datum a sentence names, or None.

    A project term wins: "powerhouse datum, 0.55 feet lower than NGVD29" is a
    statement about the project datum. A sentence naming both national datums
    and no project datum is a conversion, not a statement of which is used.
    """
    if PROJECT_TERMS.search(sentence):
        return "project datum"
    ngvd, navd = bool(NGVD_TERMS.search(sentence)), bool(NAVD_TERMS.search(sentence))
    if ngvd and navd:
        return None
    if ngvd:
        return "NGVD29"
    if navd:
        return "NAVD88"
    return None


def split_sentences(text: str) -> list[str]:
    text = re.sub(r"-\n(?=[a-z])", "", text)
    text = re.sub(r"\s+", " ", text)
    return [s.strip() for s in re.split(r"(?<=[.;])\s+(?=[A-Z0-9(\"“])", text) if s.strip()]


def datum_sentences(text: str) -> list[tuple[str, str]]:
    """Sentences that state a vertical datum, as (family, quote), in reading order."""
    found = []
    for sentence in split_sentences(text):
        if not DATUM_SENTENCE.search(sentence):
            continue
        if HORIZONTAL_ONLY.search(sentence) and not (
                PROJECT_TERMS.search(sentence) or NGVD_TERMS.search(sentence)
                or NAVD_TERMS.search(sentence)):
            continue
        family = sentence_family(sentence)
        if family:
            found.append((family, sentence[:MAX_QUOTE_CHARS]))
    return found


def statement_family(families: list[str]) -> str:
    """The datums a set of statements names, sorted and joined by "; ", or "" for none."""
    return "; ".join(sorted(set(families)))


# --- vertical shift --------------------------------------------------------

def ncat_shift_ft(payload: dict) -> float | None:
    """NAVD88 minus NGVD29 at the point, in feet, from an NCAT response."""
    try:
        source, dest = float(payload["srcOrthoht"]), float(payload["destOrthoht"])
    except (KeyError, TypeError, ValueError):
        return None
    scale = M_TO_FT if payload.get("heightUnits", "m") == "m" else 1.0
    return round((source - dest) * scale, 3)


def datasheet_shift_ft(text: str) -> float | None:
    """NAVD88 minus NGVD29 for one mark, in feet, from its datasheet."""
    text = re.sub(r"<[^>]*>", "", text)
    navd = re.search(r"NAVD 88 ORTHO HEIGHT\s*-\s*([\d,.]+)\s*\(meters\)", text)
    ngvd = re.search(r"NGVD 29\s*\([^)]*\)\s+([\d,.]+)\s*\(m\)", text)
    if not (navd and ngvd):
        return None
    try:
        delta = float(navd.group(1).replace(",", "")) - float(ngvd.group(1).replace(",", ""))
    except ValueError:
        return None
    return round(delta * M_TO_FT, 3)


def median(values: list[float]) -> float | None:
    return round(statistics.median(values), 3) if values else None


# --- series comparison -----------------------------------------------------

def paired_difference(rise: dict[str, float],
                      usgs: dict[str, float]) -> tuple[int, float | None, float | None]:
    """(common days, median of RISE minus USGS, 10th-to-90th percentile spread).

    The percentile spread survives the odd bad day (a reading a reviewer has
    excluded, a gauge fault) that a maximum minus a minimum would not.
    """
    common = sorted(set(rise) & set(usgs))
    diffs = [rise[d] - usgs[d] for d in common]
    if len(diffs) < 10:
        return len(common), median(diffs), (round(max(diffs) - min(diffs), 3) if diffs else None)
    deciles = statistics.quantiles(diffs, n=10)
    return len(common), median(diffs), round(deciles[-1] - deciles[0], 3)


def series_checks(differences: dict[str, tuple[int, float | None, float | None]],
                  shift: float | None) -> list[tuple[str, str]]:
    """What each series says about the RISE datum, as (code, label).

    62614 is NGVD29: a difference near zero says RISE is NGVD29. 62615 is
    NAVD88: near zero says NAVD88, near minus S says NGVD29. A difference that
    fits neither says RISE is on some other datum. 00062 does not state its
    datum and never gives a label. A series that does not track the RISE
    values (the difference moves more than `DRIFT_FT` across the window) gives
    no label: a median of a moving difference says nothing about a datum.
    """
    out = []
    for code, (days, diff, spread) in sorted(differences.items()):
        if diff is None or days < MIN_COMMON_DAYS or code == "00062":
            continue
        if spread is None or spread > DRIFT_FT:
            continue
        if code == "62614":
            out.append((code, "NGVD29" if abs(diff) <= TOLERANCE_FT else "project datum"))
        elif code == "62615":
            if abs(diff) <= TOLERANCE_FT:
                out.append((code, "NAVD88"))
            elif shift is not None and abs(diff + shift) <= TOLERANCE_FT:
                out.append((code, "NGVD29"))
            else:
                out.append((code, "project datum"))
    return out


def window_series(results: list[dict]) -> dict[str, float]:
    """Date to value, from RISE result attributes or any {date, value} rows."""
    out: dict[str, float] = {}
    for row in results:
        value = row.get("result")
        if value is None:
            continue
        try:
            out[str(row["dateTime"])[:10]] = float(value)
        except (KeyError, TypeError, ValueError):
            continue
    return out


# --- the suggestion --------------------------------------------------------

def suggest(row: dict) -> tuple[str, str]:
    """(suggested_datum, reason). A label needs a statement or two agreeing checks."""
    location = row.get("rise_location_datum_family", "")
    reported = [f for f in (row.get("report_datum") or "").split("; ") if f]
    checks = _parse_checks(row.get("usgs_series_checks", ""))
    by_label: dict[str, set[str]] = {}
    for site, _code, label in checks:
        by_label.setdefault(label, set()).add(site)

    label, note = "", ""
    if location and reported:
        if location not in reported:
            return "unverified", (f"Reclamation statements disagree: the RISE location says "
                                  f"{location}, a report says {' and '.join(reported)}")
        label = location
        source = "the RISE location's vertical datum"
        if len(reported) > 1:
            other = ", ".join(f for f in reported if f != location)
            note = f"; a report also names {other}, see report_quotes"
        else:
            source += " and a Reclamation report"
    elif location:
        label, source = location, "the RISE location's vertical datum"
    elif len(reported) == 1:
        label, source = reported[0], "a Reclamation report"
    elif reported:
        return "unverified", ("a Reclamation report names several datums ("
                              + " and ".join(reported) + "), see report_quotes")
    if label:
        contrary = sorted(l for l in by_label if l != label)
        if contrary:
            return "unverified", (f"{source} names {label} but USGS series say "
                                  + " and ".join(contrary))
        agree = f"; USGS site {', '.join(sorted(by_label[label]))} agrees" if label in by_label else ""
        return label, f"{source} names {label}{agree}{note}"

    agreeing = [l for l, sites in by_label.items() if len(sites) >= 2 and l in LABELS[:2]]
    if len(agreeing) == 1 and len(by_label) == 1:
        label = agreeing[0]
        sites = ", ".join(sorted(by_label[label]))
        return label, (f"no Reclamation statement; USGS sites {sites} agree with "
                       f"{label} within {TOLERANCE_FT} ft")
    if checks:
        return "unverified", ("no Reclamation statement; USGS series "
                              + ", ".join(f"{s} {c} {l}" for s, c, l in checks)
                              + " (one monitoring location, or they disagree)")
    if row.get("usgs_sites"):
        return "unverified", ("no Reclamation statement; USGS site "
                              + row["usgs_sites"].replace("; ", ", ")
                              + " gave no check (no matching elevation series, too few "
                              "common days, or a difference that drifts)")
    return "unverified", "no Reclamation statement and no USGS elevation series nearby"


def _parse_checks(text: str) -> list[tuple[str, str, str]]:
    out = []
    for part in (text or "").split("; "):
        match = re.fullmatch(r"(\S+) (\d{5}) (.+)", part.strip())
        if match:
            out.append(match.groups())
    return out


# --- network ---------------------------------------------------------------

class ServiceError(Exception):
    """A request that failed after its retries; the row is retried by --missing."""


def get(url: str, params: dict | None = None, *, headers: dict | None = None,
        raw: bool = False, timeout: int = TIMEOUT, not_found_ok: bool = False):
    last: Exception | None = None
    for attempt in range(RETRIES):
        time.sleep(DELAY)
        try:
            response = requests.get(url, params=params, headers=headers, timeout=timeout)
            if response.status_code == 404 and not_found_ok:
                return None
            response.raise_for_status()
            return response.text if raw else response.json()
        except (requests.RequestException, ValueError) as error:
            last = error
            time.sleep(2 ** attempt)
    raise ServiceError(f"{url}: {last}")


def rise_get(path: str, params: dict | None = None) -> dict:
    if path.startswith("/rise/api/"):
        url = RISE_HOST + path
    elif path.startswith("http"):
        url = path
    else:
        url = f"{RISE_API}/{path.lstrip('/')}"
    return get(url, params, headers=HEADERS)


def iri_id(iri: str) -> str:
    return iri.rsplit("/", 1)[-1]


def find_elevation_item(storage_item: str) -> tuple[str, str, list[str]]:
    """(elevation item id or "", location id, sibling item ids) for a storage item."""
    item = rise_get(f"catalog-item/{storage_item}")["data"]
    record_iri = item["relationships"]["catalogRecord"]["data"]["id"]
    record = rise_get(record_iri)["data"]
    location = iri_id(record["relationships"]["location"]["data"]["id"])
    siblings = [iri_id(i["id"]) for i in record["relationships"]["catalogItems"]["data"]]
    elevation = []
    for sibling in siblings:
        data = rise_get(f"catalog-item/{sibling}")["data"]
        parameter = ((data.get("relationships") or {}).get("parameter") or {}).get("data") or {}
        if parameter.get("id") == ELEVATION_PARAMETER:
            elevation.append((0 if "Daily" in data["attributes"].get("itemTitle", "") else 1,
                              int(sibling)))
    return (str(min(elevation)[1]) if elevation else ""), location, siblings


def fetch_window(item_id: str, today: dt.date) -> list[dict]:
    start = (today - dt.timedelta(days=WINDOW_DAYS)).isoformat()
    rows: list[dict] = []
    page = 1
    while page <= 5:
        payload = get(RISE_RESULT, {
            "itemId": item_id, "itemsPerPage": 200, "order[dateTime]": "DESC",
            "dateTime[after]": start, "page": page}, headers=HEADERS)
        data = payload.get("data") or []
        rows.extend(entry["attributes"] for entry in data)
        meta = payload.get("meta") or {}
        if not data or page * (meta.get("itemsPerPage") or 0) >= (meta.get("totalItems") or 0):
            break
        page += 1
    return rows


def location_evidence(location_id: str) -> dict:
    attrs = rise_get(f"location/{location_id}")["data"]["attributes"]
    datum = attrs.get("verticalDatum") or {}
    text = " ".join(filter(None, [datum.get("_id"), datum.get("definition")])).strip()
    elevation = attrs.get("elevation")
    try:
        crest = round(float(elevation), 2) if elevation not in (None, "") else None
    except ValueError:
        crest = None
    coordinates = (attrs.get("locationCoordinates") or {}).get("coordinates") or []
    point = (float(coordinates[1]), float(coordinates[0])) if len(coordinates) == 2 else None
    return {"datum_text": text, "crest_ft": crest, "point": point,
            "name": attrs.get("locationName") or ""}


def ncat_shift(lat: float, lon: float) -> float | None:
    payload = get(NCAT_URL, {
        "lat": lat, "lon": lon, "inDatum": "NAD83(2011)", "outDatum": "NAD83(2011)",
        "orthoHt": FT_PER_M_NCAT_PROBE, "inVertDatum": "NAVD88",
        "outVertDatum": "NGVD29", "geoidModel": "GEOID18"})
    return ncat_shift_ft(payload)


def km_between(a: tuple[float, float], b: tuple[float, float]) -> float:
    dlat = (a[0] - b[0]) * 111.2
    dlon = (a[1] - b[1]) * 111.2 * math.cos(math.radians((a[0] + b[0]) / 2))
    return math.hypot(dlat, dlon)


def ngs_marks(lat: float, lon: float) -> tuple[list[str], list[float]]:
    """(mark ids checked, per-mark shifts in feet) for the nearest leveled marks."""
    marks = get(NDE_RADIAL_URL, {"lat": lat, "lon": lon, "radius": MARK_RADIUS_KM})
    leveled = []
    for mark in marks or []:
        try:
            height = float(mark.get("orthoHt"))
            position = (float(mark["lat"]), float(mark["lon"]))
        except (TypeError, ValueError, KeyError):
            continue
        if height > 0 and mark.get("pid"):
            leveled.append((km_between((lat, lon), position), mark["pid"]))
    ids, shifts = [], []
    for _, pid in sorted(leveled)[:MAX_SHEETS]:
        sheet = get(DATASHEET_URL, {"PidBox": pid}, raw=True, not_found_ok=True)
        shift = datasheet_shift_ft(sheet or "")
        if shift is not None:
            ids.append(pid)
            shifts.append(shift)
            if len(ids) == MAX_MARKS:
                break
    return ids, shifts


def usgs_get(url: str, params: dict | None = None) -> dict:
    """GET from the USGS OGC service: keyed when USGS_API_KEY is set, keyless on 403."""
    key = os.environ.get("USGS_API_KEY", "").strip()
    if key:
        try:
            return get(url, params, headers={"X-Api-Key": key, "Accept": "application/json"})
        except ServiceError as error:
            if "403" not in str(error):
                raise
    return get(url, params, headers={"Accept": "application/json"})


def usgs_daily(lat: float, lon: float, today: dt.date) -> dict[str, dict[str, dict[str, float]]]:
    """Site to code to {date: value}: the daily means of the elevation series nearby."""
    box = USGS_BOX_DEGREES
    payload = usgs_get(USGS_DAILY_URL, {
        "f": "json", "limit": 1000, "bbox": f"{lon - box:.4f},{lat - box:.4f},{lon + box:.4f},{lat + box:.4f}",
        "parameter_code": ",".join(USGS_CODES), "statistic_id": "00003",
        "time": f"{(today - dt.timedelta(days=WINDOW_DAYS)).isoformat()}/{today.isoformat()}"})
    return group_daily(payload.get("features") or [])


def group_daily(features: list[dict]) -> dict[str, dict[str, dict[str, float]]]:
    out: dict[str, dict[str, dict[str, float]]] = {}
    for feature in features:
        props = feature.get("properties") or {}
        try:
            site = str(props["monitoring_location_id"]).removeprefix("USGS-")
            value = float(props["value"])
            day = str(props["time"])[:10]
            code = str(props["parameter_code"])
        except (KeyError, TypeError, ValueError):
            continue
        out.setdefault(site, {}).setdefault(code, {})[day] = value
    return out


# --- reports ---------------------------------------------------------------

REPORT_TITLE = re.compile(r"sediment|area[- ]capacity|capacity|survey", re.I)


def normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def record_matches(record: dict, name: str, location_id: str) -> str:
    """"location", "name" or "" for a catalog record, as a basis for its reports."""
    title = (record.get("attributes") or {}).get("recordTitle", "")
    if not REPORT_TITLE.search(title):
        return ""
    location = (((record.get("relationships") or {}).get("location") or {})
                .get("data") or {}).get("id", "")
    if location_id and iri_id(location) == str(location_id):
        return "location"
    wanted = normalize_name(name)
    if wanted and f" {wanted} " in f" {normalize_name(title)} ":
        return "name"
    return ""


def catalog_records() -> list[dict]:
    records: list[dict] = []
    page = 1
    while True:
        payload = rise_get("catalog-record", {"itemsPerPage": 1000, "page": page})
        records.extend(payload.get("data") or [])
        meta = payload.get("meta") or {}
        if page * (meta.get("itemsPerPage") or 1000) >= (meta.get("totalItems") or 0):
            return records
        page += 1


def report_urls(records: list[dict], name: str, location_id: str) -> list[str]:
    urls: list[str] = []
    for record in records:
        if not record_matches(record, name, location_id):
            continue
        for ref in record["relationships"]["catalogItems"]["data"]:
            attrs = rise_get(f"catalog-item/{iri_id(ref['id'])}")["data"]["attributes"]
            url = attrs.get("binaryFilePath") or ""
            if (attrs.get("itemType") or {}).get("_id") == "RPRT" and url.lower().endswith(".pdf"):
                urls.append(url)
    return urls[:MAX_REPORTS]


def pdf_text(url: str) -> str:
    with tempfile.TemporaryDirectory() as folder:
        target = Path(folder) / "report.pdf"
        with requests.get(url, stream=True, timeout=PDF_TIMEOUT) as response:
            response.raise_for_status()
            size = 0
            with target.open("wb") as handle:
                for chunk in response.iter_content(1 << 20):
                    size += len(chunk)
                    if size > MAX_PDF_BYTES:
                        raise ServiceError(f"{url}: larger than {MAX_PDF_BYTES} bytes")
                    handle.write(chunk)
        done = subprocess.run(["pdftotext", "-layout", str(target), "-"],
                              capture_output=True, text=True, timeout=PDF_TIMEOUT, check=False)
        return done.stdout


def report_evidence(records: list[dict] | None, name: str, location_id: str) -> dict:
    if not shutil.which("pdftotext"):
        return {"report_status": "pdftotext not installed", "report_urls": "",
                "report_quotes": "", "report_datum": ""}
    urls = report_urls(records or [], name, location_id)
    if not urls:
        return {"report_status": "no report in the RISE catalog", "report_urls": "",
                "report_quotes": "", "report_datum": ""}
    quotes, families, used = [], [], []
    for url in urls:
        try:
            found = datum_sentences(pdf_text(url))
        except (requests.RequestException, ServiceError, subprocess.SubprocessError):
            continue
        used.append(url)
        families += [family for family, _ in found]
        quotes += [f"[{family}] {quote}" for family, quote in found[:MAX_QUOTES]]
    return {"report_status": "read" if used else "could not read the reports",
            "report_urls": "; ".join(urls), "report_quotes": " | ".join(quotes[:MAX_QUOTES]),
            "report_datum": statement_family(families)}


# --- one reservoir ---------------------------------------------------------

def datum_family(text: str) -> str:
    """The datum a RISE vertical-datum description names, or "" ."""
    return statement_family([f for f in [sentence_family(text)] if f])


def choose_point(entry: dict, place: dict) -> tuple[tuple[float, float], str]:
    """The point the vertical shift and the marks are read at, and why.

    The inventory dam position first (the roster confirmed it by position), then
    the RISE location when it is named for a dam, then the published point. The shift moves about a tenth of a
    foot across a large reservoir, so the point is stated beside the shift.
    """
    point = entry.get("huc_assignment_point")
    if point and entry.get("huc_assignment_source") == "nid_dam_point":
        return (float(point[1]), float(point[0])), "National Inventory of Dams position"
    if place.get("point") and "dam" in place.get("name", "").lower():
        return place["point"], "RISE location named for the dam"
    if point:
        return (float(point[1]), float(point[0])), "published drainage point"
    return (float(entry["lat"]), float(entry["lon"])), "published point"


def check_reservoir(entry: dict, records: list[dict] | None, today: dt.date,
                    reports: bool = True) -> dict:
    """Every evidence field for one published reservoir. Failures are named, not hidden."""
    station = str(entry["rise_item_id"])
    row = dict.fromkeys(FIELDS, "")
    row.update(station=station, name=entry["name"], state=entry.get("state") or "")
    failed: list[str] = []

    elevation_item, location_id = "", ""
    try:
        elevation_item, location_id, _ = find_elevation_item(station)
        row["rise_location_id"] = location_id
        row["rise_elevation_item"] = elevation_item
        row["elevation_status"] = "found" if elevation_item else "no elevation item in the record"
    except (ServiceError, KeyError) as error:
        failed.append("catalog")
        row["elevation_status"] = f"catalog failed: {error}"[:120]

    place: dict = {}
    if location_id:
        try:
            place = location_evidence(location_id)
            row["rise_location_datum"] = place["datum_text"]
            row["crest_ft"] = "" if place["crest_ft"] is None else place["crest_ft"]
        except (ServiceError, KeyError):
            failed.append("location")
    (lat, lon), row["point_source"] = choose_point(entry, place)
    row["latitude"], row["longitude"] = lat, lon

    shift = None
    try:
        shift = ncat_shift(lat, lon)
        row["ncat_shift_ft"] = "" if shift is None else shift
    except ServiceError:
        failed.append("ncat")
    try:
        ids, shifts = ngs_marks(lat, lon)
        row["ngs_marks"] = len(ids)
        row["ngs_shift_ft"] = "" if not shifts else median(shifts)
        row["ngs_mark_ids"] = "; ".join(ids)
    except ServiceError:
        failed.append("ngs")

    rise: dict[str, float] = {}
    if elevation_item:
        try:
            rise = window_series(fetch_window(elevation_item, today))
            row["rise_median_ft"] = "" if not rise else median(list(rise.values()))
            row["window_max_ft"] = "" if not rise else max(rise.values())
        except ServiceError:
            failed.append("elevation")

    if reports:
        try:
            evidence = report_evidence(records, entry["name"], location_id)
        except ServiceError:
            failed.append("reports")
            evidence = {}
        row.update(evidence)

    by_site: dict[str, dict[str, dict[str, float]]] = {}
    try:
        by_site = usgs_daily(lat, lon, today)
    except ServiceError:
        failed.append("usgs")
    checks: list[str] = []
    medians: dict[str, list[float]] = {}
    row["usgs_sites"] = "; ".join(sorted(by_site))
    common = 0
    for site, daily in sorted(by_site.items()) if rise else []:
        differences = {code: paired_difference(rise, values) for code, values in daily.items()}
        for code, values in daily.items():
            medians.setdefault(code, []).append(median(list(values.values())))
        common = max([common] + [days for days, _, _ in differences.values()])
        checks += [f"{site} {code} {label}" for code, label in series_checks(differences, shift)]
    row["common_days"] = common
    for code in USGS_CODES:
        values = medians.get(code)
        row[f"usgs_{code}_median_ft"] = "" if not values else median(values)
    row["usgs_series_checks"] = "; ".join(checks)

    row["check_status"] = "complete" if not failed else "partial: " + ", ".join(failed)
    if not failed:
        row["checked_on"] = today.isoformat()
    return row


# --- the file --------------------------------------------------------------

def derived(row: dict) -> dict:
    row = dict(row)
    row["rise_location_datum_family"] = datum_family(row.get("rise_location_datum", ""))
    row["suggested_datum"], row["suggestion_reason"] = suggest(row)
    note = []
    crest, top = row.get("crest_ft"), row.get("window_max_ft")
    if crest not in ("", None) and top not in ("", None):
        gap = float(top) - float(crest)
        note.append(f"window maximum is {gap:+.2f} ft from the published crest or full pool")
    row["crest_note"] = "; ".join(note)
    return row


def read_rows(path: Path = OUTPUT_PATH) -> dict[str, dict]:
    if not path.exists():
        return {}
    with path.open(newline="", encoding="utf-8") as handle:
        return {row["station"]: {field: row.get(field, "") for field in FIELDS}
                for row in csv.DictReader(handle)}


def write_rows(rows: dict[str, dict], path: Path = OUTPUT_PATH) -> None:
    ordered = []
    for row in rows.values():
        full = derived(row)
        ordered.append({field: full.get(field, "") for field in FIELDS})
    ordered.sort(key=lambda r: (r["name"].lower(), r["station"]))
    temporary = path.with_suffix(".csv.tmp")
    with temporary.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(ordered)
    temporary.replace(path)


def merge_row(existing: dict | None, fresh: dict) -> dict:
    """Fresh evidence over the old row; the ruling and its notes are kept."""
    row = dict(existing) if existing else dict.fromkeys(FIELDS, "")
    for field in FIELDS:
        if field in ("reviewer_ruling", "reviewer_notes"):
            continue
        if field in fresh:
            row[field] = fresh[field]
    return row


def roster(path: Path = RESERVOIRS_PATH) -> list[dict]:
    reservoirs = json.loads(path.read_text(encoding="utf-8"))["reservoirs"]
    return sorted((r for r in reservoirs if r.get("source_key") == "rise"),
                  key=lambda r: r["name"].lower())



def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--only", action="append", default=[], metavar="ITEM",
                        help="check only these RISE storage item ids")
    parser.add_argument("--missing", action="store_true",
                        help="check only rows that are absent or not complete")
    parser.add_argument("--no-reports", action="store_true",
                        help="skip the report search and PDF step")
    parser.add_argument("--suggest", action="store_true",
                        help="recompute the suggestions offline and stop")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH)
    args = parser.parse_args(argv)

    rows = read_rows(args.output)
    if args.suggest:
        write_rows(rows, args.output)
        print(f"suggested a datum for {len(rows)} rows in {args.output.name}")
        return 0

    only = set(args.only)
    targets = [entry for entry in roster()
               if (not only or str(entry["rise_item_id"]) in only)
               and (not args.missing
                    or rows.get(str(entry["rise_item_id"]), {}).get("check_status") != "complete")]
    today = dt.date.today()
    records = None
    for count, entry in enumerate(targets, 1):
        station = str(entry["rise_item_id"])
        if records is None and not args.no_reports:
            try:
                records = catalog_records()
            except ServiceError as error:
                print(f"report search skipped: {error}")
                records = []
        fresh = check_reservoir(entry, records, today, reports=not args.no_reports)
        if args.no_reports and station in rows:
            for field in ("report_status", "report_urls", "report_quotes", "report_datum"):
                fresh[field] = rows[station].get(field, "")
        rows[station] = merge_row(rows.get(station), fresh)
        write_rows(rows, args.output)
        done = derived(rows[station])
        print(f"[{count}/{len(targets)}] {station} {entry['name']}: "
              f"{done['suggested_datum']} ({rows[station]['check_status']})", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
