# ADR-170: Compare each station's precipitation with its own past years on the map

- Status: Proposed
- Date: 2026-11-14
- Extends: ADR-125 (precipitation against a fixed history), ADR-131 (precipitation map), ADR-142 (map modes)

## Context

The precipitation map shows recent amounts (ADR-131) and the week's soil
change (ADR-142). Neither answers the question Brian asked for: where this
water year is unusually wet or dry for the place. The card answers it for one
place at a time, over the fixed set of stations with every year since 1991
(ADR-125), which leaves out 271 of 639 stations with a gap in their record.

## Decision

1. **A third map mode, "Season against past years"** (`?layer=years`). Each station
   is placed against the same calendar date in each of its own past water
   years, read on a straight line between weekly steps (ADR-125), on the
   newest day `SET_SHARE` of on-time stations report.
2. **Classes are NCEI's ranking classes**: lowest tenth, lowest third, middle
   third, highest third, highest tenth, from a mid-rank percentile compared
   to a tenth of an inch. Wetter or drier than every past year is a dark ring
   on the station's class colour. Colours are the soil table's five (ends,
   neutral and their neighbours), so brown is dry and blue is wet in every mode.
3. **No class until the median for the date reaches `MEANINGFUL_NORMAL_INCHES`**
   (1 in), the floor the site already holds a ratio to.
4. **Stations with gaps are placed against the years they have**, at least
   `MIN_RECORD_YEARS` (10), and the page states the count. The history
   builder keeps those years for precipitation (`years` with null for a gap
   year, and `record_years`), with `available` still false, so the card's
   fixed set is unchanged.
5. **An area is a mean over its full-record stations only**, at least
   `MIN_AREA_STATIONS` (3), so every past year is the same stations.
6. **The baseline is the history file's window**, 1991 through the last
   finished water year, the card's. Snow's percent of normal stays on the
   Natural Resources Conservation Service's 1991–2020 normals (Brian,
   2026-11-14), so it keeps matching that agency's reports.

## Rejected alternatives

- **10th–90th band plus a 0.5 in difference.** Holding each past year out at
  every full-record station (13,248 station-years) showed the floor changes
  nothing after mid-October; the median floor does the same job with a rule
  the site already has.
- **5th–95th band.** With 35 past years each tail rests on one or two years:
  15% of held-out years fell outside a band meant to hold 10%.
- **Standardized precipitation index (gamma fit).** Early October has many
  zero totals, which a gamma fit cannot take without a mixed model, and the
  card already uses distribution-free ranks.
- **Partial records in the card's fixed set.** That would compare different
  networks in different years, the fault ADR-125 exists to remove.

## Consequences

`precipitation_history.json` grows by the partial records once the builder
is rerun (a network job). Until then the map compares only full-record
stations. No published estimator changes; no method or schema version
changes, because full-record stations and the fields the card reads are as
before. `tools/measure_precipitation_outliers.py` uses the same classes so a
report and the map agree.
