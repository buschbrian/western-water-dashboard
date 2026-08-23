# ADR-092: Separate drought place controls from presentation controls

## Status

Accepted; layer-control placement superseded by ADR-093

## Date

2026-08-23

## Context

ADR-091 put every drought control into one card and gave map options a final
row. The first grid still mixed two questions. State, County, Area size and the
chosen hydrologic area answer where. Show areas with and Order by answer how
the selected results are presented. Keeping all six in the first grid made
the condition and order controls read as more land-scope choices.

The two optional-layer checkboxes then used the same height and equal-width
columns as the selects. They looked like primary filters, left too much empty
space around short controls and made the map-options row align poorly.

## Decision

**The drought filter card has a place pane followed by a Map options pane.**

- The place pane contains only State, County, Area size and the hydrologic
  area at that size.
- Map options contains Show areas with, Order by and Map shows in one aligned
  control grid.
- Show reservoirs and Show snowpack sites sit in a smaller layer-control row
  below that grid. Their checkbox keeps its native accessible label.
- At wide widths the three selects share equal columns. At phone widths they
  stack to one column, while the two small layer controls share a row.
- Show areas with and Order by keep their current URL state and still update
  every result that they updated before. This is a visual regrouping, not a
  change to filtering or sorting meaning.
- The layer checkboxes and Map shows remain local display state. If the map
  fails, only controls that require the map are hidden; condition and order
  stay available for the figures below.

## Alternatives considered

**Keep condition and order with the place controls.** Rejected because it
continues to mix selected geography with presentation in one visual group.

**Put Map options in a separate card.** Rejected because the drought page has
one control flow and ADR-091 already found that detached controls read as an
unrelated form.

**Make every map control an equal full-size tile.** Rejected because a binary
layer choice needs less space than a select and the large tiles caused the
alignment problem this decision addresses.

## Consequences

The first row now reads as one complete place sequence. The second pane owns
the result and map presentation controls, with the optional layers visibly
lighter than the three selects.

No payload, source, URL parameter or drought measurement changes. Browser
coverage must verify the grouping, compact checkbox height and aligned wide
and phone layouts.

## Related

- Supersedes only ADR-091's Map options grouping.
- Keeps ADR-091's State, County, Area size and hydrologic-area sequence.
