"""The U.S. Drought Monitor's weekly archive maps: what the drought shares are
measured from (ADR-122).

The National Drought Mitigation Center keeps every weekly map it has
published as full-resolution polygons, one file per map date:

    https://droughtmonitor.unl.edu/data/json/usdm_YYYYMMDD.json

Both the weekly run (`compute_drought_coverage.py`) and the decade backfill
(`backfill_drought_history.py`) read the map through this module and nothing
else, so every week in an archive is measured from the same kind of geometry.
The simplified feature-layer download (`fetch_drought_monitor.py`) is what the
map draws and says which week is current; it is never measured. A week whose
archive file is missing or fails the checks below is not measured at all.

The file for a week is posted on the Thursday of its release, at about
10:15 UTC -- before the daily refresh runs at 12:00 UTC -- and it carries no
map or release date of its own: the date is in its name.

The downloads are untrusted. They are parsed as JSON and nothing else, cached
gzip-compressed outside the repository, fetched one at a time with a pause
after each, and retried with backoff.
"""

from __future__ import annotations

import gzip
import json
import math
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from fetch_drought_monitor import ATTRIBUTION

ARCHIVE_URL = "https://droughtmonitor.unl.edu/data/json/usdm_{stamp}.json"
#: What an archive of many weeks names as its source.
ARCHIVE_SOURCE = ARCHIVE_URL.format(stamp="YYYYMMDD")
USER_AGENT = ("western-water-dashboard/drought-archive "
              "(+https://github.com/buschbrian)")
TIMEOUT = 120
#: Seconds after each download, and the first retry's wait; each later retry
#: waits three times as long. The archive is a public service this project
#: does not pay for.
PAUSE = 1.0
RETRY_WAIT = 5.0
ATTEMPTS = 4
DEFAULT_CACHE = Path(tempfile.gettempdir()) / "usdm-archive"


class ArchiveWeekError(ValueError):
    """A week the archive cannot supply in a shape the engine can measure."""


def archive_url(map_date: str) -> str:
    return ARCHIVE_URL.format(stamp=map_date.replace("-", ""))


def cached_path(map_date: str, cache: Path) -> Path:
    # Compressed: a decade of weekly maps is several gigabytes as text.
    return cache / f"usdm_{map_date.replace('-', '')}.json.gz"


def archive_bytes(map_date: str, cache: Path) -> bytes:
    """One week's archive file, from the cache or the network, as bytes.

    Raises `ArchiveWeekError` for a week the archive does not hold (HTTP 404)
    -- which is also what a week not posted yet looks like. A network failure
    after every retry is a `RuntimeError`: that is the service's trouble, not
    the week's.
    """
    path = cached_path(map_date, cache)
    if path.exists():
        return gzip.decompress(path.read_bytes())
    body = None
    failure: Exception | None = None
    for attempt in range(ATTEMPTS):
        request = urllib.request.Request(
            archive_url(map_date),
            headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                body = response.read()
            break
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise ArchiveWeekError("the archive holds no map for this date") from exc
            failure = exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            failure = exc
        time.sleep(RETRY_WAIT * 3 ** attempt)
    if body is None:
        raise RuntimeError(f"archive request for {map_date} failed: {failure}")
    cache.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("wb", dir=cache, delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(gzip.compress(body, mtime=0))
    temporary.replace(path)
    time.sleep(PAUSE)
    return body


def parse_archive(body: bytes):
    """JSON and nothing else: the download is untrusted."""
    try:
        return json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise ArchiveWeekError(f"the archive file is not JSON: {exc}") from exc


def check_ring(ring) -> None:
    if not isinstance(ring, list) or len(ring) < 4:
        raise ArchiveWeekError("a ring has fewer than four positions")
    for position in ring:
        if (not isinstance(position, list) or len(position) < 2
                or not all(isinstance(value, (int, float))
                           and not isinstance(value, bool)
                           and math.isfinite(value) for value in position[:2])):
            raise ArchiveWeekError("a ring holds a position that is not two finite numbers")
        if not (-180 <= position[0] <= 180 and -90 <= position[1] <= 90):
            raise ArchiveWeekError("a ring holds a position outside longitude and latitude")
    # The engine reads consecutive positions as edges and never closes a ring
    # itself, so an open ring would leave a gap in the even-odd count.
    if ring[0][:2] != ring[-1][:2]:
        raise ArchiveWeekError("a ring is not closed")


def archive_drought(raw, map_date: str, release_date: str | None = None) -> dict:
    """An archive file as the drought collection `build_payload` reads.

    Checks what the engine relies on: one feature per intensity, each an
    integer from 0 to 4, each a polygon of closed rings of finite
    coordinates. A file that fails is a skipped week, never a repaired one.

    The archive states no release date. The weekly run knows it from the
    feature layer and passes it in; a backfilled week has none, and none is
    inferred, because the monitor's holiday weeks move it.
    """
    if not isinstance(raw, dict) or raw.get("type") != "FeatureCollection":
        raise ArchiveWeekError("the archive file is not a feature collection")
    features = raw.get("features")
    if not isinstance(features, list) or not features:
        raise ArchiveWeekError("the archive file carries no features")
    seen = set()
    kept = []
    for feature in features:
        properties = (feature or {}).get("properties")
        geometry = (feature or {}).get("geometry")
        if not isinstance(properties, dict) or not isinstance(geometry, dict):
            raise ArchiveWeekError("a feature has no properties or no geometry")
        level = properties.get("DM")
        if isinstance(level, bool) or not isinstance(level, int) or level not in range(5):
            raise ArchiveWeekError(f"invalid drought intensity {level!r}")
        if level in seen:
            raise ArchiveWeekError(f"two features for intensity D{level}")
        seen.add(level)
        kind = geometry.get("type")
        coordinates = geometry.get("coordinates")
        if kind not in {"Polygon", "MultiPolygon"} or not isinstance(coordinates, list):
            raise ArchiveWeekError(f"D{level} is not a polygon")
        polygons = [coordinates] if kind == "Polygon" else coordinates
        if not polygons:
            raise ArchiveWeekError(f"D{level} has no polygons")
        for polygon in polygons:
            if not isinstance(polygon, list) or not polygon:
                raise ArchiveWeekError(f"D{level} has an empty polygon")
            for ring in polygon:
                check_ring(ring)
        kept.append({"type": "Feature", "properties": {"DM": level},
                     "geometry": geometry})
    kept.sort(key=lambda feature: feature["properties"]["DM"])
    return {
        "map_date": map_date,
        "release_date": release_date,
        "source": archive_url(map_date),
        "attribution": ATTRIBUTION,
        "features": kept,
    }


def load_archive_week(map_date: str, cache: Path,
                      release_date: str | None = None) -> dict:
    """One week's map from the archive, fetched if needed and checked."""
    return archive_drought(parse_archive(archive_bytes(map_date, cache)),
                           map_date, release_date)
