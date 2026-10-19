"""Measure a decade of weekly drought from the monitor's archived maps.

Every week in the drought archives is measured from the Drought Monitor's own
full-resolution map of that week (`drought_archive.py`), by the engine in
`compute_drought_coverage.py` -- the same functions, grid step, land mask,
boundaries and method version the weekly run uses (ADR-122). This tool
measures the weeks before the weekly run, back to `HISTORY_WEEKS_KEPT`.

    python tools/backfill_drought_history.py --verify-overlap
    python tools/backfill_drought_history.py --cache /tmp/usdm-archive
    python tools/backfill_drought_history.py --rebuild --workers 6

Three modes:

- **`--verify-overlap`** recomputes every week the archives already hold and
  compares each published share, exactly. It writes nothing. It is the check
  that a week this tool would add is the same measurement as the weeks
  already there.
- **the default** fills the weeks an archive lacks, and runs that check
  first: one share that differs at the published precision stops the run
  before anything is written.
- **`--rebuild`** measures every week of the decade again and replaces each
  archive as one series. It is what a method version change needs, because
  an archive never holds two versions; release dates already known are kept.

WHY THE WEEKLY RUN MOVED TO THE ARCHIVE. The overlap check was first run on
2026-10-18 against weeks the weekly run had measured from the feature
layer's simplified polygons (`drought-coverage-2`). It failed: 47 of 5,955
published shares over 2026-08-11 to 2026-10-13 came out one tenth apart,
none by more, and HUC-2 matched every week. The live polygons reproduced the
published figures exactly; the archive's full-resolution map -- 173,630 edges
against 74,614 for 2026-10-13 -- moved unrounded shares by at most 0.038
points, every flip on a rounding boundary. So the weekly run now measures the
archive's map too (`drought-coverage-3`), and the whole decade was rebuilt
with this tool's `--rebuild` as one series.

A week the archive cannot supply, or supplies in a shape that fails the
checks in `drought_archive.py`, is skipped and named in the archive's
`backfill` block with the reason. It is never interpolated, borrowed from a
neighbour or repaired.

Downloads are fetched one at a time whatever `--workers` is; only measuring
runs in parallel. A measured week is kept in the cache with a fingerprint of
everything it depends on, so an interrupted run resumes where it stopped.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import hashlib
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))
import watershed_scopes  # noqa: E402
from compute_drought_coverage import (  # noqa: E402
    DEFAULT_STEP,
    HISTORY_NOTE,
    HISTORY_WEEKS_KEPT,
    LAND_PATH,
    LEVELS,
    METHOD_VERSION,
    build_payload,
    history_entry,
    history_path,
    method_block,
    write_atomic,
)
from drought_archive import (  # noqa: E402
    ARCHIVE_SOURCE,
    DEFAULT_CACHE,
    ArchiveWeekError,
    archive_bytes,
    archive_drought,
    parse_archive,
)
from fetch_drought_monitor import ATTRIBUTION  # noqa: E402

#: What the `backfill` block says about the weeks in it.
BACKFILL_NOTE = (
    "Every week is measured from the monitor's archived map of that week. "
    "Weeks measured after the fact carry no release date because the archive "
    "states none. A skipped week is one the archive could not supply; it is "
    "left as a gap."
)


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
    back from the cache instead. The overlap check never reuses: it measures
    every week it compares.
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
    """Download in date order, newest first, measuring in parallel.

    Downloads stay in this process and stay sequential, whatever `workers`
    is, so the archive sees one request at a time; only the measuring --
    which is all CPU -- fans out, and it starts on each week as soon as that
    week is on disk. Newest first, so an interrupted run has measured the
    weeks nearest the ones already published.
    """
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


def verify_overlap(cache: Path, workers: int, report=print,
                   weeks: int | None = None) -> bool:
    """Recompute archived weeks from the monitor's archive and compare.

    Every week the archives hold, or the newest `weeks` of them. True only
    when every share of every week compared, at every level, matches.
    """
    histories = {level: json.loads(history_path(level).read_text(encoding="utf-8"))
                 for level in archived_levels()}
    chosen = {level: history["weeks"][-weeks:] if weeks else history["weeks"]
              for level, history in histories.items()}
    jobs = [(week["map_date"], level, cache, False)
            for level, held in chosen.items() for week in held]
    committed = {(week["map_date"], level): week
                 for level, held in chosen.items() for week in held}
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


def skipped_block(skipped: dict[str, str], first: str) -> dict:
    return {
        "source": ARCHIVE_SOURCE,
        "note": BACKFILL_NOTE,
        "skipped": [{"map_date": map_date, "reason": skipped[map_date]}
                    for map_date in sorted(skipped) if map_date >= first],
    }


def add_archive_weeks(history: dict, entries: dict[str, dict],
                      skipped: dict[str, str], keep: int = HISTORY_WEEKS_KEPT) -> dict:
    """The archive with the backfilled weeks added beside the weekly ones.

    A week already held is kept as it is, so a backfill can never overwrite a
    published figure. The `backfill` block names every week the archive could
    not supply; `merge_history` carries it forward and trims it with the
    weeks.
    """
    if (history.get("method") or {}).get("version") != METHOD_VERSION:
        raise ValueError(
            f"the archive was built by {history.get('method', {}).get('version')} "
            f"and this engine is {METHOD_VERSION}; rebuild it with --rebuild")
    held = {week["map_date"] for week in history["weeks"]}
    weeks = list(history["weeks"]) + [
        entry for map_date, entry in entries.items() if map_date not in held]
    weeks.sort(key=lambda week: week["map_date"])
    del weeks[:-keep]
    missing = {item["map_date"]: item["reason"]
               for item in (history.get("backfill") or {}).get("skipped", [])}
    missing.update(skipped)
    for week in weeks:
        missing.pop(week["map_date"], None)
    result = {key: value for key, value in history.items() if key != "weeks"}
    result.update({
        "first_map_date": weeks[0]["map_date"],
        "last_map_date": weeks[-1]["map_date"],
        "week_count": len(weeks),
        "backfill": skipped_block(missing, weeks[0]["map_date"]),
        "weeks": weeks,
    })
    return result


def rebuild_history(previous: dict, entries: dict[str, dict],
                    skipped: dict[str, str]) -> dict:
    """One archive, every week measured again at this engine's method.

    The weeks are exactly the ones measured now: nothing from the previous
    file's measurements survives, so the file cannot hold two method
    versions. What does survive is each week's release date, which is a
    fact about the monitor rather than a measurement, and the unit count.
    """
    known = {week["map_date"]: week.get("release_date")
             for week in previous.get("weeks", [])}
    weeks = [{**entries[map_date], "release_date": known.get(map_date)}
             for map_date in sorted(entries)]
    if not weeks:
        raise ValueError("no week could be measured; the archive is left as it was")
    return {
        "schema_version": 1,
        "source": ARCHIVE_SOURCE,
        "attribution": ATTRIBUTION,
        "level": previous["level"],
        "method": {**method_block(DEFAULT_STEP), "history": HISTORY_NOTE},
        "weeks_kept": HISTORY_WEEKS_KEPT,
        "first_map_date": weeks[0]["map_date"],
        "last_map_date": weeks[-1]["map_date"],
        "week_count": len(weeks),
        "unit_count": previous["unit_count"],
        "backfill": skipped_block(skipped, weeks[0]["map_date"]),
        "weeks": weeks,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE,
                        help="where downloaded archive files are kept; never "
                             "inside the repository")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--verify-overlap", action="store_true",
                      help="compare the held weeks with the archive and write nothing")
    mode.add_argument("--rebuild", action="store_true",
                      help="measure every week again and replace each archive")
    parser.add_argument("--weeks", type=int, default=HISTORY_WEEKS_KEPT,
                        help="how many weeks each archive should reach back, "
                             "or with --verify-overlap how many of the newest "
                             "to compare")
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

    if args.verify_overlap:
        return 0 if verify_overlap(cache, args.workers, weeks=args.weeks) else 1
    if not args.rebuild and not verify_overlap(cache, args.workers):
        return 1

    histories = {level: json.loads(history_path(level).read_text(encoding="utf-8"))
                 for level in archived_levels()}
    jobs = []
    for level, history in histories.items():
        held = set() if args.rebuild else {week["map_date"] for week in history["weeks"]}
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
        result = (rebuild_history(history, entries[level], skipped[level])
                  if args.rebuild
                  else add_archive_weeks(history, entries[level], skipped[level]))
        changed = write_atomic(path, result)
        print(f"HUC-{level}: {result['week_count']} weeks measured "
              f"({result['first_map_date']} to {result['last_map_date']}), "
              f"{len(result['backfill']['skipped'])} skipped; "
              f"{path.relative_to(ROOT)} {'written' if changed else 'unchanged'}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
