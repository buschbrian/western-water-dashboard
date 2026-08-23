# ADR-091: Order drought place filters from state to area

## Status

Accepted; map-options grouping superseded by ADR-092

## Date

2026-08-23

## Context

ADR-084 reduced every page to a combined **Where** menu and a combined
**Drainage area** menu. On drought that produced two visible faults.

First, the Where menu offered states but no counties, even though a reader
expects a state choice to reveal the counties inside it. Drought publishes no
county drought rows, so copying the storage page's reservoir-county filter
would not repair that fault: it would filter reservoirs by the waterbody point
and present the result as land conditions.

Second, drought now offers four hydrologic levels. The combined drainage menu
therefore carries five regions, 44 subregions, 75 basins and 571 subbasins at
once. Area size sits after that menu even though it is the control that says
which of those words the map currently means. A reader meets every resolution
before the control that explains the current one.

The map options also sat as three loose controls above the filter card. They
change display rather than selected scope, but placing them outside the only
control container made the page read as two unrelated forms.

## Decision

**Drought alone uses a sequential place flow: State, County, Area size, then
the hydrologic area at that size.** Storage and snow keep ADR-084's combined
menus.

- State is its own select. Choosing a state clears a county and hydrologic area
  chosen under the previous state.
- County appears after a state is chosen. It is keyed by five-digit FIPS and
  lists the counties published by the detailed USA Census Counties layer.
- A county does not produce a county drought total. The client asks the hosted
  Watershed Boundary Dataset which units at the drawn level intersect the
  county, then selects those whole units from the committed weekly drought
  payload. Visible text says that each area is whole and is not cut at the
  county line.
- The county list does not hold the page's figures. It fills independently
  after the state-scoped page renders. A shared link that names a county must
  resolve the intersection before rendering, because showing wider figures
  first would make the first paint false.
- Both county requests have a deadline. If an unchosen list fails, the county
  control says it is unavailable. If a chosen county fails, the page keeps the
  wider state or hydrologic scope and says that the county could not load.
- County geometry is generalized to 0.001 degrees only for the selection
  query. It is not drawn and no drought share is computed from it. A probe of
  Utah County reduced the geometry from about 450 KB to 12 KB and returned the
  same HUC-2, HUC-4, HUC-6 and HUC-8 matches.
- Area size stays a navigation because it changes the files and figures the
  page reads. A size change clears the hydrologic area chosen at the previous
  tier, keeps state and county, and the following control offers exactly one
  tier: Region, Subregion, Basin or Subbasin.
- `?county=` is page-local and does not enter the portable navigation set.
  `?state=`, `?area=` and `?level=` keep their existing meanings. Existing
  links without county keep their meaning.

**Map options are the final row inside the filter card.** Show reservoirs,
Show snowpack sites and Map shows remain display-only state and are not written
to the URL. They are disabled until the map is ready and hidden if the map
fails.

## Alternatives considered

**Publish county drought totals.** Rejected. It would add a new geographic
measurement, payload family and daily computation when the requested flow can
honestly select the existing drainage-area figures.

**Use the counties assigned to reservoirs.** Rejected. Those assignments
answer where a published waterbody point sits. They omit counties without a
tracked reservoir and do not answer which drought drainage areas cross a
county.

**Keep every hydrologic tier in one menu.** Rejected on drought. With HUC-8 it
puts 695 named areas behind one control and makes the reader choose a
resolution before meeting Area size.

**Keep map options above the card because they are not filters.** Rejected.
Their URL behavior stays separate without making their visual container
separate; a labelled final row states the change of question.

## Consequences

The drought page gains one optional runtime query for a chosen state's county
list and, only after a county is chosen, one county-boundary query plus one WBD
intersection query. Weekly drought payloads, methods and generated files do
not change.

A county filter selects whole drainage rows. It must never be described as the
share of a county in drought. The county and WBD services become selected-scope
dependencies on this page, with the same bounded failure discipline as the
hosted map context.

ADR-084 remains current for storage and snow. ADR-088's HUC-8 offer remains
current; only its across-level drought-menu presentation is replaced.

## Related

- Supersedes ADR-084's drought control presentation.
- Supersedes ADR-088's across-level drought menu presentation, not its HUC-8
  data or scope decision.
- Keeps ADR-064's full navigation for a level change.
- Uses ADR-034's detailed Census county source and bounded failure rule.
