# ADR-087: Retire the Utah reservoir scope

## Status

Accepted; browser-readiness compatibility clause superseded by ADR-090

## Date

2026-08-23

## Context

The storage map and storage charts still carried a **Reservoirs** select with
two answers: every reservoir, or Utah waterbodies only. It was a reader-facing
remnant of the Utah-only roster. The published roster and drawn geography now
cover the west, and the default already includes every published reservoir.

The site also has a current **Where** menu. Its Utah row means that a
reservoir's `waterbody_states` contains `UT`. The old scope uses the older
`intersects_utah` review field. Those facts are close, but they are not the
same contract, so silently translating one control into the other would give
an old link a new meaning.

## Decision

**The Utah reservoir-scope dimension is removed.**

- The visible **Reservoirs** select disappears from the storage map and
  storage charts.
- Reservoir scoping always begins with the whole published roster. Lake Powell
  and Lake Mead retain their independent include/exclude controls.
- `?reservoirs=utah` is no longer read or written. An old link carrying it
  opens the current western view; no compatibility notice or hidden scope is
  kept.
- The browser readiness field `geography` remains, permanently reporting
  `connected`, because readiness fields are append-only.
- Utah remains reachable through **Where**, whose waterbody-state meaning is
  unchanged.

The pipeline's `intersects_utah` field is not removed by this decision. It is
published geographic evidence and remains part of the public payload; it is no
longer a client-side scope dimension.

## Alternatives considered

**Translate an old Utah-scope link to `?state=UT`.** Rejected because it changes
the link's predicate from the reviewed intersection field to waterbody-state
membership.

**Honor the old parameter without a visible control.** Rejected because an
invisible narrowing is harder to discover and clear than the obsolete select
was.

**Keep the select for compatibility.** Rejected because normal navigation
should describe the western product that exists now, not preserve a primary
control for an earlier roster.

## Consequences

Scope types, URL parsers, summaries, tests, and control wiring lose the retired
dimension. Old Utah-scoped bookmarks deliberately widen. The two dominant-
reservoir choices remain visible and continue to state their effect on totals.

## Related

- Narrows ADR-013's reader-facing consequence; its waterbody-intersection
  classification remains published.
- Narrows ADR-062 to the two dominant-reservoir controls it still owns.
