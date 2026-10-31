#!/usr/bin/env python3
"""Screen New Mexico storage candidates from every provider the site reads.

Brian opened New Mexico admission on 2026-10-27 (R11). The dashboard publishes
one New Mexico reservoir, Navajo. This tool gathers, for every storage series
New Mexico has on the three providers that carry it, what admission needs, and
decides each with the shared machinery in `admission.py`, unmodified:

- U.S. Geological Survey: every active parameter-00054 site in the state, read
  from the daily-values service since 2015 (the statistic with the freshest
  last reading is chosen, never the first one listed);
- Bureau of Reclamation RISE: Lake/Reservoir locations that stand in New Mexico
  and publish a daily acre-foot storage item;
- U.S. Army Corps of Engineers CWMS: the Albuquerque District (`SPA`);
- the National Inventory of Dams for New Mexico and the states beside it, so
  a dam is matched by position before name (ADR-015, ADR-106) and the
  denominator is chosen by ADR-003/ADR-072;
- the drawn scope (`west-huc6`, ADR-053), because a candidate outside it cannot
  be published whatever its other evidence says;
- dam identity and position across providers (ADR-069), because Abiquiu,
  Cochiti and the rest are reported by the Corps and by USGS alike.

A probe: it prints its evidence as JSON and writes nothing. The suggestion
column is a screen's reading, never a roster edit. The committed copy of one
run is `data/reviews/new-mexico-admission-screen.json`:

    .venv/bin/python tools/audit_new_mexico_reservoirs.py \\
        > data/reviews/new-mexico-admission-screen.json

USGS is read through the legacy daily-values service, as `probe_nwis_storage`
does, because it needs no key. The refresh reads the same series through the
OGC service (ADR-098); the roster edit this screen proposes names the
statistic the refresh will ask that service for.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

import admission  # noqa: E402

START_DATE = "2015-01-01"
STATE = "NM"
#: Neighbours whose dams can stand within the matching radius of a New Mexico
#: point or be the real dam of a water the provider tags to New Mexico.
DAM_STATE_CODES = ("NM", "CO", "AZ", "TX", "UT", "OK")
#: A series whose last reading is older than this would be withdrawn on the
#: morning it joined the map (`pipeline.constants.WITHDRAW_AFTER_DAYS`).
CURRENT_WITHIN_DAYS = 30
#: New Mexico's bounding box, used only to select RISE locations whose own
#: state tag is another state (Navajo is tagged Colorado, ADR-069).
NM_BOX = {"south": 31.3, "north": 37.05, "west": -109.1, "east": -102.95}
NWIS_URL = "https://waterservices.usgs.gov/nwis/dv/"
NWIS_USER_AGENT = ("western-water-dashboard/nm-admission-screen "
                   "(+https://github.com/buschbrian)")
#: The agency named by the inventory's operator or owner field decides which
#: provider keeps a dam published by several (Brian, 2026-10-27): the dam's
#: operator first, any other agency feed second, USGS only when neither
#: operator publishes it.
OPERATOR_MARKERS = (("army corps", "cwms"), ("reclamation", "rise"))
NO_DATA = -999999.0


def parse_nwis(payload: dict) -> dict[str, dict]:
    """Group a daily-values response by site and statistic.

    Returns ``{site_no: {"name", "lat", "lon", "statistics": {stat: [(date,
    value)]}}}`` with dates as ISO strings, the no-data sentinel dropped and
    negative storage refused, the same screens the refresh applies.
    """
    sites: dict[str, dict] = {}
    for series in ((payload.get("value") or {}).get("timeSeries")) or []:
        info = series["sourceInfo"]
        site_no = info["siteCode"][0]["value"]
        site = sites.setdefault(site_no, {
            "name": info["siteName"],
            "lat": info["geoLocation"]["geogLocation"]["latitude"],
            "lon": info["geoLocation"]["geogLocation"]["longitude"],
            "statistics": {},
        })
        if series["variable"]["unit"]["unitCode"] != "ac-ft":
            continue
        options = series["variable"].get("options", {}).get("option") or []
        stat = next((o["optionCode"] for o in options
                     if o.get("name") == "Statistic"), None)
        if not stat:
            continue
        points = []
        for block in series.get("values") or []:
            for reading in block.get("value") or []:
                try:
                    number = float(reading["value"])
                except (TypeError, ValueError, KeyError):
                    continue
                if number == NO_DATA or number < 0:
                    continue
                points.append((str(reading["dateTime"])[:10], number))
        site["statistics"].setdefault(stat, []).extend(points)
    return sites


def choose_statistic(statistics: dict[str, list]) -> str | None:
    """The statistic to read: freshest last reading, then the longer series."""
    ranked = sorted(
        ((points[-1][0], len(points), stat)
         for stat, points in statistics.items() if points),
        reverse=True)
    return ranked[0][2] if ranked else None


def summarize(points: list[tuple[str, float]], today: dt.date) -> dict:
    """The record-length and freshness facts one candidate is judged on."""
    if not points:
        return {"readings": 0, "first_reading": None, "last_reading": None,
                "days_since_last": None, "current": False,
                "latest_af": None, "observed_max_af": None,
                "highest_readings": []}
    ordered = sorted(points)
    values = [value for _day, value in ordered]
    last = dt.date.fromisoformat(ordered[-1][0])
    age = (today - last).days
    return {
        "readings": len(ordered),
        "first_reading": ordered[0][0],
        "last_reading": ordered[-1][0],
        "days_since_last": age,
        "current": age <= CURRENT_WITHIN_DAYS,
        "latest_af": values[-1],
        "observed_max_af": max(values),
        "highest_readings": sorted(values, reverse=True)[:3],
    }


_STATE_TAIL = re.compile(
    r",?\s+(NM|N\.?\s?MEX\.?|N\.?\s?M\.?|NEW MEXICO)\.?$", re.IGNORECASE)
_LOCALITY = re.compile(
    r"\s+(NR|NEAR|AT|ABV|BLW|BELOW|ABOVE|BL)\s+.*$", re.IGNORECASE)
_PAREN = re.compile(r"\s*\(([^)]*)\)")
_ABBREVIATIONS = {"RES": "Reservoir", "LK": "Lake", "R": "River",
                  "N": "North", "S": "South"}
_WATER_WORD = re.compile(r"\b(reservoir|res|lake|lk)\b", re.IGNORECASE)


def clean_name(raw: str) -> str:
    """A gauge's name made into a display name by the worksheet's conventions.

    The conventions are `names-worksheet.csv`'s patterns: drop the state and
    the "near" locality, resolve a parenthetical (the alias when it names the
    water, otherwise nothing), expand the gauge abbreviations, and title-case.
    A proposal, never a ruling: the worksheet is reviewed by a person.
    """
    name = " ".join(raw.split())
    parenthetical = _PAREN.search(name)
    alias = parenthetical.group(1) if parenthetical else ""
    name = _PAREN.sub("", name)
    if alias and _WATER_WORD.search(alias):
        name = alias
    name = _STATE_TAIL.sub("", name)
    name = _LOCALITY.sub("", name)
    name = _STATE_TAIL.sub("", name).strip(" ,")
    words = []
    for word in name.split():
        key = word.upper().strip(".")
        if key in ("RES", "LK"):
            words.append(_ABBREVIATIONS[key])
        else:
            words.append(word.capitalize() if word.isupper() else word)
    name = " ".join(words)
    return re.sub(r"\bLk\b", "Lake", name)


def propose_name(raw: str, gnis_names: list[str],
                 error: str | None = None) -> dict:
    """The name evidence for one candidate, as fields to merge into its row.

    One named NHD water wins. When hydrography could not be asked, the name
    is left empty and flagged for review: the cleaned gauge name is kept
    beside it as information, never promoted to the proposal.
    """
    cleaned = clean_name(raw)
    if error:
        return {"name": None, "name_basis": f"NHD unavailable: {error}",
                "name_needs_review": True, "gauge_name_cleaned": cleaned}
    named = sorted({n.strip() for n in gnis_names if n and n.strip()})
    if len(named) == 1:
        return {"name": named[0],
                "name_basis": "NHD GNIS name at the provider point",
                "name_needs_review": False, "gauge_name_cleaned": cleaned}
    basis = ("operator name, cleaned (NHD names no water at the point)"
             if not named else
             "operator name, cleaned (NHD names several waters: "
             + "; ".join(named) + ")")
    return {"name": cleaned, "name_basis": basis,
            "name_needs_review": bool(named), "gauge_name_cleaned": cleaned}


def in_new_mexico_box(lon: float, lat: float) -> bool:
    return (NM_BOX["south"] <= lat <= NM_BOX["north"]
            and NM_BOX["west"] <= lon <= NM_BOX["east"])


def operator_provider(*fields: str | None) -> str | None:
    """The provider of the agency the inventory names as operator or owner.

    Fields are tried in order, so the operator field outranks the owner
    field. None means neither the Corps nor Reclamation, which is the only
    case in which a USGS feed is the dam's best one.
    """
    for text in fields:
        lowered = (text or "").lower()
        for marker, provider in OPERATOR_MARKERS:
            if marker in lowered:
                return provider
    return None


def feed_rank(row: dict) -> tuple:
    provider = row["provider"]
    if provider == row.get("operator"):
        tier = 0
    elif provider in ("rise", "cwms"):
        tier = 1
    else:
        tier = 2
    return (tier, not row.get("current", False), -(row.get("readings") or 0),
            row["station"])


def mark_duplicates(rows: list[dict], radius_km: float = 3.0) -> None:
    """Keep one row per dam: same inventory id, or within the working radius.

    Dam identity decides where the inventory matched one (ADR-069); position
    is only the fallback. The surviving row is the operator's own feed, then
    another agency's, then USGS (``feed_rank``); the others carry
    ``duplicate_of`` and are never dropped, so the reviewer sees every feed.
    """
    kept: list[dict] = []
    for row in sorted(rows, key=feed_rank):
        twin = None
        for other in kept:
            same_dam = bool(row.get("nid_id")) and row.get("nid_id") == other.get("nid_id")
            near = admission.distance_km(
                (row["lon"], row["lat"]), (other["lon"], other["lat"])) <= radius_km
            if same_dam or near:
                twin = other
                break
        if twin is None:
            kept.append(row)
        else:
            row["duplicate_of"] = {
                "provider": twin["provider"], "station": twin["station"],
                "name": twin["name"], "nid_id": twin.get("nid_id")}


def dam_operators(nid_ids: list[str]) -> dict[str, dict]:
    """Operator and owner fields of the matched dams, from the inventory."""
    from audit_candidate_capacity import NID_LAYER, get_json

    found: dict[str, dict] = {}
    ids = sorted(set(nid_ids))
    for start in range(0, len(ids), 40):
        quoted = ",".join(repr(i) for i in ids[start:start + 40])
        page = get_json(f"{NID_LAYER}/query", {
            "f": "json", "where": f"NIDID IN ({quoted})",
            "outFields": "NIDID,FED_AGENCY_OPERATIONS,FED_AGENCY_OWNERS,"
                         "OWNER_TYPES,PRIMARY_OWNER_TYPE",
            "returnGeometry": "false"})
        if page is None:
            raise RuntimeError("NID operator query failed; partial data refused")
        for feature in page.get("features") or []:
            attributes = feature["attributes"]
            found[attributes["NIDID"]] = attributes
    return found


def suggest(row: dict) -> tuple[str, str]:
    """admit / hold / reject for one screened candidate, with the reason."""
    twin = row.get("duplicate_of")
    if twin:
        return "reject", (f"same dam as the {twin['provider'].upper()} candidate "
                          f"{twin['station']} ({twin['name']}); one feed per dam "
                          "(ADR-069)")
    if not row.get("readings"):
        return "reject", "no readings since 2015 on this provider"
    if not row.get("current"):
        return "hold", (f"last reading {row['last_reading']} is "
                        f"{row['days_since_last']} days old; it would be "
                        "withdrawn on its first morning (ADR-056)")
    reasons = []
    if row.get("in_scope") is False:
        reasons.append("outside the drawn areas (ADR-053): its basin is "
                       "not in west-huc6")
    if not row.get("rule_admitted"):
        reasons.append(f"no confirmed dam: {row.get('reason')}")
    elif row.get("match_confirmed_by") == "name":
        reasons.append("dam matched by name only, not by position (ADR-106)")
    reasons += [f"{s['screen']}: {s['detail']}" for s in row.get("screens", [])]
    if reasons:
        return "hold", "; ".join(reasons)
    return "admit", (f"in scope, current, dam {row['nid_id']} confirmed by "
                     f"{row['match_confirmed_by']} at "
                     f"{row['match_distance_km']} km, all screens clear")


def screen_dams(row: dict, dams: list[dict]) -> None:
    """Run `admit` and `discrepancies` and fold the evidence into the row."""
    candidate = {"name": row["provider_name"], "lon": row["lon"], "lat": row["lat"],
                 "observed_max_af": row.get("observed_max_af")}
    decision = admission.admit(candidate, dams)
    if decision.match is not None:
        capacity, basis = admission.denominator_for(
            decision.match.dam, candidate["observed_max_af"])
        decision = admission.Decision(
            decision.name, decision.admitted, decision.reason,
            decision.match, capacity, basis)
    screens = admission.discrepancies(
        decision, highest_readings=row.get("highest_readings"))
    row.update(decision.evidence())
    row["rule_admitted"] = bool(decision.admitted)
    row["screens"] = [{"screen": n, "detail": d} for n, d in screens
                      if n != "no confirmed dam"]


# --- Network side ----------------------------------------------------------

def nwis_get(params: dict) -> dict:
    import requests

    last = None
    for attempt in range(3):
        try:
            response = requests.get(
                NWIS_URL, params={**params, "format": "json"}, timeout=120,
                headers={"User-Agent": NWIS_USER_AGENT})
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            last = exc
            time.sleep(2 ** attempt)
    raise RuntimeError(f"NWIS daily values: {last}")


def usgs_candidates(today: dt.date) -> list[dict]:
    listing = parse_nwis(nwis_get({
        "stateCd": STATE, "parameterCd": "00054", "siteStatus": "active",
        "period": "P7D"}))
    rows = []
    for site_no, site in sorted(listing.items()):
        full = parse_nwis(nwis_get({
            "sites": site_no, "parameterCd": "00054",
            "startDT": START_DATE, "endDT": today.isoformat()}))
        time.sleep(0.5)
        statistics = (full.get(site_no) or {}).get("statistics") or {}
        stat = choose_statistic(statistics)
        points = statistics.get(stat, [])
        rows.append({
            "provider": "usgs", "station": site_no, "state": STATE,
            "provider_name": site["name"], "lat": site["lat"],
            "lon": site["lon"], "statistic_id": stat,
            "statistics_offered": sorted(statistics),
            **summarize(points, today)})
        print(f"  usgs {site_no} {site['name'][:40]:<42} "
              f"{len(points)} readings", file=sys.stderr)
    return rows


def rise_candidates(today: dt.date) -> list[dict]:
    import audit_rise_reservoirs as rise

    locations = rise.fetch_collection("location")
    chosen = []
    for resource in locations:
        attributes = resource.get("attributes") or {}
        if attributes.get("locationTypeName") != "Lake/Reservoir":
            continue
        point = rise.point_of(resource)
        if point is None:
            continue
        states = [s.upper() for s in rise.relationship_ids(resource, "states")]
        if STATE not in states and not in_new_mexico_box(*point):
            continue
        chosen.append({
            "location_id": str(attributes.get("_id") or resource.get("id", "")
                               ).rsplit("/", 1)[-1],
            "provider_name": str(attributes.get("locationName") or "").strip(),
            "lon": point[0], "lat": point[1],
            "state": states[0] if states else "",
            "catalog_record_ids": rise.relationship_ids(resource, "catalogRecords"),
        })
    records = {rid: c for c in chosen for rid in c["catalog_record_ids"]}
    items = rise.storage_items(rise.fetch_collection("catalog-item"), set(records))
    rows = []
    for item in items:
        owner = next((records[r] for r in item["catalog_record_ids"]
                      if r in records), None)
        if owner is None:
            continue
        points = rise_series(rise, item["item_id"])
        rows.append({
            "provider": "rise", "station": item["item_id"],
            "rise_location_id": owner["location_id"], "state": owner["state"],
            "provider_name": owner["provider_name"],
            "lat": owner["lat"], "lon": owner["lon"],
            "temporal_start": item.get("temporal_start"),
            "temporal_end": item.get("temporal_end"),
            **summarize(points, today)})
        print(f"  rise {item['item_id']:>5} {owner['provider_name'][:40]:<42} "
              f"{len(points)} days", file=sys.stderr)
    return best_item_per_location(rows)


def best_item_per_location(rows: list[dict]) -> list[dict]:
    """One storage item per RISE location: the freshest, then the longest.

    A location can expose several catalog items; the others are kept under
    ``other_items`` so the reviewer can see which feed was set aside.
    """
    chosen: dict[str, dict] = {}
    for row in sorted(rows, key=lambda r: (
            r.get("last_reading") or "", r.get("readings") or 0,
            int(r["station"])), reverse=True):
        key = row["rise_location_id"]
        if key in chosen:
            chosen[key].setdefault("other_items", []).append({
                "item_id": row["station"], "readings": row["readings"],
                "last_reading": row["last_reading"]})
        else:
            chosen[key] = row
    return list(chosen.values())


def rise_series(rise, item_id: str) -> list[tuple[str, float]]:
    end = (dt.date.today() + dt.timedelta(days=1)).strftime("%Y%m%d")
    daily: dict[str, float] = {}
    page = 1
    while page <= rise.MAX_RESULT_PAGES:
        payload = rise.request_json(rise.RESULT_URL, {
            "itemsPerPage": rise.RESULT_PAGE_SIZE, "order[dateTime]": "ASC",
            "itemId": item_id,
            "dateTime[after]": START_DATE.replace("-", ""),
            "dateTime[strictly_before]": end, "page": page})
        data = payload.get("data") or []
        for resource in data:
            attributes = resource.get("attributes") or {}
            try:
                number = float(attributes.get("result"))
            except (TypeError, ValueError):
                continue
            stamp = str(attributes.get("dateTime") or "")[:10]
            if stamp and number >= 0:
                daily[stamp] = number
        meta = payload.get("meta") or {}
        per_page, total = int(meta.get("itemsPerPage") or 0), int(meta.get("totalItems") or 0)
        if not data or per_page <= 0 or page * per_page >= total:
            break
        page += 1
    return sorted(daily.items())


def cwms_candidates(today: dt.date) -> list[dict]:
    import pandas as pd

    from audit_cwms_stations import series_rank
    from pipeline.providers import (
        CWMS_CATALOG_URL, CWMS_LOCATIONS_URL, _get_cwms_json, fetch_cwms_series)

    office = "SPA"
    entries, params = [], {"office": office, "like": ".*Stor.*", "page-size": 500}
    while True:
        page = _get_cwms_json(CWMS_CATALOG_URL, params)
        entries.extend(page.get("entries") or [])
        if not page.get("next-page"):
            break
        params = {**params, "page": page["next-page"]}
    places = {row["name"]: row for row in _get_cwms_json(
        CWMS_LOCATIONS_URL, {"office": office})
        if isinstance(row, dict) and row.get("name")}
    by_location: dict[str, list[str]] = {}
    earliest: dict[str, str] = {}
    for entry in entries:
        by_location.setdefault(entry["name"].split(".")[0], []).append(entry["name"])
        earliest[entry["name"]] = ((entry.get("extents") or [{}])[0]
                                   .get("earliest-time") or "")
    end = (today + dt.timedelta(days=1)).strftime("%Y%m%d")
    rows = []
    for location in sorted(by_location):
        place = places.get(location) or {}
        if place.get("state-initial") != STATE or place.get("nation") != "US":
            continue
        ranked = sorted(filter(None, (series_rank(s, earliest.get(s, ""))
                                      for s in by_location[location])))
        own = [r[-1] for r in ranked if "USBR" not in r[-1]]
        row = {"provider": "cwms", "station": location, "office": office,
               "state": STATE, "provider_name": place.get("public-name") or location,
               "long_name": place.get("long-name"),
               "lat": place.get("latitude"), "lon": place.get("longitude"),
               "series_offered": by_location[location], "timeseries": None}
        frame = None
        for name in own:
            try:
                frame = fetch_cwms_series(office, name, START_DATE.replace("-", ""), end)
            except Exception as exc:  # noqa: BLE001
                print(f"  cwms {name}: {type(exc).__name__}: {exc}", file=sys.stderr)
                frame = None
            time.sleep(0.3)
            if frame is not None and not frame.empty and \
                    frame["date"].max() >= pd.Timestamp(today) - pd.Timedelta(
                        days=CURRENT_WITHIN_DAYS):
                row["timeseries"] = name
                break
        if row["timeseries"] is None:
            # Nothing current: report the longest-history series with what it
            # did answer, so the hold names a date and not just a silence.
            frame = frame if frame is not None else None
            row["timeseries"] = own[0] if own else None
        points = ([] if frame is None or frame.empty else
                  [(d.strftime("%Y-%m-%d"), float(v))
                   for d, v in zip(frame["date"], frame["storage_af"])])
        row.update(summarize(points, today))
        rows.append(row)
        print(f"  cwms {location:<14} {row['provider_name'][:36]:<38} "
              f"{len(points)} readings", file=sys.stderr)
    return rows


def published_dams() -> dict[str, str]:
    """Inventory id -> roster station for every dam already published.

    Dam identity beats position (ADR-069): Navajo's roster point stands more
    than nine kilometres from the dam the Bureau's catalog places it on.
    """
    from pipeline import roster

    return {str(e["nid_id"]): station
            for station, e in roster.load_capacities().items() if e.get("nid_id")}


def split_published(rows: list[dict], dams: dict[str, str]
                    ) -> tuple[list[dict], list[dict]]:
    """(rows still to decide, rows whose dam is already on the roster)."""
    fresh, held = [], []
    for row in rows:
        station = dams.get(str(row.get("nid_id") or ""))
        if station:
            held.append({"provider": row["provider"], "station": row["station"],
                         "name": row["provider_name"], "published_as": station,
                         "published_by": "dam identity",
                         "nid_id": row["nid_id"]})
        else:
            fresh.append(row)
    return fresh, held


def tracked_points() -> list[tuple[str, str, float, float]]:
    from pipeline import roster

    points = []
    for provider, table in (
            ("rise", roster.RESERVOIRS), ("awdb", roster.AWDB_RESERVOIRS),
            ("cdec", roster.CDEC_RESERVOIRS), ("cdss", roster.CDSS_RESERVOIRS),
            ("usgs", roster.USGS_RESERVOIRS), ("srp", roster.SRP_RESERVOIRS),
            ("dnrc", roster.DNRC_RESERVOIRS), ("cwms", roster.CWMS_RESERVOIRS)):
        for station, row in table.items():
            points.append((str(station), provider, row[1], row[2]))
    return points


def nhd_names(lon: float, lat: float) -> tuple[list[str], str | None]:
    """(GNIS names within 100 m, error). One retry with backoff on failure."""
    import urllib.error
    import urllib.parse
    import urllib.request

    from probe_nhd_waterbody import NHD_FIELDS, NHD_LAYER, USER_AGENT, attr

    body = urllib.parse.urlencode({
        "geometry": f"{lon},{lat}", "geometryType": "esriGeometryPoint",
        "inSR": "4326", "spatialRel": "esriSpatialRelIntersects",
        "distance": 100, "units": "esriSRUnit_Meter", "outFields": NHD_FIELDS,
        "returnGeometry": "false", "resultRecordCount": 10, "f": "json"}).encode()
    error = None
    for attempt in range(2):
        try:
            request = urllib.request.Request(
                f"{NHD_LAYER}/query", data=body, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=45) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if isinstance(payload, dict) and payload.get("error"):
                raise ValueError(payload["error"].get("message", "service error"))
            return [str(attr(f["attributes"], "GNIS_Name") or "")
                    for f in (payload or {}).get("features") or []], None
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            error = f"{type(exc).__name__}: {exc}"
            if attempt == 0:
                time.sleep(5)
    return [], error


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache", type=Path,
                        help="reuse (or create) a JSON file of the fetched "
                             "series, so the screens can be re-run offline")
    args = parser.parse_args()
    today = dt.date.today()

    from audit_candidate_capacity import STATE_NAMES, fetch_dams, find_dam_layer
    from huc import assign_huc, load_units

    if args.cache and args.cache.exists():
        rows = json.loads(args.cache.read_text(encoding="utf-8"))
    else:
        rows = (usgs_candidates(today) + rise_candidates(today)
                + cwms_candidates(today))
        if args.cache:
            args.cache.write_text(json.dumps(rows), encoding="utf-8")
    unlocated = [r for r in rows if r["lat"] is None or r["lon"] is None]
    rows = [r for r in rows if r not in unlocated]

    layer_url, fields, where, expected = find_dam_layer(
        [STATE_NAMES[c] for c in DAM_STATE_CODES])
    if not layer_url:
        print("ERROR: no dam inventory found with a usable schema", file=sys.stderr)
        return 1
    dams = fetch_dams(layer_url, fields, where)
    if expected is not None and len(dams) != expected:
        print(f"ERROR: dam inventory returned {len(dams)} of {expected}", file=sys.stderr)
        return 1
    print(f"{len(dams)} dams fetched", file=sys.stderr)

    units = load_units()
    tracked = tracked_points()
    published, candidates = [], []
    for row in rows:
        point = (row["lon"], row["lat"])
        near = min(((admission.distance_km(point, (lon, lat)), station, provider)
                    for station, provider, lon, lat in tracked),
                   default=(float("inf"), None, None))
        if near[0] <= 3.0:
            published.append({"provider": row["provider"], "station": row["station"],
                              "name": row["provider_name"],
                              "published_as": near[1], "published_by": near[2],
                              "distance_km": round(near[0], 3)})
            continue
        unit = assign_huc(point, units)
        row["in_scope"] = unit is not None
        row["huc6"] = unit["huc6"] if unit else None
        row["huc6_name"] = unit["name"] if unit else None
        if row.get("readings"):
            screen_dams(row, dams)
        else:
            row["rule_admitted"] = False
            row["screens"] = []
        names, nhd_error = nhd_names(*point)
        time.sleep(0.3)
        row.update(propose_name(row["provider_name"], names, nhd_error))
        row["nhd_names"] = sorted({n for n in names if n})
        candidates.append(row)

    matched = [r["nid_id"] for r in candidates if r.get("nid_id")]
    operators = dam_operators(matched) if matched else {}
    for row in candidates:
        record = operators.get(row.get("nid_id")) or {}
        row["operator"] = operator_provider(
            record.get("FED_AGENCY_OPERATIONS"), record.get("FED_AGENCY_OWNERS"))
        row["operator_agency"] = (record.get("FED_AGENCY_OPERATIONS")
                                  or record.get("FED_AGENCY_OWNERS")
                                  or record.get("OWNER_TYPES"))
    candidates, by_dam = split_published(candidates, published_dams())
    published += by_dam
    mark_duplicates([r for r in candidates if r.get("readings")])
    counts: dict[str, int] = {}
    for row in candidates:
        row["suggestion"], row["reason"] = suggest(row)
        counts[row["suggestion"]] = counts.get(row["suggestion"], 0) + 1

    result = {
        "reviewed": today.isoformat(),
        "state": STATE,
        "dam_states": list(DAM_STATE_CODES),
        "counts": {"candidates": len(candidates), **counts,
                   "already_published": len(published)},
        "already_published": published,
        "without_a_point": [{"provider": r["provider"], "station": r["station"],
                             "name": r["provider_name"]} for r in unlocated],
        "candidates": sorted(candidates, key=lambda r: (
            r["suggestion"], r["provider"], r["station"])),
    }
    print(json.dumps(result, indent=1))
    print(f"\n{result['counts']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
