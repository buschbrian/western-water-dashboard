# ADR-173: Show river gauges with dams upstream as flow only

- Status: Accepted (Brian Busch, 2026-11-16)
- Date: 2026-11-16
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

**An unruled `review` row with a dam upstream is published as `shaped`.**
`tools/admit_bulk_river_gauges.py` takes a `review`-queue row with no
`reviewer_ruling` when its suggestion is `reservoir`, `natural` or `short` and
its traced basin holds a published reservoir or at least one inventoried dam.
Each such row is published `shaped`, `pending_formal_ruling`, directed
2026-11-16. Its basis says which dams were found. When their storage is under
ADR-137's 10%, the basis also says the gauge is shown as flow only with the
dams noted.

For these rows the tool does not require a record that covers 1991-2020,
since nothing is compared. ADR-168's "shaped, but no published reservoir and
storage under 10%: a person decides" hold now applies only when no dam at all
is found upstream.

**Still held**, each printed with its reason:

- `diversion` rows: their finding is a diversion, not a dam.
- `check` rows: an untraced or mismatched basin, so the dam evidence is in doubt.
- `exclude` rows, waterwork names, open name checks and duplicate names, as in ADR-168.
- A series that reports no flow in the refresh's fetch window, as in ADR-168.
- `natural` rows with no dam upstream that fail the reference or record-length
  screens. A dam is not their finding.

**No change to the page or the method.** The tier, the sentence and the
grouping are ADR-136's and ADR-145's. No gauge becomes natural under this
record, and no natural gauge's percentiles change.

## Rejected alternatives

- **Publish every review row.** `diversion` and `check` rows carry findings
  other than a dam. Brian's direction was about dams.
- **A separate "dams upstream" tier.** `shaped` already means exactly that on
  the page. A second tier would add a word without adding a fact.
- **Compare low-storage gauges with normal.** The rule that a gauge under 10%
  may be natural stays ADR-137's. It still needs a reference gauge and a long
  record, and the review queue is where a person decides it.

## Consequences

- Measured on 2026-11-16 with `--plan`: 86 rows to add. 83 are review rows
  with dams upstream. The other three are Ashley Creek near Vernal, which
  ADR-168 held as a ruled reservoir row whose dams hold under 10%, and the two
  ADR-168 gauges whose series reported no flow, tried again. Three
  dam rows are held for an open name check.
- Ashley Creek, held at Brian's choice on 2026-11-15, is now published, since
  dams are upstream of it. This record supersedes that hold.
- `rivers.json` and `river_history.json` grow by about 60%. The daily refresh
  makes two keyed requests per gauge, about five minutes in all.
