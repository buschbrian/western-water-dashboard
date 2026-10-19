"""Backfill the drought archive from the monitor's own weekly maps.

The National Drought Mitigation Center keeps every weekly map it has
published as polygons, one file per map date:

    https://droughtmonitor.unl.edu/data/json/usdm_YYYYMMDD.json

This tool measures those polygons with the engine in
`compute_drought_coverage.py` -- the same functions, the same grid step, the
same land mask, the same boundaries and the same method version -- and adds
the weeks the archive files do not already hold, back to `HISTORY_WEEKS_KEPT`.

    python tools/backfill_drought_history.py --verify-overlap
    python tools/backfill_drought_history.py --cache /tmp/usdm-archive
    python tools/backfill_drought_history.py --weeks 52 --workers 4

THE GATE COMES FIRST. A backfilled week is only the same measurement as a
weekly one if the archive's polygons, measured here, give the figures the
weekly run published from the live feature layer. So every run first
recomputes every week the archive files already hold from the archive and
compares each published share. One share that differs at the published
precision stops the run before anything is written. `--verify-overlap` runs
the gate alone and writes nothing.

THE GATE HAS NOT PASSED. Run on 2026-10-18 over every archived week
(2026-08-11 to 2026-10-13, three levels), 47 of 5,955 published shares came
out one tenth apart; none by more. HUC-2 matched in every week. The cause is
the input geometry, not the engine: recomputed from the committed live
polygons, the 2026-10-13 week reproduces all 375 HUC-6 shares exactly, while
the archive's map of the same week -- full resolution, 173,630 edges against
the live download's 74,614 at a 0.001-degree tolerance -- moves unrounded
shares by at most 0.038 points (median 0.000, 95th percentile 0.004). Every
share that flipped sat within a few thousandths of a rounding boundary,
69.2502 against 69.2499 for instance. That is the geometry term the engine's
own docstring says no measurement bounds, measured here for the first time.
So no week has been backfilled: by the rule above, the archive measured this
way is not yet the same measurement as the weekly run.

A week the archive cannot supply, or supplies in a shape that fails the
checks below, is skipped and named in the archive's `backfill` block with the
reason. It is never interpolated, borrowed from a neighbour or repaired.

The downloads are untrusted. They are parsed as JSON and nothing else, cached
outside the repository, fetched one at a time with a pause between requests,
and retried with backoff; a cached file is used again rather than fetched
again.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import gzip
import hashlib
import json
import math
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))
import watershed_scopes  # noqa: E402
from compute_drought_coverage import (  # noqa: E402
    DEFAULT_STEP,
    HISTORY_WEEKS_KEPT,
    LAND_PATH,
    LEVELS,
    METHOD_VERSION,
    build_payload,
    history_entry,
    history_path,
    write_atomic,
)
from fetch_drought_monitor import ATTRIBUTION  # noqa: E402

ARCHIVE_URL = "https://droughtmonitor.unl.edu/data/json/usdm_{stamp}.json"
USER_AGENT = ("western-water-dashboard/drought-backfill "
              "(+https://github.com/buschbrian)")
TIMEOUT = 120
#: Seconds between two downloads, and the first retry's wait; each later
#: retry waits three times as long. The archive is a public service this
#: project does not pay for.
PAUSE = 1.0
RETRY_WAIT = 5.0
ATTEMPTS = 4
DEFAULT_CACHE = Path(tempfile.gettempdir()) / "usdm-archive"


class ArchiveWeekError(ValueError):
    """A week the archive cannot supply in a shape this engine can measure."""


def archived_levels() -> list[int]:
    """The levels that keep an archive, which are the levels to backfill.

    Read from the files rather than written down, so HUC-8 -- published
    without an archive (ADR-088) -- is not given one as a side effect.
    """
    return [level for level in sorted(watershed_scopes.DROUGHT_DRAWN_SCOPES)
            if history_path(level).exists()]


def map_dates(last: str, count: int) -> list[str]:
    """`count` weekly map dates ending at `last`, oldest first.

    The monitor's maps are dated on Tuesdays, seven days apart, so the
    schedule is arithmetic; whether a map exists for each date is the
    archive's to answer.
    """
    end = dt.date.fromisoformat(last)
    return [(end - dt.timedelta(weeks=back)).isoformat()
            for back in range(count - 1, -1, -1)]


def archive_url(map_date: str) -> str:
    return ARCHIVE_URL.format(stamp=map_date.replace("-", ""))


def cached_path(map_date: str, cache: Path) -> Path:
    # Compressed: a decade of weekly maps is several gigabytes as text.
    return cache / f"usdm_{map_date.replace('-', '')}.json.gz"


def archive_bytes(map_date: str, cache: Path) -> bytes:
    """One week's archive file, from the cache or the network, as bytes.

    Raises `ArchiveWeekError` for a week the archive does not hold (HTTP 404).
    A network failure after every retry is a `RuntimeError`: that is the
    service's trouble, not the week's, and it stops the run rather than being
    recorded as a missing map.
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


def archive_drought(raw, map_date: str) -> dict:
    """An archive file as the drought collection `build_payload` reads.

    Checks what the engine relies on and the live download checks too: one
    feature per intensity, each an integer from 0 to 4, each a polygon of
    closed rings of finite coordinates. A file that fails is a skipped week,
    never a repaired one.
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
        # The archive files carry no release date, and the monitor's holiday
        # weeks move it, so none is written rather than one inferred.
        "release_date": None,
        "source": archive_url(map_date),
        "attribution": ATTRIBUTION,
        "features": kept,
    }


_INPUTS: dict[int, tuple[dict, dict]] = {}


def level_inputs(level: int) -> tuple[dict, dict]:
    """The boundaries and land mask the weekly run measures this level with."""
    if level not in _INPUTS:
        scope = watershed_scopes.get_scope(watershed_scopes.DROUGHT_DRAWN_SCOPES[level])
        boundaries = json.loads((ROOT / scope.output).read_text(encoding="utf-8"))
        land = json.loads(LAND_PATH.read_text(encoding="utf-8"))
        _INPUTS[level] = (boundaries, land)
    return _INPUTS[level]


def fingerprint(body: bytes, level: int) -> str:
    """Everything a measured week depends on, so a kept result can be trusted.

    The method version and step, and the bytes of the archive file, the
    boundaries and the mask. A result whose inputs changed is measured again.
    """
    scope = watershed_scopes.get_scope(watershed_scopes.DROUGHT_DRAWN_SCOPES[level])
    digest = hashlib.sha256(f"{METHOD_VERSION}|{DEFAULT_STEP}|".encode())
    for part in (body, (ROOT / scope.output).read_bytes(), LAND_PATH.read_bytes()):
        digest.update(hashlib.sha256(part).digest())
    return digest.hexdigest()


def measure(job: tuple[str, int, Path, bool]) -> tuple[str, int, dict | None, str | None]:
    """One week at one level, as the history entry the weekly run would write.

    Runs in a worker process, so it reads its own copy of the archive file.
    With `reuse`, a result measured earlier from identical inputs is read
    back from the cache instead, which is what lets an interrupted backfill
    resume. The gate never reuses: it measures every week it compares.
    """
    map_date, level, cache, reuse = job
    try:
        body = archive_bytes(map_date, cache)
    except ArchiveWeekError as exc:
        return map_date, level, None, str(exc)
    kept = cache / "measured" / f"huc{level}" / f"{map_date}.json"
    stamp = fingerprint(body, level)
    if reuse and kept.exists():
        held = json.loads(kept.read_text(encoding="utf-8"))
        if held.get("fingerprint") == stamp:
            return map_date, level, held["entry"], held["problem"]
    try:
        drought = archive_drought(parse_archive(body), map_date)
        boundaries, land = level_inputs(level)
        payload = build_payload(drought, boundaries, DEFAULT_STEP, land)
        if payload["level"] != level:
            raise ValueError(f"HUC-{level} boundaries measured as HUC-{payload['level']}")
        entry, problem = history_entry(payload), None
    except ArchiveWeekError as exc:
        entry, problem = None, str(exc)
    kept.parent.mkdir(parents=True, exist_ok=True)
    kept.write_text(json.dumps({"fingerprint": stamp, "entry": entry,
                                "problem": problem}), encoding="utf-8")
    return map_date, level, entry, problem


def run_jobs(jobs: list[tuple[str, int, Path, bool]], workers: int):
    """Download in date order, newest first, measuring in parallel, yielding each result.

    Downloads stay in this process and stay sequential, whatever `workers`
    is, so the archive sees one request at a time; only the measuring --
    which is all CPU -- fans out, and it starts on each week as soon as that
    week is on disk.
    """
    # Newest first, so an interrupted run has measured the weeks nearest the
    # ones already published.
    dates = sorted({job[0] for job in jobs}, reverse=True)
    with concurrent.futures.ProcessPoolExecutor(max_workers=workers) as pool:
        pending = set()
        for map_date in dates:
            try:
                archive_bytes(map_date, jobs[0][2])
            except ArchiveWeekError:
                pass  # measure() reports it, once per level
            pending.update(pool.submit(measure, job)
                           for job in jobs if job[0] == map_date)
            done = {future for future in pending if future.done()}
            pending -= done
            for future in done:
                yield future.result()
        for future in concurrent.futures.as_completed(pending):
            yield future.result()


def shares(entry: dict, field: str) -> dict[str, dict[str, float]]:
    return {unit[field]: unit["percent_of_area_at_least"] for unit in entry["units"]}


def compare_week(committed: dict, recomputed: dict, field: str) -> list[str]:
    """Every published share that differs between two readings of one week.

    Exact comparison of the published values, which are already rounded to a
    tenth: the question is whether a reader would see a different number, and
    any tolerance would be a second answer to it.
    """
    before = shares(committed, field)
    after = shares(recomputed, field)
    differences = []
    for code in sorted(set(before) | set(after)):
        if code not in before or code not in after:
            differences.append(f"{code}: published in only one reading")
            continue
        for key in LEVELS:
            if before[code][key] != after[code][key]:
                differences.append(
                    f"{code} {key}: published {before[code][key]}, "
                    f"archive {after[code][key]} "
                    f"({after[code][key] - before[code][key]:+.1f})")
    return differences


def verify_overlap(cache: Path, workers: int, report=print) -> bool:
    """Recompute every archived week from the monitor's archive and compare.

    True only when every share of every week at every level matches.
    """
    histories = {level: json.loads(history_path(level).read_text(encoding="utf-8"))
                 for level in archived_levels()}
    jobs = [(week["map_date"], level, cache, False)
            for level, history in histories.items() for week in history["weeks"]]
    committed = {(week["map_date"], level): week
                 for level, history in histories.items() for week in history["weeks"]}
    failures = 0
    compared = 0
    rows = []
    for map_date, level, entry, problem in run_jobs(jobs, workers):
        field = f"huc{level}"
        week = committed[(map_date, level)]
        if problem is not None:
            failures += 1
            rows.append((map_date, level, f"FAILED: {problem}"))
            continue
        differences = compare_week(week, entry, field)
        count = 5 * len(week["units"])
        compared += count
        if differences:
            failures += 1
            rows.append((map_date, level,
                         f"{len(differences)} of {count} shares differ: "
                         + "; ".join(differences)))
        else:
            rows.append((map_date, level, f"{count} of {count} shares match"))
    for map_date, level, line in sorted(rows):
        report(f"{map_date} HUC-{level}: {line}")
    if failures:
        report(f"GATE FAILED: {failures} of {len(rows)} weeks differ from the "
               "published figures; nothing written.")
        return False
    report(f"GATE PASSED: {len(rows)} weeks at {len(histories)} levels, "
           f"{compared} published shares, every one identical "
           f"({METHOD_VERSION}, step {DEFAULT_STEP}).")
    return True


def add_archive_weeks(history: dict, entries: dict[str, dict],
                      skipped: dict[str, str], keep: int = HISTORY_WEEKS_KEPT) -> dict:
    """The archive with the backfilled weeks added beside the weekly ones.

    A week the weekly run already computed is kept as it is, so a backfill
    can never overwrite a published figure. The `backfill` block names where
    the added weeks came from and every week the archive could not supply;
    `merge_history` carries it forward and trims it with the weeks.
    """
    if (history.get("method") or {}).get("version") != METHOD_VERSION:
        raise ValueError(
            f"the archive was built by {history.get('method', {}).get('version')} "
            f"and this engine is {METHOD_VERSION}")
    held = {week["map_date"] for week in history["weeks"]}
    weeks = list(history["weeks"]) + [
        entry for map_date, entry in entries.items() if map_date not in held]
    weeks.sort(key=lambda week: week["map_date"])
    del weeks[:-keep]
    first = weeks[0]["map_date"]
    added = sorted(week["map_date"] for week in weeks if week["map_date"] not in held)
    previous = history.get("backfill") or {}
    missing = {item["map_date"]: item["reason"]
               for item in previous.get("skipped", [])}
    missing.update(skipped)
    for map_date in held | set(added):
        missing.pop(map_date, None)
    result = {key: value for key, value in history.items() if key != "weeks"}
    result.update({
        "first_map_date": first,
        "last_map_date": weeks[-1]["map_date"],
        "week_count": len(weeks),
        "backfill": {
            "source": ARCHIVE_URL.format(stamp="YYYYMMDD"),
            "note": ("Weeks before the weekly run began are measured from the "
                     "monitor's archived maps by the same engine, and carry no "
                     "release date because the archive states none."),
            "skipped":[{"map_date": map_date, "reason": missing[map_date]}
                        for map_date in sorted(missing) if map_date >= first],
        },
        "weeks": weeks,
    })
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE,
                        help="where downloaded archive files are kept; never "
                             "inside the repository")
    parser.add_argument("--verify-overlap", action="store_true",
                        help="run the equivalence gate only and write nothing")
    parser.add_argument("--weeks", type=int, default=HISTORY_WEEKS_KEPT,
                        help="how many weeks each archive should reach back")
    parser.add_argument("--workers", type=int, default=2,
                        help="processes measuring in parallel; downloads stay "
                             "one at a time")
    args = parser.parse_args()
    cache = args.cache.resolve()
    if cache == ROOT or ROOT in cache.parents:
        print("ERROR: the archive cache must be outside the repository", file=sys.stderr)
        return 1
    if not 1 <= args.weeks <= HISTORY_WEEKS_KEPT:
        print(f"ERROR: --weeks must be 1 to {HISTORY_WEEKS_KEPT}", file=sys.stderr)
        return 1

    if not verify_overlap(cache, args.workers):
        return 1
    if args.verify_overlap:
        return 0

    histories = {level: json.loads(history_path(level).read_text(encoding="utf-8"))
                 for level in archived_levels()}
    jobs = []
    for level, history in histories.items():
        held = {week["map_date"] for week in history["weeks"]}
        jobs.extend((map_date, level, cache, True)
                    for map_date in map_dates(history["last_map_date"], args.weeks)
                    if map_date not in held)
    entries = {level: {} for level in histories}
    skipped = {level: {} for level in histories}
    started = time.monotonic()
    # Every level of one week is measured from one download, the way the
    # weekly run measures every level from one download.
    for done, (map_date, level, entry, problem) in enumerate(
            run_jobs(jobs, args.workers), start=1):
        if problem is None:
            entries[level][map_date] = entry
        else:
            skipped[level][map_date] = problem
            print(f"HUC-{level} {map_date}: skipped, {problem}", flush=True)
        if done % 30 == 0 or done == len(jobs):
            print(f"{done} of {len(jobs)} weeks measured in "
                  f"{(time.monotonic() - started) / 60:.1f} min", flush=True)
    for level, history in histories.items():
        path = history_path(level)
        result = add_archive_weeks(history, entries[level], skipped[level])
        changed = write_atomic(path, result)
        print(f"HUC-{level}: {result['week_count']} weeks "
              f"({result['first_map_date']} to {result['last_map_date']}), "
              f"{len(result['backfill']['skipped'])} skipped; "
              f"{path.relative_to(ROOT)} {'written' if changed else 'unchanged'}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
