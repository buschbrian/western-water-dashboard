# ADR-112: Publish terminal lakes as a separate water type

- Status: Accepted
- Date: 2026-09-04
- Supersedes: ADR-078

## Context

ADR-078 made every published water a reservoir because every roster member
held water behind a dam, reported storage and had a reviewed full level. It
named Walker Lake as the case that would require the rule to change.

Walker Lake now has the required measurement evidence. USGS publishes daily
elevation and volume and documents the bathymetric relation used since
1 October 2014. It is also a natural terminal lake: water leaves its closed
basin chiefly through evaporation, and it has no dam or engineered full pool.

Great Salt Lake, Pyramid Lake and Mono Lake show why these waters cannot be
forced into the reservoir model. Great Salt Lake has separately measured arms;
Pyramid Lake currently has a strong elevation series but no reviewed modern
volume relation in this project; Mono Lake has a regulatory restoration target
that is not a physical capacity.

## Decision

The dashboard may publish `natural_terminal_lake` records as a water type
separate from `reservoir`.

A terminal lake may publish current elevation, volume, change and a same-date
seasonal rank where the source supports them. It has no dam point, capacity or
percent full. A restoration or regulatory target may be shown only as a named
target with its authority and date; it is never stored as capacity.

Terminal lakes do not participate in reservoir count, combined storage,
combined full level, percent-full, or reservoir-normal rollups. Their summaries
are headed and calculated separately. A waterbody with materially different
sub-basins or arms must retain those measurement units rather than collapsing
them into one point and one volume.

Geography requires a reviewed waterbody point and a reviewed closed-basin
assignment. No outlet or dam point is invented. Upstream tracing must begin
from a reviewed inflow or basin representation appropriate to the lake rather
than from an interior point passed to a downstream network service.

## Consequences

The current reservoir payload and UI remain unchanged until a typed lake
payload and separate rollups exist. Walker Lake is the first implementation
candidate. Pyramid Lake is a second elevation-only candidate. Great Salt Lake
needs an arm-aware design before admission.

The methods glossary will change when the first lake is published. Until then,
its current statement that every published water is a reservoir remains true.

## Rejected alternatives

- **Use a restoration target as capacity.** It would present policy progress
  as a physical percent full.
- **Add lake volume to reservoir storage.** A large natural lake would dominate
  a managed-storage total while answering another question.
- **Publish elevation as percent of a datum.** The ratio depends on an arbitrary
  vertical origin and has no hydrologic meaning.
- **Assign a synthetic outlet.** It would create false drainage and dam
  evidence for a closed basin.
