# ADR-094: Order Snowpack place controls and separate site options

## Status

Accepted

## Date

2026-08-23

## Context

ADR-084 put Snowpack's states, regions, subregions and basins into two menus.
ADR-085 then limited the drainage menu to the drawn tier and coarser tiers
because Snowpack can gate a row honestly only where its current payload has a
publishable figure. The result still made Area size follow a mixed-level
Drainage area menu. The reader had to choose a tier twice and in reverse
order: first as a drainage row, then as the size of the areas drawn.

The same filter card also mixed two scopes. State, drainage area and area size
change every Snowpack figure. Site name, elevation and reporting state narrow
only the measurement-site table. Show every site reset those table filters,
but sat below every control as if it reset the selected place too.

The five summary cards had the layout defect ADR-093 fixed on Drought. Their
values were forced onto one line and their notes had no shared row. At phone
widths the two cards on a lower row became taller than the cards above them.

Snow sites still publish county names without five-digit FIPS codes. ADR-084
records that as unresolved identity work. A sequential Snowpack control must
not turn those bare names into a county axis that breaks the shared code
contract.

## Decision

**Snowpack orders its place controls as State, Area size, then one hydrologic
tier, and puts table-only controls in a Site options pane.**

- The last place control is labelled Region, Subregion or Basin from the
  chosen area size. It offers only that tier.
- Each offered area must have a publishable Snowpack figure in the current
  payload. ADR-085's gating rule stays; only its coarser rows disappear.
- A new state clears the selected hydrologic area. A new area size also clears
  it before the new tier is offered. The existing `?state=`, `?area=` and
  `?level=` meanings do not change.
- County remains absent. Site name or county stays a text search until the
  site counties have verified FIPS identities.
- Site name or county, Elevation and Reporting form one aligned Site options
  grid. Show every site is the outlined action in that pane's upper-right
  corner and continues to reset only those three table filters.
- Snowpack summary cards reserve matching heading, value and note rows. The
  newest, season-high, late-data and season notes use shorter text. No
  published value, reporting floor or date changes.

## Alternatives considered

**Keep the mixed-level Drainage area menu.** Rejected because Area size then
appears after the tier it decides, and coarser rows repeat choices the size
control already offers directly.

**Add a county select keyed by the published county name.** Rejected because
county names are not stable identifiers and are not the five-digit values
used by the other county filters. Search already makes those names useful
without claiming they form a verified place axis.

**Leave the site controls in the place row.** Rejected because they narrow
only the table. Their reset action must not read as if it widens the map,
curve and summary cards.

## Consequences

Snowpack now has the same coarsest-to-finest place flow as Drought, with the
county step omitted for a stated data reason. Changing Area size is one clear
navigation followed by one tier-specific choice. The site-table controls and
their reset action form a separate pane inside the same card.

Saved links keep their parameter meanings. A link carrying a coarser area at
a finer drawn level still opens on that area; its tier control shows every
area until the reader makes a new exact-tier choice. The browser suite must
hold the control order, pane ownership, summary-card containment and phone
layout.

## Related

- Supersedes ADR-084 only for Snowpack's control presentation.
- Supersedes ADR-085 only for the coarser rows in Snowpack's drainage menu;
  its publishability gate remains.
- Follows ADR-091 and ADR-093's sequential-control and aligned-summary
  patterns without changing Drought.
