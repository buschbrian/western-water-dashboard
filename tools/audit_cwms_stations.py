#!/usr/bin/env python3
"""Audit the Corps' Columbia Basin storage locations for admission.

The CWMS Data API publishes the Columbia Basin under the Northwestern
Division's Pacific Northwest region (`NWDP`); see the 2026-08-29 follow-up in
`docs/WESTERN-SOURCE-CANDIDATES.md`. This tool gathers what admission needs
for every storage-bearing location under that office and decides each with
the shared machinery in `admission.py`, unmodified:

- the location list, for the point, the state and the kind of place;
- the series catalog, to choose one storage series per location by a
  stated preference rather than by response order;
- the readings since 2015 from the chosen series, in acre-feet;
- the National Inventory of Dams record for each state's dams, so the dam
  can be matched by position first and name second (ADR-015);
- `admit` for the match and denominator, then `discrepancies` for the four
  screens that compare everything else known about the same water.

A location already published within three kilometres is reported and not
audited (ADR-069). A series counts as answering only if its last reading is
inside the last thirty days; the revised (`REV`) versions of several series
stop months before their raw counterparts, and a series that would be
withdrawn on its first morning is not the reading. A location whose only storage series carry a `USBR`
version is Reclamation's number republished, reported under `republished`
and not audited either: the Corps is not its source. A series is confirmed
by a read and never by the catalog, because the catalog advertises extents
that several series do not answer.

A probe: it prints its evidence as JSON and writes nothing.

    .venv/bin/python tools/audit_cwms_stations.py > cwms-audit.json
"""

from __future__ import annotations

import datetime as dt
import json
import math
import sys
import time
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

import admission  # noqa: E402
from audit_candidate_capacity import fetch_dams, find_dam_layer  # noqa: E402
from huc import assign_huc, load_units  # noqa: E402
from pipeline.providers import (  # noqa: E402
    CWMS_CATALOG_URL, CWMS_LOCATIONS_URL, _get_cwms_json, fetch_cwms_series,
)
from pipeline.roster import (  # noqa: E402
    AWDB_RESERVOIRS, CDEC_RESERVOIRS, CDSS_RESERVOIRS, DNRC_RESERVOIRS,
    RESERVOIRS, SRP_RESERVOIRS, USGS_RESERVOIRS,
)

OFFICE = "NWDP"
#: The states the region's storage locations stand in, as the inventory
#: names them. British Columbia locations are outside the product's scope.
DAM_STATES = ["Washington", "Oregon", "Idaho", "Montana", "Wyoming", "Nevada"]
STATE_CODES = {"WA", "OR", "ID", "MT", "WY", "NV"}
START_DATE = "20150101"
ALREADY_KM = 3.0
STORAGE_PARAMETERS = {"Stor": 0, "Stor-Total": 1, "Stor-Lake": 2}


def distance_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    half = (math.sin((lat2 - lat1) / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371.0088 * math.asin(math.sqrt(half))


def roster_points() -> list[tuple[str, str, float, float]]:
    points = []
    for provider, rows in (("rise", RESERVOIRS), ("awdb", AWDB_RESERVOIRS),
                           ("cdec", CDEC_RESERVOIRS), ("cdss", CDSS_RESERVOIRS),
                           ("usgs", USGS_RESERVOIRS), ("srp", SRP_RESERVOIRS),
                           ("dnrc", DNRC_RESERVOIRS)):
        for row in rows.values():
            points.append((row[0], provider, row[1], row[2]))
    return points


def catalog() -> list[dict]:
    entries, params = [], {"office": OFFICE, "like": ".*Stor.*", "page-size": 500}
    while True:
        page = _get_cwms_json(CWMS_CATALOG_URL, params)
        entries.extend(page.get("entries") or [])
        token = page.get("next-page")
        if not token:
            return entries
        params = {**params, "page": token}


def locations() -> dict[str, dict]:
    rows = _get_cwms_json(CWMS_LOCATIONS_URL, {"office": OFFICE})
    return {row["name"]: row for row in rows if isinstance(row, dict) and row.get("name")}


def series_rank(name: str, earliest: str = "") -> tuple | None:
    """Where a series stands in the stated preference, or None if it is not a
    storage reading this provider can be the source of.

    History length comes before version and interval: the seasonal estimator
    and the normals read years, and a `Best` series that began in 2025 is a
    worse reading of the same water than a revised one that began in 1970.
    """
    parts = name.split(".")
    if len(parts) != 6:
        return None
    _location, parameter, _type, interval, _duration, version = parts
    if parameter not in STORAGE_PARAMETERS or "FCST" in version:
        return None
    interval_rank = {"~1Day": 0, "1Day": 0, "1Hour": 1, "15Minutes": 2, "0": 3}.get(interval, 4)
    if version == "Best":
        version_rank = 0
    elif version.endswith("REV"):
        version_rank = 1
    else:
        version_rank = 2
    return (STORAGE_PARAMETERS[parameter], earliest[:4] or "9999",
            version_rank, interval_rank, name)


def main() -> int:
    today = pd.Timestamp.today().normalize()
    entries = catalog()
    places = locations()
    units = load_units()
    points = roster_points()
    print(f"{len(entries)} storage series under {OFFICE}, "
          f"{len(places)} locations", file=sys.stderr)

    by_location: dict[str, list[str]] = {}
    earliest: dict[str, str] = {}
    for entry in entries:
        by_location.setdefault(entry["name"].split(".")[0], []).append(entry["name"])
        earliest[entry["name"]] = ((entry.get("extents") or [{}])[0]
                                   .get("earliest-time") or "")

    already, republished, outside, quiet, no_series, candidates = [], [], [], [], [], []
    for location in sorted(by_location):
        place = places.get(location) or {}
        state = place.get("state-initial")
        if (place.get("location-kind") == "BASIN" or place.get("nation") != "US"
                or state not in STATE_CODES):
            continue
        lat, lon = place.get("latitude"), place.get("longitude")
        if lat is None or lon is None:
            continue
        name = place.get("public-name") or location
        nearest = min(((distance_km((lon, lat), (row[3], row[2])), row[0], row[1])
                       for row in points), default=(math.inf, None, None))
        if nearest[0] <= ALREADY_KM:
            already.append({"station": location, "name": name, "state": state,
                            "published_as": nearest[1], "provider": nearest[2],
                            "distance_km": round(nearest[0], 3)})
            continue
        ranked = sorted(filter(None, (series_rank(series, earliest.get(series, ""))
                                      for series in by_location[location])))
        own = [rank for rank in ranked if "USBR" not in rank[-1]]
        if ranked and not own:
            republished.append({"station": location, "name": name, "state": state,
                                "series": [rank[-1] for rank in ranked]})
            continue
        unit = assign_huc((lon, lat), units)
        if not unit:
            outside.append({"station": location, "name": name, "state": state})
            continue

        chosen, frame = None, None
        probe_start = (today - pd.Timedelta(days=400)).strftime("%Y%m%d")
        end = (today + pd.Timedelta(days=1)).strftime("%Y%m%d")
        for rank in own:
            try:
                recent = fetch_cwms_series(OFFICE, rank[-1], probe_start, end)
            except Exception as exc:  # noqa: BLE001
                print(f"  {location} {rank[-1]}: {type(exc).__name__}: {exc}", file=sys.stderr)
                recent = None
            time.sleep(0.3)
            if recent is None or recent.empty:
                continue
            # Current, not merely recent: a series whose last reading is
            # older than the withdrawal window would leave the map the
            # morning it joined it, and several revised (`REV`) series stop
            # months before their raw counterparts.
            if recent["date"].max() < today - pd.Timedelta(days=30):
                continue
            chosen = rank[-1]
            break
        if not chosen:
            (no_series if not own else quiet).append(
                {"station": location, "name": name, "state": state,
                 "series_tried": [rank[-1] for rank in own]})
            continue
        try:
            frame = fetch_cwms_series(OFFICE, chosen, START_DATE, end)
        except Exception as exc:  # noqa: BLE001
            no_series.append({"station": location, "name": name, "state": state,
                              "series_tried": [chosen], "error": f"{type(exc).__name__}: {exc}"})
            continue
        time.sleep(0.3)
        values = frame["storage_af"].tolist()
        candidates.append({
            "station": location, "office": OFFICE, "timeseries": chosen,
            "name": name, "long_name": place.get("long-name"),
            "state": state, "kind": place.get("location-kind"),
            "location_type": place.get("location-type"),
            "lat": lat, "lon": lon,
            "huc6": unit["huc6"], "huc6_name": unit["name"],
            "readings_since_2015": len(values),
            "first_reading": frame["date"].min().strftime("%Y-%m-%d"),
            "last_reading": frame["date"].max().strftime("%Y-%m-%d"),
            "observed_max_af": max(values),
            "highest_readings": sorted(values, reverse=True)[:3],
            "latest_af": values[-1],
            "nearest_published": {"name": nearest[1], "provider": nearest[2],
                                  "distance_km": round(nearest[0], 1)},
        })
        print(f"  {location:6} {name[:34]:<36} {chosen:48} {len(values)} readings, "
              f"max {max(values):,.0f}", file=sys.stderr)

    layer_url, fields, where, _expected = find_dam_layer(DAM_STATES)
    if not layer_url:
        print("ERROR: no dam inventory found with a usable schema", file=sys.stderr)
        return 1
    dams = fetch_dams(layer_url, fields, where)
    print(f"{len(dams)} dams fetched across {', '.join(DAM_STATES)}", file=sys.stderr)

    held = 0
    for candidate in candidates:
        decision = admission.admit(candidate, dams)
        # ADR-072 chooses among the inventory's own figures, and this
        # provider publishes no full level of its own, so the choice is
        # always the inventory's to make. The California audit already asks
        # this question the same way; asking `admit` alone would divide a
        # gross pool reading by a conservation pool underneath it and hold
        # the reservoir for a disagreement the accepted rule settles.
        if decision.match is not None:
            capacity, basis = admission.denominator_for(
                decision.match.dam, candidate.get("observed_max_af"))
            decision = admission.Decision(
                decision.name, decision.admitted, decision.reason,
                decision.match, capacity, basis)
        screens = admission.discrepancies(
            decision, highest_readings=candidate["highest_readings"])
        candidate.update(decision.evidence())
        candidate["screens"] = [{"screen": name, "detail": detail}
                                for name, detail in screens]
        candidate["publishable"] = bool(decision.admitted and not screens)
        if not candidate["publishable"]:
            held += 1
        flag = "clear" if candidate["publishable"] else "HELD"
        print(f"  {candidate['station']:6} {candidate['name'][:32]:<34} {flag}: "
              f"{decision.reason} {'; '.join(name for name, _ in screens)}",
              file=sys.stderr)

    print(json.dumps({
        "reviewed": dt.date.today().isoformat(),
        "office": OFFICE,
        "candidates": candidates,
        "already_tracked": already,
        "republished": republished,
        "quiet_for_over_a_year": quiet,
        "no_readable_series": no_series,
        "outside_the_drawn_areas": outside,
    }, indent=1))
    print(f"\n{len(candidates) - held} clear, {held} held for review; "
          f"{len(already)} already published, {len(republished)} republished, "
          f"{len(quiet)} quiet, {len(no_series)} unreadable, {len(outside)} outside",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
