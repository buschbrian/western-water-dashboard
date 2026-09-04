# Operating-restriction review

**Reviewed:** 2026-09-04  
**Purpose:** measure the likely roster impact of ADR-111 before changing a
published denominator.

## What is known

California's Division of Safety of Dams published 47 restricted dams in its
September 2025 report. A conservative name-and-project comparison found at
least 15 currently published dashboard reservoirs in that list:

| Published reservoir | Restricted dam |
|---|---|
| Calero Reservoir | Calero |
| Crane Valley | Crane Valley Storage |
| El Capitan Dam | El Capitan |
| Gem Lake | Gem Lake |
| Haiwee | Haiwee |
| Lake Hodges | Lake Hodges |
| Leroy Anderson | Leroy Anderson |
| Lake McCloud | McCloud |
| Morena Dam | Morena |
| Murray Reservoir | Murray |
| Relief | Relief |
| San Andreas | San Andreas |
| Irvine Lake | Santiago Creek |
| Lake Pillsbury | Scott |
| Tinemaha Reservoir | Tinemaha |

Coyote Lake is also subject to an operator-published restriction, although it
does not appear in the September 2025 state list. Guadalupe is restricted but
its dormant CDEC series is already held. Vail is restricted and remains a
candidate. Almaden is restricted but is not in the storage roster.

This makes the minimum current impact **16 published reservoirs**, plus Vail
if admitted. The count is a floor because this pass used one state's central
list and did not yet audit restrictions in every western state or federal
project.

## Magnitude established from a current operator source

Valley Water's January 2026 plan gives exact limits for three published
reservoirs:

| Reservoir | Dashboard full level | Current restricted level | Change |
|---|---:|---:|---:|
| Leroy Anderson | 89,073 af | 3,159 af | -85,914 af (-96%) |
| Calero | 9,850 af | 4,472 af | -5,378 af (-55%) |
| Coyote | 22,541 af | 11,843 af | -10,698 af (-47%) |
| **Combined** | **121,464 af** | **19,474 af** | **-101,990 af (-84%)** |

Vail would use 31,395 acre-feet while its restriction is active and retain
45,207 acre-feet as physical capacity.

These changes would raise each reservoir's percent full and reduce the
combined full level of its drainage area. They do not change storage in
acre-feet, seasonal medians or storage changes.

## Evidence still required

The state report identifies affected dams, restriction dates and reasons but
usually does not give the restricted acre-foot volume. Each remaining row
therefore needs an owner or regulator source that supplies:

- the restricted elevation and an authoritative elevation-storage table, or
  the restricted volume directly;
- the restriction's effective date and current status;
- physical capacity retained separately; and
- enough identity evidence to connect the operator record to the published
  station.

No denominator should change from the state list alone.

## Historical behavior

The current client divides all twelve displayed monthly values by today's one
capacity. That is harmless while capacity is stable and wrong across a dated
restriction or enlargement. ADR-111 therefore uses a compact list of capacity
versions. The monthly client selects the interval containing the month-end
observation; current cards and rollups select the interval containing `as_of`.
Storage and normals remain stored once in acre-feet.

For Success Lake this means the pre-enlargement full level remains attached to
observations before the March 2025 enlargement and 112,000 acre-feet applies
afterward. The precise earlier operator level and transition date still need
to be committed with the implementation.

## Sources

- [California DSOD reservoir restrictions, September 2025](https://water.ca.gov/-/media/DWR-Website/Web-Pages/Programs/All-Programs/Division-of-Safety-of-Dams/Files/Publications/Annual-Data-Release/2025/DAMS-WITHIN-JURISDICTION-OF-THE-STATE-OF-CALIFORNIA-RESERVOIR-RESTRICTIONS-SEPTEMBER-2025.pdf)
- [California jurisdictional dams GIS service](https://gis.water.ca.gov/arcgis/rest/services/Structure/i17_California_Jurisdictional_Dams/MapServer/0)
- [Valley Water January 2026 implementation-plan packet](https://assets.valleywater.org/files/2026-03/03122026%20SPOC%20Agenda%20Packetv2.pdf)
- [Rancho Water Vail operating chart](https://www.ranchowater.com/DocumentCenter/View/1869)
- [USACE Success Lake completion report](https://www.dvidshub.net/news/500088/success-lake-capacity-increased-with-completion-critical-flood-risk-management-project)
