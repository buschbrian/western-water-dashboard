# ADR-095: Order Storage map place filters from state to area

## Status

Accepted

## Date

2026-08-23

## Context

ADR-091 replaced Drought's mixed **Where** and **Drainage area** menus with a
coarsest-to-finest sequence: State, County, Area size and one hydrologic tier.
ADR-094 applied the same sequence to Snowpack, without County because its site
payload has no verified five-digit county identity. The Storage map still used
ADR-084's two mixed menus.

That left the three maps asking the same place question in different orders.
On Storage, Area size followed a menu that already mixed regions, subregions
and basins. The reader chose a hydrologic tier before meeting the control that
said which tier the map drew. County was absent even though every reservoir
has the reviewed five-digit waterbody assignment established by ADR-058.

Storage also has a scope distinction the other maps do not share. State
narrows the roster and changes the totals. County and hydrologic area are
analysis filters: they leave every reservoir on the map, dim the ones outside
the choice, narrow the list and table, and leave the totals unchanged. A
matching control order must not collapse those different effects.

The Storage charts still use the two mixed menus. Their filter bar is a
different surface and no change to it is needed to make the three maps
congruent.

## Decision

**The Storage map orders its place controls as State, County, Area size, then
the hydrologic area at that size.**

- State is the existing waterbody-state scope. Choosing a new state clears
  County and hydrologic area before the page follows its normal full-navigation
  path.
- County appears only after a state is chosen. It uses the reservoir's
  reviewed five-digit `county_fips` as identity and its published county name
  only as the label.
- Area size keeps its existing full navigation because it changes which
  boundaries the map draws. It keeps State and County and clears both public
  hydrologic-area spellings, `?area=` and `?drainage=`.
- The last control is labelled Region, Subregion or Basin from Area size and
  offers only that exact tier. Its choices come from the full published roster
  with both dominant reservoirs included, narrowed first by State and then by
  County. A dominant-reservoir switch never removes a place from a menu.
- County and the hydrologic area remain analysis filters. They dim the other
  reservoirs, narrow the list, table and ranking chart, and do not change the
  storage total or the drawn roster.
- A County change clears a hydrologic choice that has no matching reservoir.
  A dead County or hydrologic link falls back to the wider honest view rather
  than filtering everything to grey.
- `?county=` is a page-local five-digit FIPS parameter and does not enter the
  portable navigation set. `?state=`, `?area=`, `?drainage=` and `?level=`
  keep their meanings. The canonical Storage filter writer uses
  `?drainage=`; saved `?area=` links remain readable.
- A saved link carrying a coarser hydrologic area at a finer drawn level still
  filters by code prefix. The exact-tier control shows every area until the
  reader makes a new choice at that tier.

The Storage charts keep ADR-084's mixed-menu presentation. This record changes
only the Storage map.

## Alternatives considered

**Keep the Storage map on ADR-084's mixed menus.** Rejected because the three
maps would keep different place orders and Storage would continue to present
all hydrologic tiers before Area size.

**Make County and hydrologic area roster scopes.** Rejected because that would
change published Storage behaviour. These controls have always answered an
analysis question against the wider map: matching reservoirs are emphasized,
the others stay visible, and the total remains the wider total.

**Let dominant-reservoir switches narrow the place choices.** Rejected because
those switches answer whether a reservoir enters a total, not whether a place
exists. A reader must be able to choose Lake Powell's place before deciding
whether Lake Powell enters a comparison.

**Reject a coarser saved area when the page draws a finer tier.** Rejected
because code-prefix links are an existing public contract. The control can
honestly show every exact-tier area while the older, coarser filter remains in
force.

## Consequences

The three maps now use the same coarsest-to-finest place flow. Snowpack omits
County for a documented identity reason; Drought resolves county-to-whole-area
intersection; Storage filters reservoirs by their reviewed county point. The
labels and order match while each map keeps its own measurement semantics.

The Storage URL state gains County. The map layer carries `county_fips`, and
the predicate used by the list and table is held against the layer clause in
unit tests so they cannot disagree. The readiness signal reports the resolved
County separately from the hydrologic area.

The browser suite must hold the control order, County's dependence on State,
the exact-tier area options, dependent clearing, deep-link restoration and
the unchanged dimming summary. The map canvas still cannot be visually
confirmed in headless Chromium; the suite can confirm its controller and DOM
state, not its pixels.

## Related

- Supersedes ADR-084 for the Storage map. ADR-091 and ADR-094 already
  superseded its Drought and Snowpack presentation; ADR-084 remains history
  for the Storage charts.
- Keeps ADR-029's Storage filter semantics and ADR-011's distinction between
  state scope and analysis filters.
- Keeps ADR-058's five-digit county identity and waterbody assignment.
- Keeps ADR-064's full navigation for Area size and the existing public URL
  meanings.
