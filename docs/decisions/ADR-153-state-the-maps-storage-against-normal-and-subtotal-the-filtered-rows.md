# ADR-153: State the map's storage against normal, and subtotal the filtered rows

- Status: Accepted
- Date: 2026-11-09
- Amends: ADR-095 (county and hydrologic tier as analysis filters that "leave
  the totals unchanged"): the total is still unchanged, and a labelled
  subtotal for the filtered rows now sits beside it
- Relates to: ADR-029 (the table narrows where the map dims), ADR-041 (the
  reader's comparison period, named with every normal), ADR-089 (reservoir
  CSV columns), ADR-149 (the storage charts' weekly figures follow every
  filter)

## Context

The storage map led with percent of capacity alone. Readers asked whether
that figure is low for the date. The map already computed the answer and
discarded it: `updateSummary` called `rollupOfScoped` with the reader's
comparison period, and the rollup returned `percentOfNormal`,
`normalCovers` and `normalBaseline`, none of which reached the page. The
storage charts page printed the same rollup ("Of the usual storage for this
date, 1991 through 2020, for N of M reservoirs") from its own copy of the
sentence.

Three further gaps came with it. **Compare against** changed the details
panel and nothing else, so the control looked as if it had no effect on the
summary above it. A county, drainage, class or late-data filter dimmed the map
and narrowed the table, and the summary went on describing the wider place
with no figure for the rows the reader had picked out. On a phone the summary
lives in a closed sheet, so the map showed no figure at all.

The maintainer ruled on 2026-11-09 that the headline stays the wider (state
or place) total under every analysis filter and that a labelled subtotal is
added beside it. This record also leaves 1991 through 2020 as the default
period and changes no estimator, payload or method.

## Decision

**The map states its storage against normal, with the period beside it.** A
"Compared with normal" tile under the Storage and Reservoirs tiles shows the
headline rollup's percent of the usual storage for this date. Its note names
the period the figure was measured against (`normalBaseline`) and, when not
every reservoir has a normal for it, how many do. The note is one helper,
`describeUsualStorage` in `src/state/storage-summary.ts`, used by the map and
the storage charts, so the two pages cannot say one comparison two ways. The
charts page's visible text does not change.

**Compare against changes the summary.** The control now rewrites the tile,
the subtotal, the phone summary, the list and the table, as well as the
details panel.

**A past month has no comparison.** With the slider on a past month the tile
shows no figure and says the map compares only the newest reading with
normal. It never keeps the newest reading's figure under a month's total.

**The headline stays the wider total; a subtotal covers the filtered rows.**
When the analysis controls leave fewer rows than the scope holds, a block
labelled "Subtotal for the filtered reservoirs" gives how many reservoirs are
left, their percent full, and their percent of the usual storage with its
period and coverage. It is made from exactly the rows the list keeps bright
and the table lists. With nothing narrowing, there is no subtotal. On a past
month it gives the month's percent full and no normal. The filter sentence
("Showing N of M reservoirs ... The other reservoirs stay on the map in grey.")
is unchanged.

**The Storage tile says which very large reservoirs are in it**, with the
same "including" or "excluding" words as the scope sentence, and only for a
lake the chosen place can hold.

**On a phone, one control over the map carries the figures**: the place, the
reservoir count, percent full and percent of normal, and the subtotal on a
third line whenever there is one. It opens the storage summary, the same
action as the header's summary button. It shows only below 48rem.

**Each reservoir's comparison is published per row** for the chosen period:
a second figure in the side list, a sortable "Compared with normal" table
column (`sort=normal-asc` and `sort=normal-desc`, added beside the existing
values, which keep their meanings), and two columns appended to the table's
CSV file ("Compared with normal (percent)", "Normal period") with matching
GeoJSON properties (`percent_of_normal`, `normal_period`). A reservoir with
no normal for the chosen period shows nothing; another period is never put in
its place.

## Rejected

- **Make the headline follow the filters, as the charts' weekly card does
  (ADR-149).** It would change the map's published total under a filter and
  undo ADR-029 and ADR-095's reading of one area against its state.
- **Put the comparison only in the details panel.** That is where it was; the
  question is asked of the place, not of one reservoir.
- **Fill a missing standard-period normal from the recent period in the list
  and table.** A row has no room to say that it swapped, and ADR-041 refuses
  an unannounced substitution. The details panel still shows and names one.
- **Show a past month's comparison from the monthly normals.** It is a new
  claim about each month, and this record changes no method.
- **Insert the new CSV columns beside "Full (percent)".** Appending keeps
  every earlier column in its place for a reader's existing spreadsheet.

## Consequences

The readiness signal gains `summaryPercent`, `summaryNormal`,
`summaryNormalBaseline`, `subtotalShown`, `subtotalReservoirs`,
`subtotalPercent` and `subtotalNormal`; no field is removed. The subtotal,
the sentences, the table sort and the download columns are unit-tested; the
browser suite checks the tile, the Lake Powell switch, a drainage subtotal,
the period control, a past month and the phone control. The map canvas still
cannot be confirmed in headless Chromium.
