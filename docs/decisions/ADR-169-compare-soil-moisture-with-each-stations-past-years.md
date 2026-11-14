# ADR-169: Compare soil moisture with each station's past years

- Status: Proposed
- Date: 2026-11-14
- Extends: ADR-142 (the week's change; this is its "phase 2"), ADR-167 (the
  0–100 bound applies to the history as well)
- Relates to: ADR-144 and ADR-145 (the river map's percentile classes and
  year floor, reused), ADR-064 (the page regroups), ADR-008 (one colour table
  per measure), ADR-090 (readiness fields)

## Context

ADR-142 put soil moisture on the precipitation map as the seven-day change in
percentage points. A change says which way the soil moved this week. It does
not say whether the ground is wet or dry for the time of year, which is what a
reader asks going into winter (Brian, 2026-11-14: soil moisture is a state
more than a week's movement). ADR-142 rejected publishing the level because a
volumetric percent means different wetness in different soils, and left
"percent of median over each station's own record" for a later record.

A comparison with the same sensors on the same date in earlier years is
texture-free: a sand is compared with itself.

## Decision

**Soil mode gets two views: "Compared with past years" (the default once the
file has comparisons) and "Change in 7 days" (ADR-142, unchanged). The new
view puts each station's end-day value into one of five classes, the
National Centers for Environmental Information's tenths and thirds, against
the station's own percentiles for that calendar day.**

1. **Station history.** `tools/build_soil_normals.py` fetches each standard
   station's whole daily record of `SMS` and `STO` at its three depths and
   takes the station value exactly as the refresh does (R4 mean, frozen and
   readings with no temperature dropped, ADR-167's bound). For each calendar day it
   keeps the count of years and the 10th, 33rd, 50th, 67th and 90th
   percentile, by the Weibull plotting position, over the years before the
   build year. Written to `soil_normals.json` (derived on demand, never
   published, never copied to dist).
2. **One value per year on the calendar day, no window.** The value compared
   is one day's reading; a window mean would be smoother than any one day and
   push days into the outer classes. This is the U.S. Geological Survey's
   rule the river map already uses (ADR-144).
3. **More than 10 years** on the date, or not compared (ADR-145's floor).
   February 29 reads February 28's percentiles.
4. **Classes.** Under p10 much drier, under p33 drier, p33 to p67 normal, up
   to p90 wetter, over p90 much wetter; a boundary value takes the class
   nearer normal. These are NOAA NCEI's breaks (lowest tenth, lower third,
   middle third, upper third, highest tenth), which the precipitation map's
   past-years mode (ADR-168) also uses, so the two maps mean the same thing
   by the same colour (Brian, 2026-11-14). The river map's WaterWatch breaks
   (10/25/75/90) were the first draft and were not kept.
5. **Area.** The median of the compared stations' classes, held to the snow
   reporting floor (`MIN_ROLLUP_SITES`). With an even count and two
   different middle classes, the one nearer normal. The page regroups the
   place's own stations by the same rule.
6. **A station whose history was built over other sensor depths** than it has
   today is not compared (`other_depths`).
7. **Payload.** `soil_moisture.json` schema 2 adds `history_band`,
   `history_class` and `no_history_reason` per station, `compared_site_count`
   and `history_class` per area, and `history_rule` and
   `compared_site_count` at the top. The week's-change fields do not move.
   The page reads schema 1 files as "never compared".
8. **Colour.** No new colour. The five classes take the week's-change
   table's two browns, its neutral, its palest blue and its blue end
   (`src/viz/soil-history-classes.ts`), so brown is dry and blue is wet in
   both views.
9. **Link.** `?layer=soil` opens soil mode on past years; `&soil=change`
   opens the week's change. A schema 1 file, or one with no comparison,
   opens on the change whatever the link says.
10. **Rebuild** once a year after January 1, by the manual
    `soil-normals-build.yml` workflow (the service is reachable from the
    runner) or locally. Every run merges.

## Rejected

- **The river map's 25th/75th breaks.** Rejected for consistency with the
  precipitation map, which shares these colours.
- **Percent of median.** A ratio of volumetric percents reads as precise
  ("82 % of median") on a figure whose spread differs by soil and depth.
  Classes say what a reader needs and match the river map.
- **A continuous percentile per station.** Fifteen years of record cannot
  support "23rd percentile"; the site already learned this for storage
  (`pipeline/seasonal.py`).
- **Publishing the level.** Still rejected, for ADR-142's reason.
- **A fixed 1991–2020 period.** These sensors mostly start after 2005.
- **The mean of station ranks for an area.** Needs a continuous rank per
  station (above); the median class needs none.
- **Fetching past years at every refresh.** Twenty requests a morning for a
  number that changes once a year.

## Consequences

- `soil_normals.json` is about 3–5 MB raw, committed, rebuilt yearly.
- Until it is built and the next morning's refresh runs, the page shows the
  week's change only and the past-years button is disabled.
- Sensor replacements or moves inside a station's record are not detected; a
  station with a step in its record is compared against a mixed history.
- Many stations have under 11 years of winter values because frozen
  readings drop out, so winter maps carry fewer compared stations.
- `soil_moisture_history.json` keeps only the week's change; keeping the area
  class day by day is a later change.
