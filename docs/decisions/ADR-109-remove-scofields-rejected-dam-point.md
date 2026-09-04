# ADR-109: Remove Scofield's rejected dam point

## Status

Accepted.

## Date

2026-09-04

## Context

The reviewer confirmed all seven proposed waterbody points and clarified that
Scofield's dam point is wrong and must also be removed. This supersedes
ADR-107's decision to retain that point. The six other waterbody corrections
are already recorded in ADR-108; their dam points are unchanged.

## Decision

Publish Scofield (RISE station 727) at **39.76315, -111.15614**, the approved
interior point in USGS NHDPlus HR waterbody **37983005**. The
[USGS waterbody layer](https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer/9)
and the proposal method are recorded in ADR-107.

Remove Scofield's `dam_lat` and `dam_lon` from the capacity table through its
owning builder. `pipeline.roster.REJECTED_DAM_POINTS` records the review;
both the builder and the runtime loader apply it. The legacy dam-point repair
tool also applies it, so another inventory fetch cannot reinstate the rejected
point. Retain the capacity values and inventory identity: the reviewer
rejected a coordinate, not the storage denominator.

Use the existing published-point fallback for HUC assignment, explicitly
labelled `published_point`. Scofield remains in HUC-6 **140600**, HUC-8
**14060007**, and Carbon County **49007**. A point inside the lake is not
presented as a reviewed outlet.

Remove the upstream trace made from the rejected dam point. A probe at the
approved lake interior selected COMID 3907395 and a 47-square-mile basin,
compared with the former 156-square-mile trace at COMID 3907377. It dropped
snow station 1216:UT:SNTL. This does not establish the reservoir's complete
upstream set. Until a replacement outlet is reviewed, the upstream builder
records `unreviewed_outlet` with a reason and no upstream sets. An explicitly
rejected outlet is different from an ordinary missing point: do not snap the
lake interior and treat its partial basin as a complete trace.

`build_capacity_table.py --apply-point-reviews` applies the committed review
without fetching or changing capacity values. `build_upstream_index.py
--update 727` merges just Scofield's replacement status, preserving other
traces and their full-run retrieval date. It stamps the selected trace's
review date and refuses service failures without replacing existing data.
The frontend validator and types distinguish screened traces, whose station
lists can be absent, from successful traces, which require both lists.
Otherwise one screened row would reject the whole upstream index.
Regenerate the reservoir payload, reference export and assistant index through
their owners, preserving all storage readings and freshness metadata.

## Alternatives considered

Keeping the dam point conflicts with the clarified review. Deleting it only
from a generated file would allow the next rebuild to restore it. Moving it
to the approved lake point would falsely describe a waterbody point as an
outlet. Publishing the 47-square-mile upstream result would treat a partial
basin as the whole drainage area. Removing capacity evidence would extend the
review beyond its stated scope.

## Consequences

All seven approved waterbody corrections are applied. Scofield has no reviewed
dam coordinate, and its upstream information is unavailable pending a reviewed
outlet. Its HUC areas, county and storage readings remain unchanged. Only
ADR-107 is superseded; ADR-058's distinction between waterbody and outlet
points remains in force.
