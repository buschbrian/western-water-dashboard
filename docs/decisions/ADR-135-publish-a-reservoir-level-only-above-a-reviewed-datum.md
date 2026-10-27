# ADR-135: Publish a reservoir level only above a reviewed datum

## Status

Accepted

## Date

2026-10-27

## Relates to

ADR-112 (a level is never a percentage of anything), ADR-117 (scope closed at
1.0.0; a new published measurement needs its own record), ADR-118 and ADR-119
(the terminal lake's level block and level card, reused here), ADR-002
(payloads are copied, never imported), ADR-006 (visible language), ADR-008
(colour comes from the class table), ADR-051 (payload cost is measured
gzipped), ADR-075 (draw the chart rather than configure it).

ADR-130 to ADR-134 are skipped: three branches collided on ADR-130 and
ADR-134 is reserved for another planned record.

## Context

Charts of Lake Powell's level from the Bureau of Reclamation and from the
U.S. Geological Survey are posted side by side and disagree by about three
feet. On 2026-10-27 the reason was measured. The Geological Survey's site
page for 09379900 charts parameter 62615, the level above NAVD 1988. That
reads a steady 2.9 to 3.0 ft above parameter 62614, the level above NGVD 1929,
at the same site and time (median 2.9 ft over 2,878 fifteen-minute readings).
Reclamation's daily level (RISE item 508) matches 62614: over 91 days,
2026-07-28 to 2026-10-26, RISE minus 62614 had a median of +0.14 ft against
the reading nearest local midnight and +0.21 ft against the daily mean, and
RISE minus 62615 a median of -2.76 ft, which is the 2.90 ft between the two
Survey series less RISE's +0.14 ft over 62614. The rest of the gap is time:
Reclamation publishes one end-of-day reading a day and the Survey one every
fifteen minutes, so while the lake rose 1 to 1.8 ft a day (21 to 25 October)
a daily mean and an end-of-day value were up to about a foot apart.

Reclamation names no datum. The RISE item's `verticalDatum` field is null on
every elevation item read, and RISE is not one datum throughout: Taylor Park
(item 796) matches the Survey's NAVD 1988 series, not its NGVD 1929 one. A
level published with no datum, or with the provider's datum assumed, is the
disagreement this site would be adding to rather than explaining.

The owner approved publishing the surface level of Lake Powell and Lake Mead.

## Decision

**A reservoir's surface level is published only from a reviewed roster entry
that names its datum with evidence.** `admitted_reservoir_elevations.json` is
reviewed by hand, keyed by the published reservoir's `source_station_id`, and
loaded by `pipeline.roster.load_admitted_reservoir_elevations`, which refuses:

- an entry with no datum, or a datum other than NGVD29, NAVD88 or `project`;
- a `project` datum (an operator's own, such as Hoover Dam's powerhouse datum
  or Reclamation's project datums at Davis and Parker) without its name and a
  stated relation to a national datum: the national datum, the feet to add,
  the operator's own words and an HTTPS source; and a national datum carrying
  either;
- datum evidence with no checked date or a source without an HTTPS link;
- a measured offset to the other datum with no measurement date;
- a reference level with no authority or no HTTPS source, or one carrying a
  percentage or a volume;
- a station that is not a Reclamation reservoir already on the roster.

Every entry carries its own datum evidence. No datum is assumed from the
provider, because the provider is not one datum.

A project datum is published by its own name with its relation stated
("the Bureau of Reclamation's Hoover Dam powerhouse datum ... Add 0.55 feet to
a level on this datum to give the level above the National Geodetic Vertical
Datum of 1929"), never called by the national datum it is stated against.
The relation is stored as the feet to add (`add_ft`), the operator's own
instruction, rather than as a signed offset, because "a datum 0.55 feet lower"
can be read in either direction. `add_ft: 0.55` is the owner's "NGVD29 offset
-0.55 ft": a level on the project datum reads 0.55 ft lower than the same
water above NGVD 1929.

**A difference that was calculated is never presented as measured.** Where no
second series exists to measure against, an entry may carry a
`derived_offset`: the other datum, the feet, how it was calculated, its
sources and the date they were read. It is published apart from
`datum_offset`, and the page says it is calculated and not a measurement at
the reservoir.

**The record carries a summary; the series is its own file.** A rostered
reservoir's record gains an optional `elevation` block with the shape a
terminal lake's level has: unit, datum, current value, dated record readings,
`first_obs`, `n_obs`, dated 7-, 30- and 365-day changes in feet with their
reference dates and elapsed days, and the same-date history rank. The block
adds the provider item, its page, the measured offset and the reference
levels, and, where present, the project datum's name and relation and a
calculated offset. Both are built by one function, `pipeline.measurement.
summarize_measurement`, moved out of `pipeline.lakes`; the lake record is
unchanged to the byte (a synthetic lake hashes the same before and after, and
`tests/test_reservoir_elevation.py` pins it). The daily levels from the
provider's first reading go to `elevation_history.json`, written compact, so
`reservoirs.json`, which every page fetches, carries a summary and never a
series. `fetch_rise_series` takes the value column's name; the storage
callers are unchanged.

**`RESERVOIR_SCHEMA_VERSION` stays 1.** The block is optional and additive,
as every field added to the payload has been (`docs/architecture/pipeline.md`);
nothing a consumer already reads changed shape, and the runtime validator
accepts a record with or without it. The history file has its own
`ELEVATION_HISTORY_SCHEMA_VERSION`, 1.

**A failed level fetch costs the level, never the storage.** Yesterday's
block and history entry are kept; the block's own `as_of` dates them, and the
page says when the level reading is late.

**The reservoir page shows a "Surface level" card, a water-year chart and a
datum note.** The card is the lakes page's level card, shared
(`src/measurement-model.ts`, `src/ui/measurement-card.ts`): feet above the
datum spelled out in full, dated changes in feet, and no percentage of a
level. The chart is hand-built SVG (ADR-075): the current water year strong,
the year before lighter, four earlier years muted, so six lines read on a
390-pixel phone and on a desktop. Reference levels are dashed lines named at
the right end. A level more than half the readings' range away (and never
less than ten feet) is named under the chart rather than drawn, because a line
a hundred feet off flattens every year into a few pixels. No colour is a
storage-class colour (ADR-008). Where the Geological Survey measures the
reservoir (Powell), the note "Why the Geological Survey can show a different
level" says in Simplified Technical English which datum Reclamation uses,
that the Survey's page can show the other one and how far apart they read
here with the measurement date, and that one reading a day and one every
fifteen minutes differ while the water moves quickly. Where it does not
(Mead), the note "Why other sources can show a different level" names the
project datum and its relation, gives the calculated NAVD 1988 difference as
calculated, and claims no Survey series. Each note links its sources. The
chart's host has the stable id `reservoir-elevation-chart`, ready when
`window.__reservoirReady.elevation` is `drawn`, so a later share-image step
can capture it alone.

**Lake Powell and Lake Mead are published.** Powell above NGVD 1929 on
measured evidence; Mead above Reclamation's Hoover Dam powerhouse datum, by
the owner's decision of 2026-10-27, on the evidence under Lake Mead below.

## Rejected alternatives

- **Assume the provider's datum.** RISE labels none and is not uniform; the
  first wrong assumption would put this site among the charts that disagree.
- **Convert to NAVD 1988 so the Survey's page and this one agree.** The
  operator publishes and operates to NGVD 1929 figures, and every reference
  level here is in those figures. The note explains the difference instead.
- **Publish the daily series inside `reservoirs.json`.** Every page would pay
  for two reservoirs' sixty years on every visit (ADR-051).
- **Copy the lakes level code.** Two copies of one summary drift; the shared
  function is the guarantee that a level means the same on both pages.
- **Draw every reference level.** Water that cannot be released is 150 ft
  below Powell's readings; drawing it squeezes six years into a third of the
  plot.

## Consequences

- New: `admitted_reservoir_elevations.json` (reviewed by hand),
  `pipeline/elevation.py`, `pipeline/measurement.py`, `elevation_history.json`
  (generated daily, copied to the root, `data/` and `api/` like
  `lakes.json`), `src/measurement-model.ts`, `src/ui/measurement-card.ts`,
  `src/reservoir-elevation-model.ts`, `src/viz/elevation-years.ts`,
  `src/data/elevation-validate.ts`, `window.__reservoirReady.elevation`, CSV
  columns for a reservoir that publishes a level, and data-page sections.
- `elevation_history.json` is 117 KB gzipped (434 KB raw) with Mead's record
  from 1935-02-02 and Powell's from 1963-12-28; `reservoirs.json` grows by
  about 2 KB gzipped. It is fetched only by a page whose reservoir carries a
  level.
- The full record is published, so the record lows (Powell, May 1964; Mead,
  February 1935) and the history ranks include the years each lake was first
  filling. Whether to start the summary after first fill is a separate
  decision with its own evidence.
- A future elevation entry needs its own datum evidence and, where a second
  datum is in public use, its own measured offset. RISE's Taylor Park item is
  the standing example of why.

## Lake Mead

Published 2026-10-27 by the owner's decision, labelled with its project
datum. There is no active Geological Survey elevation series to compare
(09421000 carried storage and ended 2017-09-30), and Reclamation's daily feed
names no datum. Reclamation's 2001 Lake Mead Sedimentation Survey (Ferrari,
February 2008,
https://www.usbr.gov/tsc/techreferences/reservoir/2001%20Lake%20Mead%20Sedimentation%20Survey.pdf)
states: "All elevation data were tied to the Hoover Dam powerhouse datum that
is 0.55 feet lower than NGVD29 (Lara and Sanders, 1970)", and of the reservoir
water surface: "Tied to 'Power House' datum. Add 0.55 feet to convert to
NGVD29, from leveling of 1935."

**That RISE item 6123 is on this datum is an inference from Reclamation's own
report that its stage data are tied to it, not a measurement**: no
independent series exists to measure it against. Lake Mohave and Lake Havasu
likewise use Reclamation project datums (RPVD Davis = NAVD 1988 minus 3.39 ft;
RPVD Parker = NAVD 1988 minus 2.72 ft; Reclamation 2022 area-capacity report).

The NAVD 1988 difference is calculated: National Geodetic Survey benchmarks
on the dam crest give NAVD 1988 minus NGVD 1929 as 2.35 ft at GR0577
(1,234.87 against 1,232.52 ft) and 2.34 ft at GR0578 (1,234.91 against
1,232.57 ft), read 2026-10-27; with the 0.55 ft relation, a level above NAVD
1988 reads about 2.9 ft higher than Reclamation's number. It is published as
`derived_offset`, never as `datum_offset`.

The entry: elevation item 6123 beside storage item 6124; `vertical_datum`
`project`, `datum_name` "Hoover Dam powerhouse datum", `datum_relation`
{NGVD29, `add_ft` 0.55, the survey's words and link}. Reference levels,
authority Bureau of Reclamation:

- 1,229 ft, the top of the space kept empty for floods (full pool), 1,219.6 ft
  maximum operating elevation and 950 ft minimum power pool, from the
  Post-2026 Final EIS Technical Appendix 3,
  https://www.usbr.gov/ColoradoRiverBasin/post2026/final-eis/docs/Vol-III/P26-FEIS_TA_03_Hydro_508.pdf ;
- 895 ft dead pool (water that cannot be released), from Technical
  Appendix 15,
  https://www.usbr.gov/ColoradoRiverBasin/post2026/draft-eis/docs/vol-3/P26-DEIS-TA-15.pdf ;
- 1,075, 1,050 and 1,025 ft from the 24-Month Study,
  https://www.usbr.gov/lc/region/g4000/24mo.pdf , labelled "Level in the
  24-Month Study". No Reclamation table found names them as shortage tiers,
  so they are not labelled "Level 1, 2, 3".

Whether those reference levels are themselves stated on the powerhouse datum
or on NGVD 1929 is not established. Operating documents for the lake are
normally in Reclamation's own figures, but a 0.55 ft difference would sit
between a reading and its line, so it is recorded here as open.
