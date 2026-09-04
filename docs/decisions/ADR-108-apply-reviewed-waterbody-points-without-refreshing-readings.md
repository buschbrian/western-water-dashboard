# ADR-108: Apply reviewed waterbody points without refreshing readings

## Status

Accepted.

## Date

2026-09-04

## Context

The point review found published coordinates outside the named mapped
waterbodies. The reviewer explicitly approved the following six replacements,
one reservoir per approval, and requested one batch. These are waterbody
locations; the separate dam or outlet remains the drainage assignment point
(ADR-058, ADR-096). The source is the USGS
[NHDPlus HR Waterbody layer](https://hydro.nationalmap.gov/arcgis/rest/services/NHDPlus_HR/MapServer/9),
queried on 2026-09-04. Its shoreline is reference hydrography, not a claim about
the current wetted extent.

## Decision

Apply only these reviewed coordinates, in WGS84 latitude/longitude order:

| Reservoir | Station | Latitude | Longitude | Waterbody identifiers |
|---|---|---:|---:|---|
| Folsom Lake | 10774 | 38.72149 | -121.13295 | 63434918, 61233879 |
| French Lake | FRL | 39.41268 | -120.53357 | 44585939 |
| Lake Crowley | CRW | 37.60286 | -118.74425 | 77316302 |
| Frenchman Dam | FRD | 39.90711 | -120.18462 | 62406857 |
| Kolob Reservoir | 09UTKOLB:UT:BOR | 37.43699 | -113.04763 | 33032433 |
| Pleasant Valley Reservoir | PVR | 37.42555 | -118.54362 | 77316788 |

The proposals use an approximate maximum-clearance interior point in the
largest connected named polygon, calculated in local UTM with a 10 m search
tolerance. The coordinates were rounded to five decimal places and checked
again for containment before review. Approval is specific to these points;
it does not adopt automatic relocation as a general rule.

Update the owning admitted RISE, CDEC and AWDB rosters. Keep all capacity and
dam evidence unchanged. Use `refresh_reservoirs.py --rebuild-points` to apply
selected roster coordinates through the geography generator, preserving
observations, freshness, withdrawal notices and the refresh timestamp.
Unknown or unpublished station IDs fail before writing. Rebuild the
assistant reservoir index from the resulting payload.

Counties still follow the published point. The detailed Census county service
resolves Folsom's approved point to El Dorado County (06017), replacing
Sacramento County (06067). The other five county assignments are unchanged.
`build_county_assignments.py --only` merges selected assignments and stamps
their individual retrieval date; it preserves the full-run retrieval date
and every unselected assignment. An unanswered lookup refuses the write.
Rebuild changed county assignments before rebuilding published points.

## Alternatives considered

Using the dam as the published point would discard the reviewed waterbody
choice and conflate two geographic facts. Editing generated payloads directly
would be overwritten on the next refresh. Running the daily observation fetch
would mix unrelated new readings and freshness changes into this review.

## Consequences

The six map and exported waterbody points move. Folsom's county filter follows
its new location. Outlet-based drainage assignments and storage readings stay
unchanged. The historical point-verification files describe the earlier
coordinates; this record is the evidence for the replacements.

This implements ADR-058 and ADR-096 for the listed points and supersedes no
accepted record. Scofield is outside this batch and remains in its separate
pending change. ADR-107 is reserved by that change.
