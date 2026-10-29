# ADR-136: Publish daily flow at four rivers toward Lake Powell

- Status: Accepted
- Date: 2026-10-27
- Extends: ADR-124 (the bounded recent-conditions pilot), ADR-056 (late and
  withdrawn), ADR-126 (a notice keyed by its station)
- Relates to: ADR-130 (saved gauge reviews), ADR-137 (the tier rule for a
  gauge with a published reservoir in its basin), ADR-098 (the pipeline key),
  ADR-119 (a reading page reached from methods and data)

## Context

ADR-124 allows a small reviewed set of Utah river gauges, served as static
JSON on a daily schedule. `gauge-review.csv` holds the evidence for 164 Utah
gauges and a suggested tier for each; `reviewer_ruling` is still blank for
every row, and a Provo three-gauge preview exists only outside the
repository. The pilot plan named the overlap, failure and freshness policy as
a method decision that must come before a daily job.

On 2026-10-27 Brian directed the first published set: the four rivers that
flow toward Lake Powell, named in the recent-conditions plan, to "start to add
what we have already" rather than wait for every ruling. The same day he
ruled that a gauge with a published reservoir inside its basin is `shaped`
whatever else is true, and that a gauge with inventoried storage under 10% of
a year's flow and no published reservoir is `natural`. That rule is being
written into the worksheet builder on another branch as ADR-137.

| Gauge | Survey station name | Published reservoirs in the traced basin | Inventoried storage as a share of a year's flow |
|---|---|---|---|
| 09379500 San Juan River near Bluff | SAN JUAN RIVER NEAR BLUFF, UT | 9, Navajo the largest | 231.4% |
| 09180500 Colorado River near Cisco | COLORADO RIVER NEAR CISCO, UT | 28, Blue Mesa the largest | 90.7% |
| 09315000 Green River at Green River | GREEN RIVER AT GREEN RIVER, UT | 22, Flaming Gorge the largest | 201.7% |
| 09333500 Dirty Devil River above Poison Spring Wash near Hanksville | DIRTY DEVIL R AB POISON SP WSH NR HANKSVILLE UT | none | 58.0% |

All four have a record from before 1991, a traced basin within 25% of the
published drainage area, and one primary daily mean discharge series
(parameter 00060, statistic 00003, ft^3/s), confirmed against the v1
`time-series-metadata` collection on 2026-10-27.

## Decision

**Publish daily mean flow at these four gauges, each as `shaped`, with no
comparison with normal and no rank.** Three are `shaped` because a
published reservoir sits inside their basins (ADR-137). The Dirty Devil has no
published reservoir in its basin, but its inventoried dams hold 58% of a
year's flow, at or above ADR-137's 10% line, so it is `shaped` too. Every tier is
recorded as directed on 2026-10-27 from the worksheet's suggestion and
pending his formal ruling in the review page; nothing here writes
`reviewer_ruling`.

**A committed, reviewed roster.** `admitted_river_gauges.json` is
hand-maintained like the other `admitted_*.json` files. Each entry carries a
display name in plain words beside the survey's own station name, the
reviewed `time_series_id` and when it was checked, the tier with its basis,
who directed it and when, the worksheet evidence behind it, and -- where a
reader is told where the river goes -- the evidence for that.
`pipeline.roster.load_admitted_river_gauges` refuses an entry without any of
these, refuses a display name in capitals or with a survey abbreviation,
refuses any normal, rank or capacity field, and refuses every tier but
`shaped` until another tier's publication method is decided.

**The measurement and its window.** `refresh_rivers.py` confirms that each
reviewed series is still the survey's only primary daily mean in ft^3/s, then
reads the v1 OGC `daily` collection for the last 90 days
(`RIVER_FETCH_DAYS`: the 60-day withdrawal limit plus the 30-day window). It
keeps each day's approval status and qualifiers, keeps a reported day with no
value as a day with no value, and refuses the whole series for a row naming
another site, series, parameter, statistic or unit, a negative or non-finite
value, or two different values on one date. Each gauge publishes the 30
calendar days ending on its newest day with a value, the change from the
value exactly seven days earlier (null when that day has none), the window's
highest and lowest values with their most recent dates, and how many days
carry a value and how many are provisional. Every run reads the whole window
again, so a revised provisional value replaces the one published before it
and no merge with yesterday's file is needed.

**Freshness is the reservoirs'.** `STALE_AFTER_DAYS` (2) marks a reading late
and `WITHDRAW_AFTER_DAYS` (60) withdraws it to a notice carrying no
measurement, keyed by `source_station_id` (ADR-126). A gauge whose request
fails, or that answers with no value in 90 days, carries yesterday's record
forward marked late with `fetch_ok: false`; a withdrawn gauge keeps its
notice. A payload that fails validation -- including a roster gauge in
neither list -- leaves the last complete `rivers.json`.

**What the payload refuses.** `pipeline.rivers.validate_payload` and the
browser's `validateRiverPayload` refuse a normal, a rank, a percentile, a
capacity, an inflow and any total across gauges, on a record or on the
envelope; `compared_with_normal` must be false. Nested gauges are never
summed and no gauge is called a reservoir's inflow (ADR-124).

**Delivery is the existing static-data pattern.** `rivers.json` is committed
by the daily refresh (stage 5c of `scripts/refresh-daily.sh`) and copied to
the root, `data/` and `api/` by the build, like `lakes.json`. ADR-124 already
keeps small JSON in this pattern and reserves R2 for rasters and dated
archives, so this is not a deviation: four gauges of about 2 KB gzipped
belong in the daily data commit, and no credential or bucket is involved.

**The key.** The river adapter sends `USGS_API_KEY` in the `X-Api-Key` header
whenever one is configured, which the daily job always is (ADR-098). Without
one it asks anonymously, as the gauge-review tools do; eight requests a day
are inside the anonymous allowance. The reservoir and lake adapters still
require the key and still read v0; they are not migrated by this record.

**The reader surface is a page of its own, `rivers.html`,** reached from the
methods glossary ("River flow") and the data page, not from the bar, as
ADR-119 did for the lakes. Another branch is rewriting the precipitation,
storage-chart and snow pages, the page header and the shared stylesheet;
a new page touches none of them except two lines naming the page in
`src/ui/page-header.ts`. A flow is a rate with no full level and no colour
class, so the storage map's legend, rollups and table would each need a guard;
the reservoir page would describe a gauge through a builder that starts from a
percent full. Each gauge shows its plain name, today's mean flow in cubic
feet per second with its date, the review status of that value, the
sentence "Dams upstream store and release water, so this flow is not compared
with normal.", a 30-day chart drawn as SVG (ADR-075) on an axis from zero with
missing days as gaps, every value in a table, the survey's station name, and
a link to the survey's monitoring-location page. The page offers the daily
values as one CSV file. The words are true whether decision R8 later splits
`shaped` into storage and diversion; "flows on toward Lake Powell" is used
because each gauge sits in the Upper Colorado region, the basin above Lee
Ferry, upstream of the lake on its own river.

## Rejected alternatives

- **Wait for every ruling.** Brian chose to publish the reviewed evidence for
  four gauges now; the roster says the tiers are pending his formal ruling.
- **Compare with normal or rank.** None of these gauges is natural, and a
  flow normal has no reviewed method yet.
- **Add the four together, or call them Lake Powell's inflow.** The Colorado
  near Cisco and the Green at Green River join above the lake; other water
  joins and leaves below each gauge (ADR-124).
- **Draw the gauges on the storage map or the reservoir page.** Every
  reservoir consumer would need a guard, and the files those surfaces live in
  are under rework on another branch.
- **Merge each run with yesterday's daily values.** Re-reading the whole
  publishable window is simpler and cannot keep a value the survey revised.
- **Fetch the survey from the browser.** ADR-124: request count must not
  depend on visits.
- **Upload to R2.** Not needed for small JSON under ADR-124, and it would add a
  credential to the daily job for 2 KB.

## Consequences

- New: `admitted_river_gauges.json`, `pipeline/rivers.py`, `refresh_rivers.py`,
  the v1 flow adapter in `pipeline/providers.py`, `rivers.json`,
  `rivers.html`, `src/rivers.ts`, `src/rivers-model.ts`,
  `src/data/rivers-validate.ts`, `src/ui/rivers-template.ts`,
  `src/viz/flow-chart.ts`, `src/styles/rivers.css`, `window.__riversReady`,
  the `rivers` page id, a data page section and field groups, and a smoke case
  at every width.
- The first payload, written 2026-10-27, is 23.9 KB raw and 2.2 KB gzipped
  (gzip -6), against the pilot's 100 KB opening-data budget. Only
  `rivers.html` fetches it.
- Adding a gauge is a roster edit with its evidence plus the same day's
  refresh; adding a `natural` or `short` gauge needs a decision on how that
  tier is published first.
- If Brian's formal ruling differs for any of the four, the roster entry
  changes with it, and a gauge ruled `exclude` leaves the roster.

## Evidence

- `gauge-review.csv`, screened 2026-10-23 with storage evidence 2026-10-26.
- [Recent conditions pilot](../RECENT-CONDITIONS-PILOT.md).
- [USGS v1 OGC API](https://api.waterdata.usgs.gov/docs/ogcapi/), checked 2026-10-27.
