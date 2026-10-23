# ADR-121: Bound recent conditions to a static-data pilot

- Status: Accepted
- Date: 2026-10-23
- Supersedes: ADR-117's prohibition on a new measured domain, only for this pilot
- Retains: ADR-117's versioning, release approval and other scope boundaries

## Context

Readers following weekly drought changes also want to understand recent
precipitation and river response. Brian authorized a small Utah pilot,
current stable dependencies, use of the existing USGS key, and use of his
existing Cloudflare R2 access. Low operating cost, fast pages, scientific
provenance and shareable views remain requirements.

A six-request probe returned two gauges' daily series, three mountain sites'
snow and precipitation series, and one precipitation GeoTIFF. It establishes
data access, not a reviewed roster, a precipitation method or browser speed.

## Decision

Permit a bounded recent-conditions pilot using a small reviewed Utah roster,
recent precipitation and river observations, and links to the existing snow,
storage and weekly drought views. Existing published methods and saved-link
contracts remain in force. This is not an expansion of the western roster.

Fetch on a daily schedule initially. Validate and compute in Python, then
serve static snapshots. Agency request count must not depend on visits,
filter changes or chart interactions. Keep provider timestamps, units,
quality status, provenance and missing-data coverage.

Use the existing USGS pipeline credential. Use existing Cloudflare R2
infrastructure for pilot rasters and dated archives when needed, with a
dedicated bucket or an isolated `western-water-dashboard/` prefix. Never
rewrite unrelated business assets. Bucket details and credentials are
environment configuration, not committed identifiers.

Keep small JSON available through the application's established static-data
pattern. An R2 snapshot set must be complete and validated before a current
manifest refers to it; a failed refresh leaves the prior complete set.
An R2 uploader and public raster integration are not implemented by this ADR.

Upgrade the managed JavaScript and Python dependencies to current stable
releases and verify the resulting application. The October baseline is
ArcGIS 5.1.27, Calcite 5.2, TypeScript 7, Vite 8.3 and Vitest 5, with Node 26
and Python 3.14 in CI. Major version numbers are not performance evidence.

## Consequences

The pilot has no new paid compute service or visitor-triggered analysis.
Raster processing, admission, URL state, freshness and actual browser cost
still require implementation and verification. The initial extra-data budget
is 100 KB gzipped for the opening pilot view; optional raster traffic is
measured separately and never implied to fit inside that JSON budget.
Existing pages do not load pilot data unless a reader requests it.

ADR-117 is superseded only as stated above. Its application-version semantics,
human release approval and remaining scope limits continue unchanged.
The work remains on a local branch until the coordinating session publishes
it; this record neither deploys a service nor releases new measurements.

## Rejected alternatives

- Fetch agency APIs on each visit: traffic and upstream outages would become
  part of every reader's experience.
- Add a database, dynamic tile server or managed analysis platform now:
  the measured sample does not justify those operating costs.
- Treat a gauge as a reservoir or sum nested gauges: flow is a rate, has no
  full level, and downstream gauges may measure the same water.
- Adopt ArcGIS 6 from roadmap references: the verified stable release is 5.1.

## Evidence

- [Pilot plan and measured sample](../RECENT-CONDITIONS-PILOT.md)
- [ArcGIS releases](https://developers.arcgis.com/javascript/latest/release-notes/)
- [Calcite 5.2 compatibility](https://developers.arcgis.com/calcite-design-system/releases/v5-2/)
