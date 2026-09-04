# ADR-107: Publish Scofield at its reviewed waterbody point

## Status

Accepted

## Date

2026-09-04

## Context

ADR-106 left Scofield's published coordinate unresolved. Its old point,
39.77656, -111.05074, lies outside the reservoir. The dam inventory identifies
the outlet separately, and ADR-096 requires keeping the published waterbody
point distinct from that outlet.

The coordinate review retrieved the USGS NHDPlus HR NHDWaterbody polygon
named **Scofield Reservoir**, `permanent_identifier=37983005`, on 2026-09-04
from [the USGS waterbody service](https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer/9).
An interior-point proposal was calculated in local UTM coordinates with a
10 metre search tolerance, favoring clearance from the mapped shoreline.
The rounded point was checked for containment. Esri's USA Detailed Water
Bodies publication also contains the point in its named Scofield Reservoir
polygon. These are reference shorelines, not today's wetted extent.

The user explicitly approved latitude **39.76315**, longitude **-111.15614**
for Scofield alone.

## Decision

Set the published point for RISE station **727** to **39.76315, -111.15614**
in `BASE_RISE_RESERVOIRS`, its existing reviewed coordinate owner. Generate
the published payload through `refresh_reservoirs.py --rebuild-points 727` and rebuild its
assistant index through `tools/build_assistant_indexes.py`.

Keep the independent dam/outlet coordinate in `capacities.json` at
**39.78681, -111.11991**, NID **UT10133**. Drainage continues to use that
outlet. The new waterbody point was checked against the county service and
remains in **Carbon County, Utah (49007)**.

## Alternatives considered

**Use the dam as the published point.** Rejected because the approved point
represents the waterbody; the outlet remains a separate geographic fact.

**Keep the old point.** Rejected because the named waterbody polygon does
not contain it and the user approved the replacement after reviewing it.

**Apply the other six proposals together.** Rejected because this approval
names Scofield only.

## Consequences

Scofield's map marker, displayed coordinates and point exports move to the
reviewed reservoir interior. Its station identity, capacity, county, outlet,
and hydrologic assignments retain their existing meanings. The targeted
rebuild reads selected coordinates from the reviewed roster, uses committed
geography, and preserves observations, freshness fields, withdrawals, and the
storage refresh timestamp. It refuses unknown or unpublished station IDs;
county assignments must already be reviewed for the new point. The older
point-verification CSV is evidence about
the earlier coordinate; this record documents the subsequent correction.

This completes the Scofield coordinate decision left open by ADR-106. It
applies ADR-096 and supersedes no general architecture rule.
