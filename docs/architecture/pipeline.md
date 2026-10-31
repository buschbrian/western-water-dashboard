# Pipeline architecture

The Python side: two daily refreshes, a weekly drought computation, and a set
of on-demand builders and audits. Scoped agent rules are in
[`.claude/rules/python-pipeline.md`](../../.claude/rules/python-pipeline.md)
and [`tools/AGENTS.md`](../../tools/AGENTS.md).

## Modules

`refresh_reservoirs.py` is the **orchestrator**. Read it first: it is the
sequence, not the arithmetic. The specialised concerns live behind named
modules in `pipeline/`:

| Module | Owns |
|---|---|
| `pipeline/constants.py` | Paths, thresholds, schema and method versions, source-coverage review. |
| `pipeline/roster.py` | The committed rosters, capacity evidence and the full-level precedence rule. |
| `pipeline/providers.py` | One adapter per provider: Reclamation, the Conservation Service, the Geological Survey, California, Colorado, Salt River Project, Montana DNRC, the Army Corps of Engineers and the Central Arizona Project (Lake Pleasant, one current record a day; ADR-104). The Geological Survey adapter uses its modern OGC daily collection and a pipeline-only key; the Corps adapter reads the CWMS Data API under the Northwestern Division's Pacific Northwest region office (ADR-102). |
| `pipeline/seasonal.py` | The seasonal estimator: window, annual votes, normals, rank, percentile. |
| `pipeline/freshness.py` | Carry-forward, the withdrawal threshold and the withdrawal notice. |
| `pipeline/geography.py` | County and drainage-area assignment onto finished records. |
| `pipeline/lakes.py` | The natural terminal lakes (ADR-112, ADR-118): a record of elevation and volume with no full level, its validator, and the lake payload envelope. |
| `pipeline/measurement.py` | One daily series summarised: current value, dated extremes, dated changes and the same-date rank. Shared by a lake's level and volume and a reservoir's surface level, so a level means one thing. |
| `pipeline/elevation.py` | Reviewed reservoir surface elevation (ADR-135): the record's `elevation` block, the history entries, `elevation_history.json` and their checks. |
| `pipeline/rivers.py` | Daily river flow (ADR-136): a gauge's 30-day record with no normal, rank or total, its validator, and the river payload envelope. |
| `refresh_reservoirs.py` | Fetch, summarize, assemble, validate, write, and report to CI. |

`refresh_reservoirs` re-exports every public name from those modules, so
`import refresh_reservoirs as R` still reaches all of them and no tool or test
had to learn a new import path.

Other entry points: `refresh_snowpack.py` (snow payload),
`refresh_station_readings.py` (precipitation at the snow stations, ADR-125),
`refresh_soil_moisture.py` (the week's soil-moisture change at the same stations, ADR-142), `refresh_lakes.py`
(the terminal-lake payload, `lakes.json`), `refresh_rivers.py` (daily river
flow, `rivers.json`), `watershed_scopes.py`
and `huc.py` (named scopes, drainage assignment, grouping), `admission.py`
(candidate screening), `tools/` (audits, boundary fetches, drought
computation, normals).

## Recent-conditions pilot boundary

ADR-124 permits a bounded Utah pilot alongside the existing published domains.
Its chosen delivery model is scheduled Python ingestion and static, versioned
outputs, with R2 available for rasters and archives. It is not connected to the
daily job or any public page yet. The scope, remaining work and credential
setup are in [the pilot plan](../RECENT-CONDITIONS-PILOT.md).

`tools/import_gauge_rulings.py` previews saved private review exports offline
and writes the worksheet only with `--apply` (ADR-130). It changes only
`reviewer_ruling` and `notes`, keyed by site number. Any existing review needs
an explicit per-site replacement to change; invalid or unsaved records refuse
the whole batch. The screen builder still preserves manual review fields.
This workflow does not create an admitted roster or a published flow payload.

The supported CI runtime is Python 3.14. The pipeline dependency set requires
Python 3.12 or newer; all data workflows install the shared
`requirements-pipeline.txt`. GIS audit tools use `requirements-gis.txt`
separately and do not add ArcGIS for Python to the daily job.

## Runtime data contract

For an approved point correction, `refresh_reservoirs.py --rebuild-points
STATION_ID` takes selected coordinates from the reviewed roster and rebuilds
geography through `pipeline.geography.rebuild_published_points` (ADR-108).
It uses committed county and outlet assignments, so county changes must be
reviewed and rebuilt first. It preserves the storage observations and refresh
timestamp, and refuses IDs that are unknown or absent from the current payload.

Committed dam-point rejections in `pipeline.roster` apply to the capacity
builder, its legacy point-repair tool and the runtime loader (ADR-109). They
remove coordinate fields while retaining capacity evidence. The upstream
builder records an explicitly rejected outlet as `unreviewed_outlet`; it does
not infer the whole reservoir basin from a snap inside the lake.

A full level that changed is committed as `capacity_versions` on the
reservoir's capacity evidence, oldest first (ADR-111). Each version runs from
its own `effective_from` until the next one begins, so an observation falls in
exactly one; `effective_to` repeats a boundary the successor already sets. The
earliest version either opens the record with a null start or names the date it
really began, which may be years before the first reading — Tinemaha has been
restricted since 1993 and reports from 2015. A reviewed date is not discarded
to fit a rule, so `check_capacity_versions_cover` proves the other half at
refresh time, where the readings are known: a series that begins before the
earliest full level takes effect fails the run rather than being divided by the
nearest figure to hand. That is also what catches evidence which was complete
when reviewed and stopped covering the record after a backfill. A lone version
must carry a start date, or it is the headline figure written twice. `pipeline.roster.effective_capacity` picks the version
in force on the reading date, which is what the record's flat `capacity_af`,
`capacity_basis` and `pct_of_capacity` publish, and
`published_capacity_history` emits the array as `capacity_history` beside
`physical_capacity_af` — only for a reservoir whose level changed, because a
history repeating one figure is `capacity_af` written twice. The
`operating_restriction` basis is the one that cannot stand alone: a limit
applies from a date, names the authority that set it and where that was read,
and never replaces the physical capacity beside it.

**Data is fetched at runtime, never imported** (ADR-002). `reservoirs.json` is
rewritten every morning and that commit *is* the deploy. The build copies it;
nothing imports it. *Enforced:* `src/deploy.test.ts` and a `dist/assets` grep
in the Pages workflow.

**Measure payload cost gzipped, never raw** (ADR-051, ADR-052). GitHub Pages
compresses the JSON, so a raw byte count overstates what a reader pays several
times over — `snowpack.json` is 3,607 KB on disk and 322 KB on the wire. The
size guards measure the same way: the reference export's budget, in
`tests/test_refresh.py` and `src/data/boundaries.test.ts` alike, is 64 KB
gzipped, and was a raw byte count until R3 — which would have failed on 142
reservoirs of reviewed capacity while the figure a reader pays was still
inside it. A budget in the wrong unit fails on the wrong thing.

Runtime fetches use `cache: "no-cache"`, which is not "do not cache": it means
never use a stored copy without asking, so the morning's rewrite can never be
served stale and an unchanged file costs a 304 instead of the whole payload.

**The snow series publishes the water-year calendar once** and each site
indexes into it; `validateSnowpackPayload` rebuilds the rows so nothing
downstream knows. Never encode a missing day as a null value — a null reading
is a row that exists, and thousands of absent days are not. The grid is 637
sites by 323 published dates, and 1,477 of those cells had no reading on
2026-08-20. The count moves every morning, which is the point: it is never
zero.

**A finished snow season is kept as published** (ADR-121). When a run's water
year is later than the payload it replaces, `archive_finished_season` copies
the old file's bytes to `data/snow/snowpack-wy<YEAR>.json` first. The archive
is write-once, owned in `data/generated-files.json` as one directory entry,
and fetched by the page only on request.

`docs/data-transfer.md` holds the measurements and is the file to update when
they change.

**A terminal lake is published from its own roster to its own payload**
(ADR-118). `admitted_terminal_lakes.json` is loaded by
`pipeline.roster.load_admitted_terminal_lakes`, which refuses any
capacity-shaped field and requires the evidence ADR-112 asks for: a reviewed
waterbody point, a reviewed closed-basin assignment, the elevation's vertical
datum and the volume's published elevation-volume relation. `refresh_lakes.py`
reads both daily series from the Geological Survey's OGC collection through
`fetch_usgs_parameter_series` — the storage fetcher is the same function with
parameter 00054 filled in — and writes `lakes.json` under `LAKE_SCHEMA_VERSION`.
Each record carries an `elevation` block and a `volume` block, each with its
current value, dated record extremes, dated changes and the same-date seasonal
rank from the unchanged reservoir estimator; volume also carries a percentage
change and the twelve-month history, elevation no percentage of anything. The
record's `as_of` is the earlier of the two series' last dates. Freshness is
ADR-056's: carried forward marked late, then withdrawn to a notice with no
measurement. `pipeline.lakes.validate_payload` refuses a lake record carrying a
reservoir-only field, a notice carrying a measurement, and a roster lake absent
from both lists. The file is generated and committed by the refresh; no page
fetches it yet, and it is not copied into the build until the lake surface
lands.

**A reservoir level is published only above a reviewed datum** (ADR-135).
`admitted_reservoir_elevations.json` is loaded on first use by
`pipeline.roster.admitted_reservoir_elevations`, which refuses an entry with
no datum, a project datum with no name or no sourced relation to a national
datum, evidence with no checked date, an offset with no measurement date, a
record start (the end of first filling) with no quoted source, or a reference
level with no authority or source. The summary's record starts at
`record_starts`; the history file keeps every day. After the storage fetch,
`refresh_elevations` reads each rostered reservoir's elevation item through
`fetch_rise_series(..., column="elevation_ft")` -- the storage fetcher with
the value column named -- from the provider's first reading, and attaches an
optional `elevation` block in the lake level's shape. `RESERVOIR_SCHEMA_VERSION`
stays 1: the block is optional and additive, as every field added to the
payload has been. The daily series is written compact to
`elevation_history.json` under `ELEVATION_HISTORY_SCHEMA_VERSION`, never into
`reservoirs.json`. A failed level fetch keeps yesterday's block and history
entry and never withholds the storage. `elevation.validate_records` refuses a
block on a reservoir the roster does not name, a block with no datum and a
block carrying a percentage, and names any rostered reservoir still without
one. The history is written whenever the Reclamation source is refreshed
(a full run or `--source rise`); a run of another source carries the blocks
inside the records it keeps and leaves the history file alone.

**River flow is published from its own roster to its own payload**
(ADR-136). `admitted_river_gauges.json` is loaded by
`pipeline.roster.load_admitted_river_gauges`, which requires a plain display
name beside the survey's station name, the reviewed primary `time_series_id`,
a tier with its basis and who directed it, and evidence for any water named
downstream; it accepts only the `shaped` tier. `refresh_rivers.py` confirms
each series against the v1 `time-series-metadata` collection and reads the
last `RIVER_FETCH_DAYS` (90) days from the v1 `daily` collection through
`fetch_usgs_flow_series`, which keeps approval status and qualifiers and
refuses the whole series on an identity, unit, date or value fault. Unlike
the storage adapter it sends the key only when one is configured.
`pipeline.rivers.summarize_gauge` keeps the 30 days ending on the newest day
with a value; every run re-reads the whole window, so revisions land without
a merge. Freshness is ADR-056's, with the notice keyed by station (ADR-126).
`pipeline.rivers.validate_payload` refuses a normal, rank, capacity, inflow or
total on a record or the envelope, `compared_with_normal` other than false, a
window that is not 30 consecutive days ending on the current value, a notice
carrying a measurement, and a roster gauge in neither list.

## Freshness: late and withdrawn are different faults

**`carry_forward`** keeps publishing a quiet feed's last value, because a point
vanishing with no explanation is worse. True for days, false for months.

Past `WITHDRAW_AFTER_DAYS` (60) a record is **withdrawn** from the payload
entirely (ADR-056), because `statewideRollup` sums `current_storage_af` with no
freshness filter — so a spring figure is not merely shown out of season, it is
added into a total presented as now. A withdrawal is always stated
(`withdrawn`, `withdrawn_count`, `withdraw_after_days`) and **must never carry
a measurement**: the validator rejects a notice holding `current_storage_af`.

A notice is keyed by its station (`source_station_id`, ADR-126), not its name:
the roster holds two "Lost Creek" and two "Clear Lake", so `carry_withdrawals`
matches `answered` and `roster` as sets of station ids. A station id is not a
measurement. A notice from a payload written before ADR-126 has none and is
matched by name for that notice only, never dropped. The field is optional, so
`schema_version` does not move.

Nothing is deleted. The roster is committed and the judgement is remade every
run, so a reservoir returns on its own the morning its source resumes.
**A drainage area may therefore be empty**; `storageAgainstDrought` omits it
rather than drawing it at zero. Tests about *where* a reservoir is must read
the roster, never `reservoirs.json`, or a quiet feed silently retires an
assertion.

**Being listed is not reporting, and neither is having reported.** The audit's
dormant check asks whether a station has ever answered; the candidate screen
asks whether it has answered **within the year**. This is deliberately not
`WITHDRAW_AFTER_DAYS`: 60 days is about a published reservoir going quiet, a
year is about never admitting one that already has.


**A reviewed hold is a third fault** (ADR-113, ADR-115). The feed is healthy
and a person has taken the reservoir off the roster because no figure it can
be divided by survives review. The admission file states it in
`publication_holds` -- name, reason, HTTPS source and review date, and the
loader refuses a fifth field or a hold naming a station still published -- and
`reviewed_hold_notices` publishes them as `reviewed_holds`, beside the
withdrawals and never among them. `--rebuild-notices` rewrites that array
without touching a reading, and refuses to run while a held reservoir is still
in the payload. Nothing here reverses on its own: a hold ends with a roster
edit, not with a morning's data.

**A confirmed provider anomaly is a fourth fault, and it is one reading rather
than a reservoir** (ADR-116). `excluded_readings` in the admission file names
the sensor, the provider's own stamp, the raw value, the reason, an HTTPS
source for the independent figure, the review date and the open issue;
`load_excluded_readings` refuses an unknown station, a missing or extra field,
a foreign sensor, a non-HTTPS URL, a malformed date -- and a replacement value,
the way a withdrawal notice refuses a measurement. `fetch_cdec_series` applies
them where readings are read and names each dropped reading on the console, and
`tools/audit_cdec_stations.py` screens the same filtered series so its verdict
is the pipeline's. Matching is on station, sensor, day **and** raw value, so a
corrected reading is a different reading and returns on its own.

## Drought coverage

Coverage is computed per level into `data/drought/usdm-huc{level}.json` from
the monitor's full-resolution archive map of the week the committed download
names, the committed scope boundaries and the committed land mask. The
download's simplified polygons are drawn by the map and never measured; a week
whose archive map is not posted is not measured at all (ADR-122). It is
deterministic and carries no timestamps, so an unchanged week writes an
unchanged file.

**The archives hold a decade at one method version.** Each level's
`usdm-huc{level}-history.json` keeps 520 weeks, every one measured from its
archive map. `tools/backfill_drought_history.py --rebuild` measures them all
again when `METHOD_VERSION` moves; `--verify-overlap` recomputes held weeks
and compares exactly, and the default fill mode refuses to add a week until
that passes. A week the archive could not supply is named in `backfill.skipped`
and left as a gap.

**Every coverage file must describe one week.** `tools/check_drought_pair.py`
globs them all, because a reader who changes the level fetches a different
file. **The archive is one level** — `merge_history` refuses a payload at
another rather than joining two series on one set of codes.

**A week-over-week change needs two files and uses one.** The current coverage
file carries the week before it, about a kilobyte, and that is all a change
needs. Never fetch `usdm-huc6-history.json` to compute one subtraction.
`previous` is always strictly older than `map_date`; the validator refuses a
file comparing a week with itself.

**Not measured is not no drought** (ADR-059). Cells outside
`data/us-land.geojson` are dropped before any class is counted. Class shares
divide by the **measured** land; `measured.percent_of_area` divides by the
whole area and lives in its own block so nothing can sum the two (ADR-046). An
area with no measured land publishes no share at all, not zeros. **A missing
mask stops the run** — without one the engine reports every border basin's far
half as drought-free and looks like a clean run.

## Versioning

**A method version is not a schema version.** A field can keep its name, type
and units while the estimator under it changes, and `schema_version` cannot see
that. `METHOD_VERSION` can. See
[`hydrology-methods.md`](hydrology-methods.md#method-version) for the three
places that refuse to mix, and the one exception.

## Long-lived reference data

**Long-lived reference data carries the date it was checked.**
`tools/check_reference_freshness.py` reads each committed reference file's own
date field against a review interval and reports what is due. It is a tool and
**must never become a test**: a test that fails when a date passes turns the
build red on a morning when no code changed, and a red build freezes the
published numbers. What *is* tested is that every file carries a date and a
policy at all. The generators stamp `retrieved` themselves.

## CI signals

`emit_ci_signals` writes the counts and tables the refresh workflow turns into
self-healing issues — late feeds, withdrawn feeds. The issue bodies are built
by `tools/feed_issue_report.py`, which is deterministic and tested; the
workflow only calls `gh`. See
[`docs/operations/data-refresh.md`](../operations/data-refresh.md).
