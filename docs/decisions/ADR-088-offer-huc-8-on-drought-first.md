# ADR-088: Offer HUC-8 on drought first

## Status

Accepted; drought menu presentation superseded by ADR-091

## Date

2026-08-23

## Context

`west-huc8` already exists as a reviewed scope: 571 subbasins across
hydrologic regions 14 through 18. It was deliberately registered with
`published=False` while its transfer cost and the surfaces able to support it
were decided.

The reference payload publishes roster metadata, not geometry. Publishing the
HUC-8 roster changes `reference.json` from 23,931 to 39,297 bytes gzip, an
increase of 15,366 bytes. The actual outlines remain runtime requests to the
hosted Watershed Boundary Dataset; HUC-8 uses the Living Atlas service, as
ADR-073 already records.

The 30,000-byte reference limit predates this fourth roster. A structural test
separately refuses polygon fields and requires each `bbox` to remain four
numbers, so the size limit is not the only protection against geometry
returning.

Drought coverage can be computed by the existing even-odd sampler at the
finer key. Storage would need an interface and aggregation review, and snow
cannot honestly gate a finer row without publishing the finer level's
measurement availability (ADR-085).

The convergence check over the committed HUC-8 boundaries compared the
existing 0.002-degree step with a 0.001-degree reference. Of 6,259 published
shares, 144 (2.3%) crossed a tenth-point rounding boundary. Mean absolute
error was 0.0025 percentage points; the single worst boundary case was 0.5.
This is higher rounding sensitivity than HUC-6, as expected for smaller
units, while the average error remains far below the published tenth.

## Decision

**Publish HUC-8 roster metadata and offer it on drought first.**

- `west-huc8` becomes a published reference scope. Each of its 571 entries
  carries only code, name, states, and bounding box.
- The gzip ceiling for `reference.json` becomes 64,000 bytes. The no-polygon
  structural assertions remain mandatory.
- The reference export publishes a drought-specific scope map. Shared storage
  and snow offerings remain levels 2, 4, and 6; drought offers 2, 4, 6, and 8.
- The drought level control labels level 8 **Subbasins**, and the drought
  Drainage area menu may select an eight-digit row.
- `data/drought/usdm-huc8.json` is computed daily by the existing coverage
  estimator from the same weekly polygons and committed boundary file. This
  is the same method at a finer key, so the method version does not change.
- HUC-8 starts without an archive. The weekly file therefore carries no
  `previous` block and the page makes no HUC-8 week-over-week claim. A
  ten-year archive at 571 areas was estimated at about 30 MB and needs a
  separate decision before it is published.

## Alternatives considered

**Put polygons in `reference.json`.** Rejected by ADR-048 and by cost. The
client already asks the hosted service for view-quantized shapes, so shipping
the committed geometry would be duplicate work on every page load.

**Offer HUC-8 on every surface together.** Rejected because the condition is a
figure behind every offered area, not a boundary that can be drawn. Drought
meets it now; storage and snow have separate interface and payload questions.

**Raise the limit only to the measured 40 KB.** Rejected because a ceiling
with almost no headroom turns ordinary metadata growth into an emergency. A
64 KB limit remains small beside the site's primary client payloads and still
fails dramatically before geometry can return.

## Consequences

The daily drought refresh gains one no-history computation and its pair check
and atomic restore include the new file. A drought link may carry `?level=8`
and an eight-digit `?area=`. Navigation to storage or snow coarsens that place
to its enclosing basin and removes the unsupported level rather than opening
an empty page.

Storage and snow keep their existing level controls and methods. HUC-8 on
either one still needs its own accepted record.

## Related

- Extends ADR-073's offered levels for drought only.
- Extends ADR-084's drainage menu with a drought-only fourth tier.
- Leaves ADR-085's snow gating unchanged.
- Retains ADR-048's roster-not-polygons contract.
