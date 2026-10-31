"""Probe: USGS reservoir-storage sites in the western states.

`WATER-BODY-AND-NAVIGATION-SCOPING.md` item 5's first rule is "count first,
build never": query USGS parameter 00054 (reservoir storage, acre-feet) state
by state and report how many sites exist -- because nobody can size a USGS
provider until that number does. The first count, 2026-08-21, covered AZ,
NV, ID, OR, WA and WY; the default is now all eleven western states.

Two things are reported, because the scoping asks for both:

- **Sites.** Distinct sites answering the daily-values service with at least
  one 00054 value in the last seven days -- active means *reporting*, not
  merely registered. This extends, rather than restates, the coverage table
  in WESTERN-SOURCE-CANDIDATES.md, whose counts were taken 2026-08-18 from
  registrations reconciled by hand.

- **Overlap candidates.** Each site is compared against every published
  reservoir point and reviewed dam point. A site within three kilometres of
  a published point -- ADR-069's working radius -- or sharing a distinctive
  name word within fifty, is listed as a *candidate* duplicate. Candidates
  are listed, never decided: ruling one a duplicate is a review judgement
  about dam identity, and this tool records evidence, not verdicts.

Sites already reviewed and held in `admitted_usgs_reservoirs.json` are named
as held rather than counted again as new.

A probe prints and writes nothing.

    python tools/probe_nwis_storage.py [--days 7] [--states AZ NV ...]

Reads the agency's OGC `v1` collections: `latest-daily` for each series'
newest value, then `monitoring-locations` for the sites' names -- two
requests a state, inside the anonymous rate limit. `USGS_API_KEY` is sent in
the `X-Api-Key` header when the environment holds it, and is never needed.
The legacy waterservices.usgs.gov service this first read shuts down on
2027-02-22.
"""

import argparse
import datetime as dt
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

STATE_NAMES = {
    "AZ": "Arizona", "CA": "California", "CO": "Colorado", "ID": "Idaho",
    "MT": "Montana", "NM": "New Mexico", "NV": "Nevada", "OR": "Oregon",
    "UT": "Utah", "WA": "Washington", "WY": "Wyoming",
}
STATES = list(STATE_NAMES)
OGC_URL = "https://api.waterdata.usgs.gov/ogcapi/v1/collections"
LATEST_URL = f"{OGC_URL}/latest-daily/items"
LOCATIONS_URL = f"{OGC_URL}/monitoring-locations/items"

USER_AGENT = ("western-water-dashboard/nwis-storage-count "
              "(+https://github.com/buschbrian)")
TIMEOUT = 120
POLITENESS_SECONDS = 1.0

#: A site this close to a published point is a duplicate candidate under
#: ADR-069's working radius, not automatically a duplicate.
NEAR_KM = 3.0
NAME_KM = 50.0

#: Name words too common in gauge names to imply the same reservoir.
STOP_WORDS = {
    "res", "reservoir", "lake", "lk", "nr", "near", "at", "abv", "blw",
    "dam", "div", "outlet", "inlet", "creek", "river", "wash",
}


def km_between(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    dx = math.radians(lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2))
    dy = math.radians(lat2 - lat1)
    return math.hypot(dx, dy) * 6371.0


def name_words(name: str) -> set[str]:
    keepers = {w.strip(".,").lower() for w in name.split()} - STOP_WORDS
    return {w for w in keepers if len(w) > 2}


def _get_features(url: str, params: dict | None,
                  user_agent: str = USER_AGENT) -> list[dict]:
    """Every feature of one OGC query, following its `next` links."""
    headers = {"User-Agent": user_agent}
    api_key = os.environ.get("USGS_API_KEY", "").strip()
    if api_key:
        headers["X-Api-Key"] = api_key
    features: list[dict] = []
    next_url: str | None = (
        f"{url}?{urllib.parse.urlencode(params)}" if params else url)
    while next_url:
        request = urllib.request.Request(next_url, headers=headers)
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            payload = json.loads(response.read())
        time.sleep(POLITENESS_SECONDS)
        features.extend(payload.get("features") or [])
        next_url = next((link.get("href") for link in payload.get("links") or []
                         if link.get("rel") == "next" and link.get("href")),
                        None)
    return features


def reporting_sites(state: str, days: int,
                    user_agent: str = USER_AGENT) -> dict[str, dict]:
    """Sites in a state whose newest 00054 daily value is inside `days`.

    One site can carry several 00054 series, one per statistic; it reports
    when any of them does. Active means reporting, as in the first count.
    """
    since = dt.date.today() - dt.timedelta(days=days)
    latest = _get_features(LATEST_URL, {
        "f": "json", "parameter_code": "00054",
        "state_name": STATE_NAMES[state], "limit": 10000}, user_agent)
    coords: dict[str, tuple[float, float]] = {}
    for feature in latest:
        reading = feature.get("properties") or {}
        location = reading.get("monitoring_location_id") or ""
        try:
            day = dt.date.fromisoformat(str(reading.get("time"))[:10])
        except ValueError:
            continue
        point = (feature.get("geometry") or {}).get("coordinates") or []
        if location.startswith("USGS-") and day >= since and len(point) >= 2:
            coords[location] = (point[0], point[1])
    if not coords:
        return {}
    locations = _get_features(LOCATIONS_URL, {
        "f": "json", "id": ",".join(sorted(coords)), "limit": 10000,
        "properties": "monitoring_location_name"}, user_agent)
    names = {f.get("id"): (f.get("properties") or {}).get(
        "monitoring_location_name") for f in locations}
    return {location.removeprefix("USGS-"): {
                "name": names.get(location), "lon": lon, "lat": lat}
            for location, (lon, lat) in coords.items()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=7,
                        help="a site must have reported within this window")
    parser.add_argument("--states", nargs="+", default=STATES,
                        choices=STATES, metavar="ST",
                        help="two-letter state codes (default: all eleven)")
    args = parser.parse_args()
    held = json.loads((ROOT / "admitted_usgs_reservoirs.json").read_text(
        encoding="utf-8")).get("withheld", {})

    published = json.loads(
        (ROOT / "reservoirs.json").read_text(encoding="utf-8"))["reservoirs"]
    points = [(r["name"], r["lon"], r["lat"]) for r in published
              if r.get("source_station_id")]
    capacities = json.loads(
        (ROOT / "capacities.json").read_text(encoding="utf-8"))
    dam_points = [
        (entry["name"], entry["dam_lon"], entry["dam_lat"])
        for entry in capacities.get("capacities", {}).values()
        if entry.get("dam_lon") is not None]
    print(f"{len(points)} published points, "
          f"{len(dam_points)} reviewed dam points", file=sys.stderr)

    total_sites = 0
    held_sites: list[str] = []
    near_candidates: list[tuple[str, str]] = []
    name_candidates: list[tuple[str, str]] = []
    new_sites: list[str] = []
    for state in args.states:
        try:
            sites = reporting_sites(state, args.days)
        except urllib.error.HTTPError as error:
            print(f"  !! HTTP {error.code} for {state}", file=sys.stderr)
            continue
        except (urllib.error.URLError, ValueError) as error:
            print(f"  !! {state}: {error}", file=sys.stderr)
            continue
        print(f"  {state}: {len(sites)} reporting 00054 sites "
              f"(last {args.days} days)")
        total_sites += len(sites)

        for site_no, site in sorted(sites.items()):
            if site_no in held:
                print(f"      held: {site['name']} ({site_no}), "
                      "already reviewed in admitted_usgs_reservoirs.json")
                held_sites.append(site_no)
                continue
            best_km, best_name = float("inf"), ""
            best_words: set[str] = set()
            for pub_name, pub_lon, pub_lat in points + dam_points:
                dist = km_between(site["lon"], site["lat"], pub_lon, pub_lat)
                if dist < best_km:
                    best_km, best_name = dist, pub_name
                    best_words = name_words(site["name"] or "") & \
                        name_words(pub_name)
            label = f"{site['name']} ({site_no})"
            if best_km <= NEAR_KM:
                print(f"      NEAR-DUPLICATE candidate: {label} <-> "
                      f"{best_name} [{best_km:.1f} km]")
                near_candidates.append((label,
                                        f"{best_name} [{best_km:.1f} km]"))
            elif best_words and best_km <= NAME_KM:
                print(f"      name candidate: {label} <-> {best_name} "
                      f"[{best_km:.1f} km, shared {'/'.join(sorted(best_words))}]")
                name_candidates.append((label, best_name))
            else:
                print(f"      new: {label}, nearest published point "
                      f"{best_name} [{best_km:.0f} km]")
                new_sites.append(label)

    print(f"\nTotal across {', '.join(args.states)}: {total_sites} sites "
          f"reporting 00054 within {args.days} days.")
    print(f"Already reviewed and held: {len(held_sites)}")
    print(f"Near-duplicate candidates for review: {len(near_candidates)}")
    print(f"Name-only candidates for review: {len(name_candidates)}")
    print(f"Near no published point: {len(new_sites)}")
    print("\nThe count that sizes the provider is the sites above minus the"
          "\ncandidates a reviewer rules duplicates -- not this list alone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
