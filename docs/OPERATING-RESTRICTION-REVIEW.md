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

## Restriction dates, from the state report

The September 2025 report carries 49 entries and gives each one a **Dam Number,
Owner Name, Condition Assessment, Downstream Hazard Potential Classification,
Effective Date of Restriction, Reason for Restriction** and the owner's
reported planned actions. Two of the 49 are debris basins -- Santa Anita and
Sawpit, both restricted 1995-06-07 -- which is where the 47 restricted
reservoirs counted at the top of this page comes from. Both counts are right
about different things. The effective date settles what the operator
charts do not publish, and ADR-111 requires it before a restricted full level
may divide a reading.

Read against the reviewed mapping above, by owner as well as by name:

| Published reservoir | Restricted dam | Effective | Reason |
|---|---|---|---|
| Tinemaha Reservoir | Tinemaha | 1993-03-03 | Seismic |
| Haiwee | Haiwee | 2002-07-23 | Seismic |
| Calero Reservoir | Calero | 2013-02-08 | Seismic |
| Gem Lake | Gem Lake | 2013-02-14 | Seismic |
| El Capitan Dam | El Capitan | 2015-05-27 | Seismic |
| Leroy Anderson | Leroy Anderson | 2017-05-08 | Seismic |
| Lake McCloud | McCloud | 2020-01-09 | Other |
| Irvine Lake | Santiago Creek | 2020-05-08 | Other |
| San Andreas | San Andreas | 2020-08-03 | Other |
| Morena Dam | Morena | 2021-11-10 | Hydraulic |
| Lake Hodges | Lake Hodges | 2023-02-02 | Seismic |
| Lake Pillsbury | Scott | 2023-04-12 | Seismic |
| Murray Reservoir | Murray | 2023-07-19 | Seismic |
| Relief | Relief | 2024-06-02 | Other |
| Crane Valley | Crane Valley Storage | 2024-10-06 | Other |

And for the two off-roster cases the earlier pass named: **Vail** is restricted
from **2015-06-02** (seismic, Rancho California Water District), and
**Guadalupe** from **2012-04-25** (seismic, Santa Clara Valley Water District).

**Coyote is not in the state list at all**, so its operator-published
restriction still needs a date from Valley Water.

**Four of these predate the published record.** Tinemaha, Haiwee, Calero and
Gem Lake were restricted before 2015, so they have no pre-restriction reading
and their capacity history is one dated version rather than two. Vail's
restriction begins inside the record, five months after its first reading,
so it takes the ordinary two-version shape.

**The report gives no restricted level in any form.** It has no elevation
column and no volume column; DSOD restricts a reservoir by directing an owner
to hold it below a stated water surface elevation, and the report describes
that in prose about planned actions rather than as a figure. So the state list
answers the date and never the denominator, which is why the operator research
below is still required for every row.

## Two name matches that are not evidence

A mechanical comparison of all 49 dam names against the published roster
proposes two matches that the owner column refuses, and they are recorded here
so the next pass does not re-propose them:

- **Bear Gulch** is California Water Service Company's dam on the San Francisco
  peninsula. It is not **Bear Lake**, which is PacifiCorp's on the Utah-Idaho
  line. The names are close and the waters are 1,100 km apart (ADR-066).
- **Round Valley** and **Lake Valley Reservoir** are both Pacific Gas and
  Electric Company's, in Plumas and Placer counties respectively. Shared
  ownership is not identity, and no reviewed source connects them.

**Matilija is restricted from 2025-06-09** (seismic, Ventura County Watershed
Protection District). That does not settle the `MAT` hold, whose finding is a
series *above* the matched record's largest figure rather than below it, but it
is a fact about the same dam and belongs beside it.

## Evidence still required

The state report identifies affected dams, restriction dates and reasons but
does not give the restricted acre-foot volume. Each remaining row therefore
needs an owner or regulator source that supplies:

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
