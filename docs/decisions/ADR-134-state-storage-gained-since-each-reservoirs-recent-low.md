# ADR-134: State storage gained since each reservoir's recent low

## Status

Accepted

## Date

2026-10-27

## Relates to

ADR-056 (late and withdrawn records), ADR-046 (a total names what it is made
of), ADR-116 (an excluded reading is gone from the series), ADR-072 (what
`METHOD_VERSION` guards), ADR-115 (an optional, additive field does not move
`schema_version`), ADR-006 (visible language).

## Context

After the September and October 2026 storms, readers asked how much water the
reservoirs had gained. A public tracker answered for Lake Powell from a date
its author picked (15 September, when the storms began). The site published
changes over 7, 30 and 365 days, which answer a different question: none of
them starts at the low.

`reservoirs.json` publishes no daily series, only monthly rows whose `min_af`
has no date. So a low with its date can only be found in the pipeline, which
holds each reservoir's full daily series while it builds the record.

Of the 405 published records, 293 are daily. The others are month-end feeds,
which cannot place a low inside a month.

`statewideRollup` sums its change fields with a helper that reads a missing
value as zero. For a gain since the low, that would make a reservoir with no
figure look like a reservoir that gained nothing.

## Decision

**Each daily reservoir publishes its own lowest daily storage in the last 120
days, the date of that low, and the storage gained since.** Brian ruled on the
anchor (R1), the daily-only rule (R2) and where it shows (R3) on 2026-10-27.

1. **Fields.** `low_120d_af`, `low_120d_date` and `change_since_low_af` on each
   reservoir record, computed in `summarize` by `pipeline.history.recent_low`.
   The window is the 120 days ending on the reading date (`LOW_WINDOW_DAYS`).
2. **Ties take the latest date.** A reservoir held flat at its low was at the
   low until the last of those days.
3. **Null, never guessed.** All three are null for a month-end feed, for a late
   record (`is_stale`, including a record carried forward after a failed
   fetch), and for a window that holds fewer than 100 daily readings
   (`LOW_MIN_READINGS`), because a gap is where the real low may be.
4. **Totals count coverage.** `sinceLowTotal` sums only the daily reservoirs
   that publish a figure and returns how many of how many. The text always
   says "N of M daily reservoirs", also when N equals M.
5. **Where it shows.** The reservoir details (the storage map, the reservoir
   page and the story view share one details builder), a seventh card in the
   storage-charts place summary, and one line on the storage map hover. Not
   in the weekly summary ("What moved this week").
6. **Visible words.** "Up 809,000 acre-feet since its low on Sep 14, 2026", or
   "At its lowest in 4 months" when the newest reading is the low. No new
   colour.

## Versions

`METHOD_VERSION` names the seasonal estimator, and its three refusals guard
normals (`docs/architecture/hydrology-methods.md`). No committed normal is a
wrong answer after this change, so it stays `storage-normal-annual-3`.

`RESERVOIR_SCHEMA_VERSION` stays 1. The three fields are optional and additive,
as every field added to this payload has been (ADR-115): a payload written
before them still validates, and nothing a consumer already reads changed
shape.

## Rejected alternatives

- **A fixed start date** (15 September, as the public tracker uses). A date
  someone picks is a judgement the site would have to defend and pick again
  every season, and it would be wrong for a reservoir whose low came later.
- **The water-year start (1 October).** It misses the September storms.
- **Monthly reservoirs from their monthly minimum.** The minimum has no date,
  and a month-end feed cannot say when inside the month it happened.
- **Reading a missing figure as zero in the total.** It would make a gap look
  like a reservoir that gained nothing, and the total would hide how much of
  the place it covers.
- **Publishing the daily series so the browser finds the low.** It would add
  the full series to a payload every reader fetches on every visit (ADR-051)
  to answer one question the pipeline can answer once.

## Consequences

- The payload grows by three fields on each of 405 records.
- A record that is late for even one day loses its gain since the low until
  its feed answers again, because a late record is carried forward as
  `is_stale`. The total then says one fewer of the daily reservoirs.
- In June the window reaches back to the winter low, so the same field states
  the runoff gain without any change.
- The Methods page does not describe the figure yet.
- On 2026-10-27, 258 of the 293 daily reservoirs published a figure,
  together 3,526,157 acre-feet. 26 were late, 2 had a gap in the window
  (Lake Pleasant, Pardee), and the 7 U.S. Geological Survey records were
  carried from the previous payload by the per-source refresh and have no
  figure until the next full run. 103 were at their low. Lake Powell: up
  683,010 acre-feet from 5,074,900 on 15 September to 5,757,910 on
  26 October, the same figure taken by hand from Reclamation item 509.
