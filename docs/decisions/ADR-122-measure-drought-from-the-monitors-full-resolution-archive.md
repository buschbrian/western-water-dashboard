# ADR-122: Measure drought from the monitor's full-resolution archive, back ten years

- Status: Accepted
- Date: 2026-10-18
- Relates to: ADR-055 (area model), ADR-059 (measured land), ADR-074 (one
  archive per level), ADR-082 (the severity index), ADR-123 (the charts that
  read the decade)

## Context

The drought archives (`usdm-huc{2,4,6}-history.json`) began with the weekly
run on 2026-08-11 and held nine or ten weeks. The Drought Monitor publishes
every weekly map since 2000 as polygons,
`droughtmonitor.unl.edu/data/json/usdm_YYYYMMDD.json`, and a decade of them
was the obvious way to give the drought page a history.

The engine had refused that in a comment beside `HISTORY_WEEKS_KEPT`: every
figure in the file was one this pipeline computed from polygons it verified,
and values recomputed later from a different archive would be two
measurements wearing one name. That objection was testable, so it was tested
before anything was written.

**The test.** `tools/backfill_drought_history.py --verify-overlap` measured
the archive's map of every week the files already held, 2026-08-11 to
2026-10-13 at all three levels, with the unchanged engine -- same functions,
0.002-degree step, land mask, boundaries and `drought-coverage-2` -- and
compared every published share exactly. It failed:

| level | shares compared | differ | largest difference |
|---|---:|---:|---:|
| HUC-2 | 225 | 0 | -- |
| HUC-4 | 1,980 | 13 | 0.1 |
| HUC-6 | 3,750 | 34 | 0.1 |
| **all** | **5,955** | **47 (0.79%)** | **0.1** |

18 of 28 level-weeks had at least one difference. 170702 `d1` moved in every
week (89.8 published, 89.9 from the archive); 1508 `d2` in six (37.3 against
37.4). The full output is the appendix below.

**The cause is the input geometry, not the engine.** For 2026-10-13 at
HUC-6, recomputing from the committed feature-layer download reproduces all
375 published shares exactly. The archive's map of the same week is the same
map at full resolution -- 173,630 polygon edges against the download's 74,614,
which `fetch_drought_monitor.py` asks the service to simplify to 0.001
degrees and five decimals. Across the 375 shares the two moved the unrounded
figures by at most **0.038 points** (median 0.000, 95th percentile 0.004).
Every one of the six shares that changed its published tenth that week sat on
a rounding boundary: 69.2502 against 69.2499, 81.0500 against 81.0503.

That is the term the engine's docstring had named and said nothing bounded:
the error budget compared the engine with itself over the same simplified
polygons, and could not see the polygons. The comment was right. Mixing the
two would have been two measurements, and the difference is just large enough
to show at the published precision.

## Decision

**Every week is measured from the monitor's full-resolution archive map: the
decade behind the weekly run, the weeks already published, and every week
from now on.** `METHOD_VERSION` becomes `drought-coverage-3`. The grid step,
the land mask, the cosine weighting, the exclusive class rule and the
denominators are unchanged; only the geometry the classes are read from moves
(`method.geometry` names it).

- **The weekly run measures the archive.** `compute_drought_coverage.py` reads
  which week is current, and its release date, from the feature-layer
  download, then fetches that week's archive file through
  `tools/drought_archive.py` and measures it. The download's polygons are
  never measured. They stay what the map draws: a 1.6 MB simplified file is
  the right thing for the browser, and the 18-28 MB archive file is not.
- **No fallback.** The archive posts each week's file on the Thursday of its
  release at about 10:15 UTC (seen on the `Last-Modified` of five consecutive
  weeks), before the 12:00 UTC refresh. If the file is not there, the run
  writes nothing and exits 2, and `scripts/refresh-daily.sh` puts the whole
  drought set back -- downloads, weekly files and archives -- so the page
  stays on last week and says how old it is. Measuring the simplified polygons
  instead would put two kinds of geometry in one series, which is exactly what
  the test above showed.
- **One series per file.** The three archives were rebuilt whole with
  `backfill_drought_history.py --rebuild`: every week from 2016-11-01 to
  2026-10-13 measured again, 1,554 measurements over 520 weekly dates, so no
  file holds two method versions. `merge_history` already refuses a payload at
  a different version. Release dates already known from the weekly run are
  kept; earlier weeks have `release_date: null`, because the archive states
  none and the monitor's holiday weeks move it, so none is inferred.
- **A week the archive cannot supply is a named gap.** Each archive file is
  checked before it is measured -- one feature per class, classes 0 to 4,
  closed rings of finite coordinates -- and a week that fails, or is absent,
  is listed in the archive's `backfill.skipped` with the reason. It is never
  interpolated, borrowed or repaired. Two weeks are skipped at every level,
  2026-02-17 and 2026-02-24: the archive answers 404 for their JSON files. (It
  does hold shapefiles for both; reading those would be a second format with
  its own equivalence question, so they are left as gaps.)
- **The overlap check stays.** `--verify-overlap` is how a future backfill
  proves its weeks are the same measurement as the weeks already held; under
  v3 it passes: run over the newest ten weeks at all three levels after the
  rebuild, 6,200 published shares, every one identical.
- **Determinism.** Two runs of the engine over the same archive file write
  byte-identical output (checked at HUC-2 and HUC-6 for 2026-10-13, SHA-256
  `6040853b...` and `8c64a01f...`).
- **A speed-up that changes nothing.** Full-resolution maps carry about twice
  the edges, and a decade is about 1,500 measurements, so the row loop now
  tests each band of 64 grid rows against only the edges that can reach it
  (`BAND_ROWS`, `reaching`). The result is bit-for-bit the unbanded loop's:
  recomputing all four levels from the committed download gave files identical
  to the committed ones, and a test holds exact float equality against the
  unbanded loop.

## What moved

Re-measuring the published weeks under v3 moves exactly the 47 shares in the
table above, each by one tenth and none by more. Nothing else in the files
changes except `method.version`, `method.geometry`, the archives'
`method.history` note, each `source` (the week's archive file in a weekly
file, the file pattern in an archive), the `backfill` block and the
backfilled weeks themselves.

## Alternatives rejected

**Backfill anyway, at v2.** Two geometries in one series under one version
name; the test exists to refuse it.

**Simplify the archive the way the feature service does, then measure.** The
service's generalization is its own implementation, at a tolerance this
project chose for a web map. Reproducing it exactly is not guaranteed, and if
it differed by one vertex the series would be two measurements again, now
with no name for the difference. Measuring the fuller geometry removes the
question rather than imitating an answer.

**Fall back to the download when the archive is late.** Same objection, one
week at a time. A late week is honest; a mixed week is not.

**Commit the archive file each week.** 18-28 MB a week of geometry nobody
fetches. The run downloads it to a cache outside the repository instead.

## Consequences

- Each morning's run downloads one archive file (18-28 MB at recent drought
  extent) and measures four levels from it. Measured on 2026-10-19 with the
  file cached, the four levels took 123 seconds in sequence (HUC-6 28, HUC-4
  23, HUC-2 13, HUC-8 59), against the 80 seconds the engine's docstring
  records for HUC-6 alone on the simplified polygons before the banded loop.
- The archives hold a decade. 518 weeks each, 2016-11-01 to 2026-10-13: 19.2
  KB gzipped for regions, 83.6 KB for subregions and 123.0 KB for basins (260
  KB, 2.1 MB and 3.6 MB raw; `docs/data-transfer.md`). They are fetched by the
  drought page only when its ten-year cards come near the screen (ADR-123), so
  the page's first load is unchanged.
- `data/assistant/drought.json` carries the newest 26 weeks of each archive
  rather than all of them, to stay inside its 600 KB budget
  (`DROUGHT_HISTORY_WEEKS`).
- The land mask is still fetched at about 100 m. Nothing here bounds that
  term, so a finer grid step still buys nothing until it is measured.

## Supersedes

Nothing. The comment it answers was never a record.

## Appendix: the overlap check, 2026-10-18

`python tools/backfill_drought_history.py --verify-overlap --workers 4`, run
against the `drought-coverage-2` archives as they were committed at `ed71e7b`:

```
2026-08-11 HUC-6: 1 of 375 shares differ: 170702 d1: published 89.8, archive 89.9 (+0.1)
2026-08-18 HUC-2: 25 of 25 shares match
2026-08-18 HUC-4: 2 of 220 shares differ: 1508 d2: published 37.3, archive 37.4 (+0.1); 1601 d2: published 55.8, archive 55.7 (-0.1)
2026-08-18 HUC-6: 2 of 375 shares differ: 160101 d2: published 26.9, archive 26.8 (-0.1); 170702 d1: published 89.8, archive 89.9 (+0.1)
2026-08-25 HUC-2: 25 of 25 shares match
2026-08-25 HUC-4: 1 of 220 shares differ: 1508 d2: published 37.3, archive 37.4 (+0.1)
2026-08-25 HUC-6: 3 of 375 shares differ: 170702 d1: published 89.8, archive 89.9 (+0.1); 180101 d0: published 71.4, archive 71.5 (+0.1); 181002 d0: published 62.5, archive 62.4 (-0.1)
2026-09-01 HUC-2: 25 of 25 shares match
2026-09-01 HUC-4: 1 of 220 shares differ: 1508 d2: published 37.3, archive 37.4 (+0.1)
2026-09-01 HUC-6: 3 of 375 shares differ: 170702 d1: published 89.8, archive 89.9 (+0.1); 180101 d0: published 71.4, archive 71.5 (+0.1); 181002 d0: published 62.5, archive 62.4 (-0.1)
2026-09-08 HUC-2: 25 of 25 shares match
2026-09-08 HUC-4: 1 of 220 shares differ: 1508 d2: published 37.3, archive 37.4 (+0.1)
2026-09-08 HUC-6: 4 of 375 shares differ: 160101 d2: published 24.8, archive 24.7 (-0.1); 170702 d1: published 89.8, archive 89.9 (+0.1); 180101 d0: published 71.4, archive 71.5 (+0.1); 181002 d0: published 62.5, archive 62.4 (-0.1)
2026-09-15 HUC-2: 25 of 25 shares match
2026-09-15 HUC-4: 3 of 220 shares differ: 1508 d2: published 37.3, archive 37.4 (+0.1); 1707 d3: published 42.2, archive 42.1 (-0.1); 1710 d1: published 62.9, archive 63.0 (+0.1)
2026-09-15 HUC-6: 4 of 375 shares differ: 160101 d2: published 24.8, archive 24.7 (-0.1); 170702 d1: published 89.8, archive 89.9 (+0.1); 180101 d0: published 71.4, archive 71.5 (+0.1); 181002 d0: published 62.5, archive 62.4 (-0.1)
2026-09-22 HUC-2: 25 of 25 shares match
2026-09-22 HUC-4: 1 of 220 shares differ: 1707 d3: published 42.2, archive 42.1 (-0.1)
2026-09-22 HUC-6: 3 of 375 shares differ: 160101 d2: published 24.8, archive 24.7 (-0.1); 170702 d1: published 89.8, archive 89.9 (+0.1); 180101 d0: published 71.4, archive 71.5 (+0.1)
2026-09-29 HUC-2: 25 of 25 shares match
2026-09-29 HUC-4: 220 of 220 shares match
2026-09-29 HUC-6: 2 of 375 shares differ: 150801 d1: published 78.6, archive 78.7 (+0.1); 170702 d1: published 89.8, archive 89.9 (+0.1)
2026-10-06 HUC-2: 25 of 25 shares match
2026-10-06 HUC-4: 2 of 220 shares differ: 1405 d2: published 71.3, archive 71.4 (+0.1); 1504 d1: published 57.3, archive 57.2 (-0.1)
2026-10-06 HUC-6: 6 of 375 shares differ: 140500 d2: published 71.3, archive 71.4 (+0.1); 150400 d1: published 57.3, archive 57.2 (-0.1); 150601 d1: published 11.2, archive 11.3 (+0.1); 150801 d1: published 78.6, archive 78.7 (+0.1); 170702 d1: published 89.8, archive 89.9 (+0.1); 180800 d1: published 69.3, archive 69.2 (-0.1)
2026-10-13 HUC-2: 25 of 25 shares match
2026-10-13 HUC-4: 2 of 220 shares differ: 1405 d2: published 71.3, archive 71.4 (+0.1); 1504 d1: published 57.3, archive 57.2 (-0.1)
2026-10-13 HUC-6: 6 of 375 shares differ: 140100 d3: published 81.0, archive 81.1 (+0.1); 140500 d2: published 71.3, archive 71.4 (+0.1); 150400 d1: published 57.3, archive 57.2 (-0.1); 150801 d1: published 78.6, archive 78.7 (+0.1); 170702 d1: published 89.8, archive 89.9 (+0.1); 180800 d1: published 69.3, archive 69.2 (-0.1)
GATE FAILED: 18 of 28 weeks differ from the published figures; nothing written.
```
