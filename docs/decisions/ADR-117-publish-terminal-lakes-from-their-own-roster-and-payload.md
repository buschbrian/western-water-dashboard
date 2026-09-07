# ADR-117: Publish terminal lakes from their own roster and payload

- Status: Accepted
- Date: 2026-09-06
- Implements: ADR-112
- Extends: ADR-056 and ADR-098

## Context

ADR-112 admitted `natural_terminal_lake` as a second water type and left the
shape of its publication open: "the current reservoir payload and UI remain
unchanged until a typed lake payload and separate rollups exist." Walker Lake
was named the first candidate.

The evidence is now in hand. The U.S. Geological Survey publishes, at one
monitoring location (10288500), a daily surface elevation (parameter 00062,
feet above NGVD29) and a daily volume (parameter 00054, acre-feet), both as
the observation at 24:00 since 1 October 2004, through the same OGC daily
collection ADR-098 already reads with a pipeline-only key. The volume is
computed on the published Lopes and Smith (2007) relation, applied from
1 October 2014. The site point resolves to exactly one NHDPlus HR waterbody at
the project's 100-metre tolerance and to the same lake in Esri's water bodies,
and the committed drainage geometry places it in subbasin 16050304 Walker Lake
inside basin 160503 Walker, which the survey's own hydrologic unit confirms.

Three shapes were possible for publishing it.

## Decision

**A lake has its own roster and its own payload.** `admitted_terminal_lakes.json`
is reviewed by hand and loaded by `pipeline.roster.load_admitted_terminal_lakes`,
which refuses any capacity-shaped field and requires what ADR-112 asks for: a
reviewed waterbody point, a reviewed closed-basin assignment, and for each of
the two measurements the survey's parameter, statistic and unit, with the
elevation's vertical datum and the volume's relation named beside them.
`refresh_lakes.py` writes `lakes.json` through `pipeline.lakes`; nothing in it
is imported by `refresh_reservoirs.py`, and `reservoirs.json` does not change.

**The record publishes two measurements, each with its own provenance.** An
`elevation` block carries the level in feet with its datum, and a `volume`
block carries acre-feet with the relation it was computed on. Each carries its
current value, dated record extremes, 7-, 30- and 365-day changes with the date
each change is measured from, and the same-date seasonal rank. Volume also
carries a percentage change and the twelve-month history; elevation carries no
percentage of anything, because a share of a level above an arbitrary datum has
no hydrologic meaning (ADR-112's third rejected alternative). The record's own
`as_of` is the earlier of the two series' last dates.

**The rank is the reservoir estimator, unchanged.** One vote per prior year in
the same window, counted from the lowest (`pipeline.seasonal.seasonal_rank`),
under the same `METHOD_VERSION`. A lake does not get a second definition of
"normal for this date". No climate normal is published for a lake until
`tools/build_normal_baselines.py` learns the type; the payload says so by
carrying none rather than by carrying a reservoir's.

**Freshness follows ADR-056.** A failed fetch carries yesterday's record
forward marked late; past `WITHDRAW_AFTER_DAYS` the lake leaves the payload for
a notice of name, date, age, source and reason and nothing else. The validator
refuses a notice carrying a measurement and a lake record carrying any of the
reservoir-only fields.

**A target is copied, never computed against.** A restoration or regulatory
level may appear only as a named elevation with its authority, source and
date. The loader refuses a target spelled as a capacity or a volume, and no
share of a target is published.

**Publication to readers is a separate change.** `lakes.json` is generated,
committed by the daily refresh and classified in `data/generated-files.json`.
It is not yet copied into the build, fetched by any page, aliased under `api/`
or described on the data page. Each of those is reader-visible and lands with
the lake surface itself, under the `dashboard-ui` procedure, so the methods
glossary's statement that every published water is a reservoir stays true
until a page shows a lake.

## Rejected alternatives

- **Add lake records to `reservoirs.json` under `water_type`.** Every consumer
  of that file — the runtime validator, the rollups, the table, the assistant
  indexes, the frozen oracle harness — would meet a record with no capacity
  and no percent full, and each would need a guard. ADR-112 forbids a lake in
  every reservoir rollup; the cheapest way to keep it out of all of them is a
  file none of them read.
- **One combined `waters.json` with both types.** The same guards, in a new
  file, plus a migration of every reservoir consumer for a change that adds one
  lake.
- **Publish elevation as a share of a datum or of a target.** Refused in
  ADR-112 and refused again here, mechanically, by the loader and the
  validator.
- **Generate the payload from the legacy keyless daily service.** It retires
  in early 2027 (ADR-080); the lake would have arrived on a source already
  scheduled to leave.

## Consequences

- New: `admitted_terminal_lakes.json`, `pipeline/lakes.py`, `refresh_lakes.py`,
  `lakes.json` (generated daily), `LAKE_SCHEMA_VERSION`,
  `pipeline.providers.fetch_usgs_parameter_series` (of which the storage
  fetcher is now the 00054 case), and a stage in `scripts/refresh-daily.sh`
  between snow and the assistant indexes.
- Walker Lake stays withheld in `admitted_usgs_reservoirs.json` with its entry
  pointing at the lake roster: one water, one type.
- Pyramid Lake, Great Salt Lake and Mono Lake are recorded as withheld in the
  lake roster with the finding ADR-112 gave each. An elevation-only lake needs
  the volume block to become optional by a later decision.
- The lake surface — where a reader sees a lake, how it is drawn beside
  reservoirs without joining their totals, and what the data page says — is
  the next decision, and the first one that changes the methods glossary.
