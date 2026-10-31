# ADR-144: Compare natural river gauges with the survey's day-of-year percentiles

- Status: Accepted
- Date: 2026-10-31
- Extends: ADR-136 (daily flow at four shaped rivers; unchanged for them),
  ADR-137 (the tier rule a natural gauge must meet)
- Relates to: ADR-138 (GAGES-II reference evidence), ADR-098 (the pipeline
  key), ADR-056 (late and withdrawn), ADR-041 (the storage normals' own period)

## Context

ADR-136 published four `shaped` gauges as flow alone and refused every
`natural` gauge until a method for comparing one with normal was decided. On
2026-10-31 Brian ruled "Natural gauges vs normal": publish natural gauges with
today's flow against the U.S. Geological Survey's daily percentiles from the
new Water Data Statistics API, like WaterWatch. Shaped gauges stay flow-only.
The first set is his four explicit `natural` rulings of 2026-10-27, all GAGES-II
reference gauges whose records cover 1991-2020.

### What the service does, measured on 2026-10-31

The [Statistics API](https://api.waterdata.usgs.gov/statistics/v0/openapi.json)
(v0, labelled beta, "subject to change") has two endpoints. Day-of-year
values come from `observationNormals` with `normal_type=DOY` and
`computation_type=percentile`. Measured against the four gauges, keyless:

- **Which percentiles.** Always the 5th, 10th, 25th, 50th, 75th, 90th and
  95th, as strings, one set for each of 366 days `01-01` to `12-31`, with
  `sample_count`, `approval_status` and the `parent_time_series_id` of the
  daily mean series they were computed from. All four gauges return all 366
  days, and each `parent_time_series_id` is the primary daily mean series the
  v1 `time-series-metadata` collection lists.
- **Approved data only.** The OpenAPI document: "At this time, only approved
  observations are returned." Every value says `approved`.
- **Which years.** The whole approved record, gaps and all, not a fixed
  normal period. Mill Creek's daily record has approved values for 1954-1959
  and 1987 to May 2026; `sample_count` on 31 October is 44, exactly the number
  of years with an approved 31 October, 1954 to 2025. January days count 2026.
  The values therefore move a little each time the survey approves more data.
- **The percentile formula.** Not documented: the [dataRetrieval
  guide](https://water.code-pages.usgs.gov/dataRetrieval/articles/daily_data_statistics.html)
  says only which percentiles are returned. Recomputed from Mill Creek's
  approved daily values on seven calendar days, the service's numbers match
  numpy's `weibull` method (rank / (n + 1), linear between ranks) on all
  seven, and none of seven other methods.
- **No minimum.** The same guide: "there is no minimum requirement for the
  number of observations to calculate a statistic". Middle Fork Beaver Creek
  answers with 22 years on 365 days; every gauge answers 29 February with 5 to
  13.
- **Missing values.** A percentile the service cannot place is the string
  `nan`. Across the four gauges this hits the 5th and 95th on a few days, and
  the 10th to 90th only at Middle Fork Beaver Creek (26 March, 15 September,
  29 February) and on 29 February.
- **The page that documents it,** waterdata.usgs.gov/statistics-documentation,
  answered 403 to this session's fetches, and WaterWatch's real-time page now
  redirects to the survey's blog post on the move to these statistics. The
  facts above are measured, not quoted.

WaterWatch's published method for its real-time map: today's flow placed
among the day-of-year percentiles of daily mean flow, in five classes -- under
the 10th much below normal, 10th to 24th below normal, 25th to 75th normal,
76th to 90th above normal, over the 90th much above normal -- at gauges with at
least 30 years of record.

## Decision

**The service is the source, and this project computes no percentile.**
`tools/build_river_normals.py` asks it for each natural roster gauge and keeps
the 10th, 25th, 50th, 75th and 90th percentiles and `sample_count` (as
`years`) for all 366 days. It refuses a gauge whole when the reply names
another series, statistic or unit, misses or repeats a day, carries a value
that is not approved or not a day-of-year percentile, or orders the
percentiles wrongly. A `nan` is kept as a missing percentile, never filled.

**The class is WaterWatch's, on the published band.** A natural gauge's
newest daily mean is compared with the band for its own calendar day (the
`as_of` date's month and day, not the run date): under p10 much below normal,
under p25 below normal, p25 to p75 normal, up to p90 above normal, over p90
much above normal. A value equal to a boundary takes the class nearer normal,
on both sides alike. The newest value is usually provisional and the band is
approved; the page already says the value's review status.

**Thirty years, per day.** A day whose band rests on fewer than 30 years, or
that lacks one of the five percentiles, is not compared: the record says
`compared_with_normal: false` and why (`fewer_than_30_years`,
`percentile_missing`), with no band and no class. A gauge most of whose days
fall under 30 years has no normal to compare with and the loader refuses it.

**The percentiles are a committed reference file, not a daily request.**
`river_normals.json` is built on demand, merged on every run, stamped with the
date it was read, and registered with `check_reference_freshness.py` at 365
days, because each approved year moves the values slightly. The daily refresh
reads it and makes no request beyond ADR-136's, so a beta service's outage or
change of shape costs nothing on a morning. `load_river_normals` refuses the
file when a natural roster gauge has no entry or its entry fails a check, and
the refresh then leaves the last complete `rivers.json` in place: no class is
ever published against a band that did not load.

**The payload.** `rivers.json` moves to structure version 2. A natural record
carries `tier: "natural"`, `compared_with_normal`, `normal_band` (`day`, `p10`
to `p90`, `years`, `retrieved`, `source_url`), `flow_class` and
`normal_withheld`. A shaped record is exactly ADR-136's: `compared_with_normal`
false and none of those three fields. Both validators refuse a band or class
on a shaped gauge, a class that does not follow from the flow and the band, a
band for another date, out of order or under 30 years, and a reason beside a
band. A rank, a percent of normal, a `percentile` field and any total are
still refused everywhere. Freshness and withdrawal are ADR-136's; a carried
record keeps the band of its own date.

**The roster.** The loader admits `natural` only with ADR-137's evidence met
on the record: no published reservoir in the traced basin and inventoried
storage under 10% of a year's flow, plus `tier_ruled_on`. Each natural entry
is directed by Brian Busch on 2026-10-31 (the publication ruling) with its
tier ruled on 2026-10-27.

**The page.** A natural gauge says "Little or no water is stored upstream, so
this flow is compared with normal for the date.", the class in words ("Much
above normal for October 30"), the normal range (p25 to p75) with the years
behind it, the median, and the much-below and much-above lines. A day with no
comparison says why. Shaped gauges are unchanged.

**The first set.** Mill Creek at Sheley Tunnel near Moab (09183500), Blacks
Fork near Robertson (09217900) and South Creek above the reservoir near
Monticello (09378170): 40 to 54 years on every day but 29 February. **Middle
Fork Beaver Creek near Lonetree (09226500) is held out:** the service has 22
approved years for each day, matching the worksheet's `flow_years`, under the
30 a comparison needs. Its 1948 record begin hides long gaps.

## Rejected alternatives

- **Compute percentiles from the daily record.** Brian's ruling names the
  survey's percentiles, and a second implementation of the same statistic is
  something to keep agreeing with. The measurement above is a check, not a
  fallback.
- **Fetch the percentiles on every run.** Three more requests a day to a beta
  service, for values that move once a year, and a new way for a morning to
  fail.
- **A fixed 1991-2020 period, like the storage normals (ADR-041).** The
  service offers no period parameter for day-of-year percentiles, and
  WaterWatch used the whole record too. The page says how many years.
- **Publish Middle Fork Beaver Creek against 22 years.** The service sets no
  minimum, but WaterWatch did, and a 22-year band reads as more than it is.
- **Use the 5th and 95th percentiles for more classes.** They are the values
  most often `nan`, and WaterWatch's five classes need only p10 to p90.
- **Class a natural gauge when the band is missing by using a neighbouring
  day.** That is an estimate; the record says it is not compared instead.

## Consequences

- New: `river_normals.json` (about 106 KB, 17 KB gzipped; never copied to
  `dist/`), `tools/build_river_normals.py`, `fetch_usgs_flow_normals`,
  `load_river_normals` and `flow_class`, the natural fields in both validators
  and the data page, and `compared` in `window.__riversReady`.
- `rivers.json` grows from 23.9 KB / 2.2 KB gzipped to 42.7 KB / 3.7 KB with
  seven gauges (gzip -6, 2026-10-31).
- On 2026-10-31 all three natural gauges read much above normal for 30 October
  after the late-October storms. This is the payload's measurement on one
  morning, not a test.
- Adding a natural gauge is a roster entry with ADR-137's evidence, a
  `build_river_normals.py --only SITE` run, and the same day's refresh.
- Rebuild `river_normals.json` about once a year, when the freshness check
  says so; if the service's shape changes, the builder refuses rather than
  writes.
- Blacks Fork's worksheet row is in `review`, not `bulk`, because of one
  650 acre-foot irrigation dam; the publication follows Brian's explicit ruling.
  `reviewer_ruling` in `gauge-review.csv` stays blank until the review export
  is imported.

## Evidence

- `gauge-review.csv`, screened 2026-10-23.
- [Statistics API OpenAPI](https://api.waterdata.usgs.gov/statistics/v0/openapi.json)
  and `observationNormals` replies for the four gauges, 2026-10-31.
- [v1 OGC `daily` and `time-series-metadata`](https://api.waterdata.usgs.gov/docs/ogcapi/),
  2026-10-31.
- [dataRetrieval: daily data statistics](https://water.code-pages.usgs.gov/dataRetrieval/articles/daily_data_statistics.html),
  read 2026-10-31.
