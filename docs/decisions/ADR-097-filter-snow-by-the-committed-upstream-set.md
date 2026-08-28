# ADR-097: Filter snow by the committed upstream set

## Status

Accepted

## Date

2026-08-27

## Context

ADR-077 committed an unordered set of snow stations upstream of each
reservoir and named a Snowpack filter as the next surface. The reservoir page
could report the count but sent the reader nowhere to inspect those stations.

Snowpack figures cannot be filtered by copying published basin percentages.
An upstream set may keep only some stations in a basin, so every curve, map
value and headline has to be rebuilt from the surviving station series using
ADR-081's estimator. The new set also has to coexist with selected place,
drawn level and the existing `?site=` detail link without changing the public
meaning of any of them.

## Decision

**Snowpack accepts `?upstream=<reservoir source_station_id>` and rebuilds the
page from the current snow stations in that committed upstream set.**

- `upstream` is a Snowpack-local URL parameter keyed exactly like
  `upstream_index.json`. It does not enter the portable state shared between
  pages.
- A reservoir page links to Snowpack with `?state=all` as well as `upstream`.
  The explicit state prevents the recipient's remembered place from silently
  removing stations before the upstream set is applied.
- An explicit `?state=` or `?area=` supplied with an upstream link is still a
  selected place. The current sites are the intersection of that place and
  the committed upstream set. `?level=` continues to decide how those sites
  are grouped.
- Every surviving rollup is recomputed from station series with the existing
  ratio of summed snow water to summed normal water. Each area keeps its
  published reporting floor. Published rollup percentages are never averaged.
- A valid `?site=` link is more specific than `upstream`. If the linked site
  is outside the set, the upstream filter is not applied and the page states
  why.
- A missing index, missing trace or screened trace does not become an empty
  snow answer. The page keeps the resolved place, states that the upstream
  set could not be read, and offers a clear action.
- The active summary reports how many current sites remain. When the committed
  set names a station absent from the current snow payload, the summary says
  how many indexed sites are missing.
- The set stays unordered containment. Visible text says **upstream of** and
  never **feeds** or **supplies**. This decision does not infer flow order.

## Alternatives considered

**Filter only the station table.** Rejected because the map, headline and
season curves would then describe a different set from the table.

**Average the published basin percentages of matching areas.** Rejected
because a basin can be only partly selected and because ADR-081 requires one
division after summing water and normals.

**Let a remembered place narrow a reservoir's direct link.** Rejected because
two recipients could follow the same link and see different upstream sets.

**Make upstream portable to every page.** Rejected because Storage, charts
and Drought have no equivalent station-set view. Carrying the parameter would
look like shared meaning where none exists.

**Treat a missing trace as no upstream snow.** Rejected for the same reason
ADR-077 screens a failed trace rather than publishing an empty set: unknown is
not none.

## Consequences

Reservoir pages with upstream snow now link to an inspectable Snowpack view.
The Snowpack bootstrap makes one extra runtime request only when the URL asks
for this filter. Readiness reports the requested reservoir identifier, the
current matching-site count and whether the filter was applied, deferred to a
linked site, or unavailable.

The ordered-flow question remains deferred. This record implements only the
already-published unordered membership from ADR-077 and supersedes its
historical statement that the Snowpack surface was not yet built.

## Related

- Extends ADR-077's committed upstream-set decision.
- Keeps ADR-081's snow estimator and reporting floors.
- Keeps ADR-064's drawn level and the selected-scope meanings documented in
  `docs/architecture/scopes.md`.
