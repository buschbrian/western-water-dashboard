# ADR-145: Draw the Rio Grande and Arkansas basins that lie inside the West

## Status

Proposed. On acceptance it supersedes ADR-053's rule that the western scopes
are regions 14 through 18 only, and it is the record ADR-117 asks for before
the roster grows into new geography. ADR-053's status line changes then, not
before.

## Date

2026-10-31

## Relates to

ADR-053 (the West by where the water goes; superseded on acceptance), ADR-117
and ADR-124 (the scope stays closed except by record), ADR-010 (scope by
region, never by state), ADR-073 (regions drawn from their own publisher),
ADR-064 and ADR-103 (four levels on every surface), ADR-044 and ADR-105 (the
opening boxes), ADR-069 (one reservoir, one provider), ADR-051 (payload cost
is measured gzipped).

## Context

ADR-053 drew the West as the water that reaches the Pacific or reaches
nothing: hydrologic regions 14 through 18. It called regions 10 through 13
"western in longitude and eastern in hydrology" and ruled that none of their
water was this product's subject. Three findings since then make that rule
cost more than it protects.

**New Mexico publishes one reservoir.** On the payload of 2026-10-30 the state
has Navajo Reservoir, in region 14, and nothing else; all 40 Colorado
reservoirs are west of the divide. The state's storage is in the Rio Grande,
the Pecos and the Canadian, which are all in regions 11 and 13. The U.S.
Geological Survey recount of 2026-10-31 (`WESTERN-SOURCE-CANDIDATES.md`)
found nine reporting storage sites in New Mexico and eastern Colorado, and
none of them can be placed in a drainage area this site draws. The New
Mexico admission screen of 2026-10-29 (R11,
`data/reviews/new-mexico-admission-screen.json`) reached the same wall from
the other side: of 48 storage series on three providers, 47 stand outside
the drawn set, and the screen holds or rejects them on that alone. The
scope rule, not the evidence, is what keeps New Mexico at one reservoir.

**Colorado River water is stored east of the divide.** The San Juan-Chama
Project carries water from the San Juan's tributaries into Heron Reservoir on
the Rio Chama, in the Rio Grande basin. The Fryingpan-Arkansas Project carries
water from the Fryingpan River to Turquoise Lake, Twin Lakes and Pueblo
Reservoir, in the Arkansas basin. ADR-053's own subject is in reservoirs its
rule cannot draw.

**The basins divide cleanly at the edge of the western states.** The rule the
region scope exists to keep is the one written beside it in
`watershed_scopes.py`: never cut a basin at a state line, because a half basin
is not a smaller answer but a wrong one. Measured on 2026-10-31 from the
Watershed Boundary Dataset, by the share of each basin's area in HUC-12
subwatersheds that lie wholly inside the eleven western states (the rest
straddle a state line or lie outside):

| HUC-6 | Basin | States | Area, km² | Inside | Straddling | Outside |
|---|---|---|---:|---:|---:|---:|
| 130100 | Rio Grande Headwaters | CO, NM | 19,715 | 100.0% | 0.0% | 0.0% |
| 130201 | Upper Rio Grande | CO, NM | 16,609 | 100.0% | 0.0% | 0.0% |
| 130202 | Rio Grande-Elephant Butte | NM | 53,639 | 100.0% | 0.0% | 0.0% |
| 110200 | Upper Arkansas | CO, KS, NM | 64,556 | 99.7% | 0.3% | 0.0% |
| 110800 | Upper Canadian | CO, NM, TX | 32,307 | 99.7% | 0.3% | 0.0% |
| 130600 | Upper Pecos | NM, TX | 60,940 | 99.3% | 0.7% | 0.0% |
| 130500 | Rio Grande Closed Basins | NM, TX | 45,513 | 64.8% | 6.3% | 28.9% |
| 130301 | Rio Grande-Caballo | MX, NM, TX | 20,725 | 56.1% | 6.4% | 37.4% |
| 130302 | Mimbres | MX, NM | 35,591 | 40.1% | 9.4% | 50.5% |
| 110400 | Upper Cimarron | CO, KS, NM, OK | 31,136 | 25.1% | 15.8% | 59.1% |
| 110901 | Middle Canadian | NM, OK, TX | 26,251 | 20.8% | 11.6% | 67.6% |
| 111001 | Upper Beaver | KS, NM, OK, TX | 20,685 | 8.4% | 3.2% | 88.4% |
| 111201 | Prairie Dog Town Fork Red | NM, OK, TX | 20,166 | 7.2% | 3.9% | 88.9% |
| 130700 | Lower Pecos | NM, TX | 53,432 | 6.9% | 8.1% | 85.0% |
| 110300 | Middle Arkansas | CO, KS | 53,188 | 1.0% | 2.4% | 96.6% |
| 130401 | Rio Grande-Fort Quitman | MX, NM, TX | 8,041 | 0.0% | 4.0% | 96.0% |

The other 25 basins of the two regions touch no western state. Six basins lie
at 99.3% or more; the next lies at 64.8%. Any threshold from 65% to 99%
selects the same six, so the line does not depend on where a threshold is
drawn. The six make up five whole subregions -- 1102, 1108, 1301, 1302 and
1306 -- so no subregion is cut either.

**The providers this site already reads hold most of the water.** Counted on
2026-10-31, keyless, across Colorado and New Mexico in regions 11 and 13. A
station counts when a read, not a catalog, returned a value inside the last
thirty days:

| Provider | Stations with a current series |
|---|---:|
| Colorado Division of Water Resources | 47 |
| Natural Resources Conservation Service | 27 |
| U.S. Army Corps of Engineers, Albuquerque District (`SPA`) | 22 |
| Bureau of Reclamation | 13 |
| U.S. Geological Survey | 9 |
| **Stations** | **118** |

Folded where two providers publish the same water -- by name and position,
29 reservoirs are seen by more than one -- they are 74 reservoirs, and 73 of
them stand in the six basins: 38 in the Upper Arkansas, 12 in the Rio Grande
Headwaters, 7 each in Rio Grande-Elephant Butte and the Upper Pecos, 5 in the
Upper Rio Grande and 4 in the Upper Canadian; 50 in Colorado and 23 in New
Mexico. The 74th is Caballo. Thirty-five hold 1,000 acre-feet or more today;
the largest are Conchas, Pueblo, Abiquiu, Elephant Butte and Twin Lakes. No
dam match or screen has been run, so these are candidates, not admissions:
70 to 77 covers the pairings that need a ruling and three recharge ponds the
state files as reservoirs. Against today's 405 published reservoirs, the six
basins would add about 18%.

## Decision (proposed)

**Draw the six basins, whole, and nothing else from regions 10 to 13.** The
drawn set becomes regions 14 through 18 plus subregions 1102 (Upper
Arkansas), 1108 (Upper Canadian), 1301 (Rio Grande Headwaters), 1302 (Rio
Grande-Elephant Butte) and 1306 (Upper Pecos). That is 81 basins (75 + 6), 49
subregions (44 + 5) and 621 subbasins (571 + 50): about 10.5% more area, from
2,358,116 to 2,605,882 km².

**The rule is the list; the measurement is its evidence.** `WEST_REGION_WHERE`
keeps its range clause for regions 14 through 18 and gains one clause naming
the five subregions by code, which holds for the HUC-4, HUC-6 and HUC-8 fields
alike because codes nest. The 99% share above is recorded here as the reason
for the list, not computed at fetch time: a refetch that changes the drawn set
fails the committed-file test exactly as ADR-053 required.

**The principle becomes the western states' water, by whole basin.** The West
is regions 14 through 18 plus any basin of another region that lies, by
HUC-12 area, inside the eleven western states. Stated as a rule so the next
question is answered the same way rather than argued fresh. This record
applies it to regions 11 and 13 only.

**The region level draws what is drawn.** Regions 11 and 13 cannot be drawn
whole, and a figure keyed to "Arkansas-White-Red Region" that holds only its
Colorado and New Mexico headwaters is the half-basin answer this record
exists to avoid. Proposed: each gains a region row whose polygon is the union
of its drawn subregions and whose name says what it holds -- "Upper Arkansas
and Canadian" for 11 and "Upper Rio Grande and Pecos" for 13 -- so the region
figure is true of what it names. This narrows ADR-073 for these two rows only:
their shape is assembled from the publisher's subregion polygons instead of
read from its region polygon.

**No reservoir is admitted by this record.** Each provider's candidates in
the six basins pass the screens in `admission.py` and enter their own reviewed
roster with their own findings, and ADR-069 decides any water two providers
publish. The counts above size the work; they do not admit it.

**Every surface follows the drawn set, through its own builder.** Boundary
files, snow sites, drought areas, precipitation stations, counties, upstream
traces and normals are each extended by the tool that owns them
(`data/generated-files.json`), never by hand.

## Rejected alternatives

- **Keep ADR-053.** New Mexico stays at one reservoir, and the Colorado River
  water held in Heron, Turquoise, Twin Lakes and Pueblo stays invisible on a
  dashboard whose largest subject is that river.
- **Add regions 11 and 13 whole.** Region 11 reaches Kansas, Oklahoma,
  Arkansas and Missouri, and region 13 reaches the Gulf at Brownsville. No
  provider this site reads publishes storage for most of it, so most of the
  area drawn would carry wrong totals.
- **Add the land of Colorado and New Mexico, cut at the state line.** It is
  the half-basin error the region rule exists to prevent; every total along
  the line would be wrong.
- **Place only the transbasin reservoirs, in the areas already drawn.** A
  reservoir's drainage area is assigned at its dam (ADR-013). Filing Heron
  under the San Juan would draw a point outside its own area and move the
  Rio Chama's storage into a basin it does not drain to.
- **Lower the line to take Rio Grande-Caballo (56.1%) or the Closed Basins
  (64.8%).** Their remaining area is in Texas and Mexico, where no provider
  this site reads publishes storage. Caballo Reservoir is the cost, named
  here: it is operated with Elephant Butte in the Rio Grande Project, and its
  absence is the visible seam of this rule. ADR-053's footnote for HUC-4 1305
  still holds.
- **Decide region 10 in the same record.** The Missouri headwaters in Montana
  and Wyoming and the Platte in Colorado are the same question with more
  basins, a larger roster and a separate measurement. They get their own
  record under the rule this one states.

## Consequences

- The drawn geometry grows by about a tenth in area. Its cost is measured
  gzipped when the files are fetched (ADR-051); `west-huc8` is the largest
  and decides it.
- `MAP_BOUNDS` and `OPENING_SCOPE_HUC6_BOUNDS` do not move (ADR-044), and
  neither does where a page opens (ADR-105). `HUC6_BOUNDS` and
  `DRAWN_BOUNDS`, which are measured from the committed files, move their
  east edge from 105.6° W to 102.0° W.
- Existing links keep resolving: codes are only added. `west-huc6` and
  `west-huc4` stay inside their expected ranges (81 in 70-85, 49 in 40-50);
  `west-huc8`'s range of 540-610 is measured again for 621, and
  `west-huc2`'s count of five becomes seven if the region rows above are
  accepted.
- New Mexico and eastern Colorado gain reservoirs, snow sites and drought
  areas on every page. Utah's own scopes do not change.
- ADR-117's closed scope is reopened for these six basins and nothing else.
  A reservoir outside them is still a broad roster expansion and still needs
  a record.

## Before acceptance

1. **The region rows.** Accept the assembled shape and the two names, or
   leave regions 11 and 13 out of the region level and nest their subregions
   under their state instead.
2. **Caballo Reservoir.** Accept its absence as the seam, or ask for a rule
   for a basin that lies partly outside every provider's coverage.
3. **Order of work.** Proposed: boundaries and their tests first with no
   roster change, then each provider's admission as its own change, the way
   ADR-053's scopes were fetched and measured before anything drew them.
