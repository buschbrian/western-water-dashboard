# ADR-175: Show river gauges with dams upstream as flow only

- Status: Proposed
- Date: 2026-11-16; dam rule narrowed by Brian Busch on 2026-11-23
- Extends: ADR-168 (publish every bulk-queue river gauge), ADR-137 (the tier rule)
- Relates to: ADR-136 (the roster and the page), ADR-138 (the review queues)

## Context

ADR-168 published the worksheets' `bulk` queue and Brian's rulings: 142
gauges. Most of the rows it did not publish sit in the `review` queue because
dams are upstream: a published reservoir in the traced basin, inventoried dams
that hold some share of a year's flow, or a record that does not cover
1991-2020 below such dams. On 2026-11-16 Brian directed that instead of not
showing these gauges, the page should show them and say that there are dams
upstream, and nothing more.

The page already does that for every `shaped` gauge. It shows the flow alone,
under "Flow only: dams upstream", with the sentence "Dams upstream store and
release water, so this flow is not compared with normal." A shaped gauge has
no normal, so neither the 1991-2020 record nor a reference class is needed to
publish one.

## Decision

**An unruled `review` row with water stored upstream is published as `shaped`.**
`tools/admit_bulk_river_gauges.py` takes a `review`-queue row with no
`reviewer_ruling` when its suggestion is `reservoir`, `natural` or `short` and
water is stored above the gauge. That means one of:

- a published reservoir in the traced basin; or
- inventoried dams with storage above zero, more of them than the dams the
  worksheet lists within 1 km of the gauge (`dams_near_gauge`), which may be
  below it.

A dam the inventory lists with no storage does not count, and neither does a
lone dam near the gauge. A `natural` suggestion with a GAGES-II `reference`
class stays in review: a person decides whether it is natural. Brian set these
limits on 2026-11-23, after review found that the first rule would have told
readers that a zero-storage dam stores and releases water.

Each admitted row is published `shaped`, `pending_formal_ruling`, directed
2026-11-16, and its basis cites this record. For these rows the tool does not
require a record that covers 1991-2020, since nothing is compared. ADR-168's
"shaped, but no published reservoir and storage under 10%: a person decides"
hold now applies only when no water is found stored above the gauge. That also
admits a ruled `reservoir` row with stored water, such as Ashley Creek near
Remember the Maine Park near Vernal (09271000), which ADR-168's tool held at
2.1% storage; it keeps its own ruling, status and 2026-11-14 direction.

**Printed as held**, each with its reason, when the tool loads the row:
`exclude` rows, waterwork names, open name checks, duplicate names, rows with
no HUC8 name (outside the drawn drainage areas), and series that report no flow
in the refresh's fetch window, as in ADR-168.

**Left in the worksheets and not printed**, since the tool never loads them:
`diversion` and `check` rows (their finding is not a dam, or the basin is in
doubt), review rows with no stored water above the gauge, and reference-class
`natural` rows.

**No change to the page or the method.** The tier, the sentence and the
grouping are ADR-136's and ADR-145's. No gauge becomes natural under this
record, and no natural gauge's percentiles change.

## Rejected alternatives

- **Publish every review row.** `diversion` and `check` rows carry findings
  other than a dam. Brian's direction was about dams.
- **A separate "dams upstream" tier.** `shaped` already means exactly that on
  the page. A second tier would add a word without adding a fact.
- **Count any inventoried dam** (the first form of this record). It put
  Duchesne River near Hanna (one dam, no storage) and Yellowstone River at
  Bridge Campground (a 60 acre-foot diversion that may be below the gauge)
  under a sentence that says the dams store and release water.
- **Compare low-storage gauges with normal.** The rule that a gauge under 10%
  may be natural stays ADR-137's. It still needs a reference gauge and a long
  record, and the review queue is where a person decides it.

## Consequences

- Measured on 2026-11-23 with `--plan` (no network): 81 rows to add. 78 are
  review rows with water stored upstream. The others are Ashley Creek near
  Remember the Maine Park (above) and the two ADR-168 gauges whose series
  reported no flow, tried again. 15 rows are printed as held.
- The narrower rule leaves six rows in review that the first form took:
  09276700 and 09292000 (no storage, or a lone dam near the gauge), 09408400
  (its only dam is near the gauge), and 09404450, 10109001 and 10205030
  (reference-class natural rows).
- Ashley Creek near Vernal (09266500) is a separate, unruled review row with
  three dams; it is published under this record's rule.
- `rivers.json` and `river_history.json` grow by about 57%. ADR-168 measured
  `rivers.json` at about 70 KB gzipped for 142 gauges, so about 110 KB is
  expected, which is over the pilot's 100 KB opening target. Measure it after
  the first run and decide then whether the target or the page load changes.
- The daily refresh makes two keyed requests per gauge, about five minutes in all.
