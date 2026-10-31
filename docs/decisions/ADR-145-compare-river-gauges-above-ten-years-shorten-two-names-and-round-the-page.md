# ADR-145: Compare river gauges above ten years, shorten two names, and round the page

- Status: Accepted
- Date: 2026-10-31
- Amends: ADR-144 (the 30-year floor, the first set, and the page's numbers)
- Relates to: ADR-137 (the tier rule and the name rules), ADR-136 (the
  roster and the page)

## Context

ADR-144 compared a natural gauge's newest flow with the U.S. Geological
Survey's day-of-year percentiles only when the date had 30 or more approved
years, WaterWatch's rule. The service itself sets no minimum. Middle Fork
Beaver Creek near Lonetree (09226500) was held out for that floor alone: it
has 22 approved years on 365 days, and it meets ADR-137's natural rule (no
published reservoir, no inventoried dam, a GAGES-II reference gauge, ruled
natural by Brian on 2026-10-27).

On 2026-10-31 Brian ruled on three points:

- **Record floor.** "Anything over 10 years is fine; just make a note of it
  in the table or add a boolean field."
- **Names.** "Mill Creek near Moab" and "South Creek near Monticello", in
  place of "Mill Creek at Sheley Tunnel, near Moab" and "South Creek above
  Reservoir near Monticello". The survey's station name and number stay
  visible.
- **Rounding.** Of the options offered, he chose "Three significant figures"
  for the normal range and the reading beside it on the rivers page.

## Decision

**Compare a date with more than 10 approved years.** `RIVER_NORMAL_MIN_YEARS`
moves from 30 to 11. A date with 10 years or fewer, or a missing
percentile, is still not compared, and the record says why:
`ten_years_or_fewer` (renamed from `fewer_than_30_years`, which would now be
false) or `percentile_missing`. A gauge most of whose dates have 10 years or
fewer is still refused by the loader.

**Flag a short record.** A compared natural record carries `short_record`:
true when the band rests on fewer than 30 years (`RIVER_NORMAL_FULL_YEARS`),
false at 30 or more, null when the date is not compared. Both validators
refuse a flag that disagrees with the band's `years`. Beside the comparison
the page says "The U.S. Geological Survey has 22 years of record for this
date, fewer than the usual 30.", and the "Years compared" row adds "(fewer
than the usual 30)".

**`rivers.json` moves to structure version 3.** The new field alone would be
additive, but the release also renames a `normal_withheld` value and drops
the version-2 promise that a band rests on 30 years or more. A reader of
version 2 could rely on both, so the version moves.

**Admit Middle Fork Beaver Creek near Lonetree** on ADR-137's evidence, the
same path as the other three: no published reservoir and no inventoried dam
in a traced basin of 29 sq mi against a published 28.1, a GAGES-II reference
gauge, `tier_ruled_on` 2026-10-27, directed 2026-10-31. Its primary daily
mean series (`27325b270d604ffbad3c413017f647bf`, from 1948-10-01) was checked
keyless against the v1 `time-series-metadata` collection on 2026-10-31, and
`build_river_normals.py --only 09226500` added its percentiles. The station
name ends in "WY", but the survey's location record places it in Summit
County, Utah, at 40.946° N, so the roster says `UT`.

**Names.** The two display names change in `admitted_river_gauges.json`. They
keep ADR-137's rules -- proper case, the stream and the nearest town -- and
drop the structure the survey names the site by. "Middle Fork Beaver Creek
near Lonetree" is the worksheet's proposal, unchanged: it has no structure
to drop, and "Middle Fork" names which stream it is. `usgs_name`, shown as
"Station name at the publisher", and the station number are unchanged.

**Three significant figures on the rivers page.** `formatFlowFigures` shows
the reading in the headline, the normal range, the median and the
much-below and much-above lines. A value of 100 or more is a whole number
with separators (101, 3,920); a smaller value has three significant figures
with no added zero (15.4, 7.62, 33.75 as 33.8, 0.05 as 0.05). The daily
table, the 30-day highest and lowest, the CSV file and both payloads keep the
survey's precision.

## Rejected alternatives

- **Keep 30 years.** Brian ruled the floor at more than 10.
- **No floor, as the service has none.** 29 February answers with 5 to 13
  years; Brian set 10 as the line.
- **A note in the documentation only.** Brian asked for the note in the table
  or a field; a field lets the page and a data reader see it on each record.
- **Keep `fewer_than_30_years` to avoid a version change.** A reason that
  names the wrong number reads as fact.
- **Keep structure version 2.** The renamed reason and the looser band are a
  change in shape for anyone reading version 2.
- **"Beaver Creek near Lonetree".** It drops the fork and could name another
  stream.
- **Two significant figures, as on the ruling card's example ("34-60
  cfs").** Brian chose the option labelled three significant figures.
- **Round the data file, the table or the CSV file.** ADR-136 shows every
  value in a table at the survey's precision; rounding is for reading the
  comparison, not for the record.

## Consequences

- Eight gauges: four shaped, four natural. On 2026-10-31 Middle Fork Beaver
  Creek read 20.9 cubic feet per second for 30 October, much above normal;
  normal for that date is 6.8 to 9.4 with a median of 7.6, from 22 years.
  This is one morning's measurement, not a test.
- On 29 February, Mill Creek (11 years) and Blacks Fork (13) are now compared
  as short records; South Creek (10) and Middle Fork Beaver Creek (5) are
  not. Middle Fork Beaver Creek is also not compared on 26 March and
  15 September, where the service gives no 90th percentile.
- `rivers.json` is 49.0 KB raw and 4.1 KB gzipped (gzip -6); `river_normals.json`
  is 140 KB raw and 21.9 KB gzipped, still never copied to `dist/`.
- `tests/test_river_flow.py` holds the browser validator's floor, record
  length, structure version and reasons to the pipeline's.
- A carried record keeps the name it was published with until the gauge's
  next good fetch.

## Evidence

- Brian Busch's rulings, 2026-10-31.
- `gauge-review.csv`, row 09226500, screened 2026-10-23.
- [v1 OGC `time-series-metadata` and `monitoring-locations`](https://api.waterdata.usgs.gov/docs/ogcapi/)
  for USGS-09226500, read keyless 2026-10-31.
- [Statistics API `observationNormals`](https://api.waterdata.usgs.gov/statistics/v0/openapi.json)
  for USGS-09226500, read 2026-10-31.
