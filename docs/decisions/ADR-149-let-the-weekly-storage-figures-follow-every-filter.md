# ADR-149: Let the weekly storage figures follow every filter

- Status: Accepted
- Date: 2026-10-31
- Supersedes: the line ADR-011 drew between a scope and a filter, as the
  storage charts page applied it to its weekly card ("the digest follows the
  scope, not the filters"); ADR-011 itself was already superseded by ADR-013,
  and the map's own totals are unchanged
- Relates to: ADR-062 (both dominant reservoirs named whatever their state),
  ADR-013 (the waterbody-state scope), ADR-095 (county and hydrologic tier as
  analysis filters on the map)

## Context

The storage charts page has a weekly card, "What moved this week", whose
storage section sums each reservoir's seven-day change. Its code comment at
`renderWeekly` gave the rule: the card followed the scope (the Lake Powell and
Lake Mead switches and the drainage area) and not the filters (state, county,
search, reporting schedule, storage class), "the same line the map draws
(ADR-011): a scope changes which reservoirs exist, a filter changes which of
them are picked out". A note under the card said so.

In use the line read as a fault. A reader who chose Colorado saw a table, a
ranking chart, a trend and a distribution of Colorado reservoirs, and beside
them a storage figure for every reservoir in the West. The note explained the
difference; it did not make the card answer the question the reader had just
asked. The owner ruled on 2026-10-31 (R2) that the card's storage figures
follow every filter on the page.

## Decision

**The weekly card's storage figures are made from the same rows as the table
and the charts**: the scope (both switches and the drainage area) narrowed by
the state, county, search, reporting and storage-class filters. The snow and
drought sections still describe the whole region, because their payloads are
not narrowed by these filters.

**The scope line stays truthful.** It counts the rows the figures came from,
and when a filter narrowed them it says of how many: "Storage covers 40 of 404
reservoirs, Lake Powell not in this view, Lake Mead not in this view." Both
dominant reservoirs are named either way (ADR-062): "excluded" when a switch
took one out, as the page's status line also says, and "not in this view"
when a filter did, so the two lines never disagree.

**The note says what the card follows**: the five filters, the two switches
and the drainage area for storage, and the whole region for snow and drought.

## Rejected

- **Keep the scope-only rule and reword the note.** The figure beside a
  filtered table would still describe other reservoirs.
- **Follow the place filters only (state and county), not search or class.**
  Every other figure on the page follows all five; a sixth rule is one more
  thing for the note to explain.
- **Narrow the snow and drought sections too.** Their place rules are their
  own pages' (ADR-064, ADR-091); a storage filter such as reporting schedule
  has no meaning for them.

## Consequences

A filter that leaves no daily reservoir gives the card's existing sentence,
"No reservoir published a weekly change, so there is nothing to compare."
`weeklyScopeText` in `src/weekly-model.ts` writes the scope line and is
unit-tested; the browser suite checks that a county filter changes the count.
The storage map's totals and ADR-095's analysis filters are unchanged.
