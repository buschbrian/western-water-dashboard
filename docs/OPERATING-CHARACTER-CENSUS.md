# Operating-character census

**Reviewed:** 2026-09-04
**Tool:** `tools/audit_operating_character.py`
**Output:** [`data/reviews/operating-character-census.json`](../data/reviews/operating-character-census.json)
**Purpose:** propose an `operating_character` (ADR-114) for every published
reservoir from geospatial and inventory evidence, so the sole reviewer decides
each one against evidence rather than against a name.

**Nothing here is applied.** Every row carries `needs_review: true`, and no
roster, payload, capacity or normal is touched by the tool that wrote it. A
proposal is a candidate and a starting point for the reviewer, not a finding.

## What it proposes

Across the 404 published reservoirs, on the payload generated 2026-09-04:

| Proposed | Count | high | medium | low |
|---|---:|---:|---:|---:|
| `restricted` | 15 | 14 | 1 | 0 |
| `run_of_river` | 33 | 9 | 19 | 5 |
| `flood_space` | 30 | 7 | 7 | 16 |
| none (ordinary target-filled storage) | 326 | | 326 | |
| **natural-lake flag** (water type, ADR-112) | **1** | | | 1 |

Seventy-eight reservoirs, 19% of the roster, are proposed as something other
than ordinary storage. Two thirds of those are `run_of_river` or `flood_space`,
which is the class ADR-114 was written for and the class nothing in the
repository could name before.

**ADR-114's two measured shares come back out of independent evidence.** The
record measured them from the payload's own full levels; this census measured
them from dam purposes, drainage areas and mean annual flows, and got the same
two numbers:

| Drainage area | ADR-114 | This census |
|---|---:|---:|
| Lower Snake | 97.6% of the combined full level | **97.6%** (2,003,700 of 2,052,957 acre-feet, 5 of 6 reservoirs) |
| Middle Columbia | 94.9% | **94.9%** (2,210,000 of 2,329,891 acre-feet, 3 of 6) |

The five Lower Snake pools are Lower Granite, Lake Bryan (Little Goose), Lake
Herbert G. West (Lower Monumental), Lake Sacajawea (Ice Harbor) and Hells
Canyon; the three Middle Columbia pools are Lake Wallula (McNary), Lake
Umatilla (John Day) and Lake Celilo (The Dalles). Every one carries a
navigation lock or a navigation purpose, sits on a river draining more than
130,000 square kilometres, and turns its own volume over in under five days.
Wallowa Lake, Willow Creek, McKay and Cold Springs are the four in those two
areas that are not proposed as navigation pools, and none of them is on the
mainstem.

## `run_of_river`, 33 proposals

The rule: the inventory's purposes include navigation or hydroelectric, **and**
the mainstem at the published point drains at least 1,000 square kilometres,
**and** the residence-time proxy is at most 30 days. Confidence is high where a
navigation lock or purpose is present and the pool turns over inside 10 days.

| Reservoir | Confidence | Drainage area | Mean annual flow | Residence proxy | Purposes carrying it | Series |
|---|---|---:|---:|---:|---|---|
| Lake Wallula | high | 487,575 km² | 181,527 cfs | 3.8 d | Navigation, 1 lock | agrees |
| Lake Umatilla | high | 516,197 | 184,426 | 1.5 d | Navigation, 1 lock | disagrees |
| Lake Celilo | high | 540,460 | 189,175 | 0.9 d | Navigation, 1 lock | agrees |
| Lower Granite Lake | high | 211,227 | 57,591 | 4.3 d | Navigation, 1 lock | agrees |
| Lake Bryan | high | 212,415 | 57,640 | 4.9 d | Navigation, 1 lock | agrees |
| Lake Herbert G. West | high | 222,603 | 58,825 | 3.2 d | Navigation, 1 lock | agrees |
| Lake Sacajawea | high | 223,276 | 58,835 | 3.5 d | Navigation, 1 lock | agrees |
| Hells Canyon Reservoir | high | 137,936 | 24,400 | 3.5 d | Hydroelectric, Navigation | agrees |
| Dexter | high | 2,590 | 3,181 | 4.7 d | Navigation among six purposes | agrees |
| Rufus Woods Lake | medium | 187,419 | 102,608 | 2.9 d | Hydroelectric | agrees |
| Box Canyon Reservoir | medium | 59,512 | 28,280 | 1.2 d | Hydroelectric | agrees |
| Cabinet Gorge Reservoir | medium | 52,404 | 24,121 | 2.2 d | Hydroelectric | agrees |
| Noxon Rapids Reservoir | medium | 51,507 | 23,371 | 8.6 d | Hydroelectric | agrees |
| Thompson Falls Reservoir | medium | 49,591 | 22,058 | 0.3 d | Hydroelectric | agrees |
| Keswick Reservoir | medium | 13,623 | 8,554 | 1.4 d | Hydroelectric | disagrees |
| Crystal Reservoir | medium | 9,741 | 1,943 | 6.6 d | Hydroelectric | disagrees |
| Pit 7 Reservoir | medium | 9,735 | 3,240 | 5.3 d | Hydroelectric | agrees |
| Pit Six Reservoir | medium | 9,407 | 2,792 | 2.9 d | Hydroelectric | disagrees |
| Thermalito Afterbay | medium | 9,055 | 8,203 | 3.5 d | Hydroelectric | disagrees |
| Thermalito Diversion Pool | medium | 9,040 | 8,199 | 0.8 d | Hydroelectric | agrees |
| Black Canyon Reservoir | medium | 6,868 | 3,304 | 4.6 d | Hydroelectric | disagrees |
| Lake Natoma | medium | 4,867 | 4,832 | 0.9 d | Hydroelectric | agrees |
| Redinger Lake | medium | 3,349 | 2,522 | 5.2 d | Hydroelectric | disagrees |
| Harry L. Englebright Lake | medium | 2,864 | 3,937 | 9.0 d | Hydroelectric | agrees |
| Lake Mc Swain | medium | 2,637 | 1,843 | 2.7 d | Hydroelectric | disagrees |
| Pleasant Valley Reservoir | medium | 1,312 | 375 | 5.1 d | Hydroelectric | disagrees |
| Slab Creek | medium | 1,263 | 1,315 | 6.1 d | Hydroelectric | disagrees |
| Foster | medium | 1,274 | 2,367 | 11.9 d | Navigation among six purposes | disagrees |
| Mayfield | low | 3,589 | 5,969 | 11.3 d | Hydroelectric | agrees |
| Lake Britton | low | 8,866 | 1,987 | 10.4 d | Hydroelectric | agrees |
| Tulloch | low | 2,524 | 1,938 | 17.4 d | Hydroelectric | disagrees |
| Canyon Lake | low | 15,584 | 1,175 | 24.8 d | Hydroelectric | agrees |
| Saguaro Lake | low | 15,891 | 1,185 | 29.7 d | Hydroelectric | agrees |

**The high-confidence nine are the ones ADR-114 named plus two.** Dexter is a
re-regulating pool below Lookout Point and Lake Celilo is The Dalles pool. The
census reaches Dexter's confidence through the Willamette projects' navigation
purpose, which is an authorized purpose of the whole Willamette system rather
than a lock on that dam -- a reviewer should read Dexter's 4.7-day residence
time as the evidence and the navigation purpose as a coincidence of how the
Corps registered the project.

**Twelve of the 33 disagree with their own series**, and the disagreement is
worth reading rather than dismissing. Black Canyon ranges 27% to 103% full
across twelve months, which is not a steady level; Keswick and Thermalito
Afterbay are re-regulating pools drawn down for power. These are the rows where
the evidence says "a pool in a river" and the operation says something else.

## `flood_space`, 30 proposals

The rule: the inventory's primary purpose is flood risk reduction, **and** it
publishes no conservation pool, or flood control as its only purpose, or a
conservation pool at most 50% of the maximum pool (ADR-072's pattern), or the
Corps of Engineers operates it. Confidence is high where the pool figures or
the mapped water say the reservoir is not meant to fill.

| Reservoir | Confidence | Decisive evidence | Series |
|---|---|---|---|
| Seven Oaks Dam | high | flood control is its only purpose; no conservation pool published | agrees (0.9-5.7% full) |
| Mud Mountain Lake | high | conservation pool published as 0 against a 106,000 acre-foot maximum | agrees (0.0-30.5%) |
| Martis Creek Reservoir | high | Corps-operated; NHD maps 62 acres of water inside a 768-acre pool (share 0.08) | agrees (3.9-4.3%) |
| Howard Hansen | high | Corps-operated; 784 mapped acres in a 20,000-acre pool (share 0.04) | agrees (0.5-35.5%) |
| Cogswell Reservoir | high | no conservation pool published | disagrees |
| Del Valle | high | no conservation pool published | disagrees |
| Lake San Antonio, Monterey Co | high | no conservation pool published | disagrees |
| Detroit | medium | 155,000 conservation against a 455,000 maximum (ADR-072's own case) | disagrees |
| Green Peter | medium | 160,000 against 430,000 (ADR-072's own case) | disagrees |
| Black Butte | medium | 105,900 against 354,000 | disagrees |
| Isabella Dam | medium | 568,000 against 1,202,000; mapped water 0.26 of the pool | disagrees |
| Terminus Dam | medium | 113,431 against 235,205 | disagrees |
| Lake Mendocino | medium | 74,500 against 155,500 | disagrees |
| Willow Creek | medium | 4,326 against 14,091 | agrees |
| Applegate, Blue River, Cottage Grove, Cougar, Dorena, Dworshak, Fall Creek, Fern Ridge, Hensley Lake, Hills Creek, Lookout Point, Lost Creek, Lucky Peak, New Hogan Lake, Pine Flat Dam, Lake Sonoma | low | Corps-operated flood-risk projects whose pool figures do not separate them from ordinary storage | 12 of 16 disagree |

**The sixteen low-confidence rows are one finding, not sixteen.** They are the
Corps's seasonal flood-control class -- most of the Willamette projects, Pine
Flat, Lucky Peak, Dworshak -- which empty for the winter and refill for the
summer. Whether ADR-114's `flood_space` describes them is the reviewer's
question and it is a real one: the record's sentence is "This reservoir keeps
space empty to catch floods. It is not expected to fill", and Fall Creek
reached 97.7% full this year. The census cannot separate "keeps space empty all
year" from "keeps space empty in winter" from the inventory alone, so it
proposes both and marks the difference with confidence and with the series.

**The mapped-water share is what separates them where the pool figures cannot.**
Martis Creek's conservation pool is 64% of its maximum, which no storage test
catches, and it is proposed at high confidence because NHD maps 62 acres of
water inside the 768-acre pool the inventory describes. Detroit's mapped water
is 1.03 of its inventory pool. Two agencies measuring the same reservoir from
different sides, and neither of them is the series.

## `restricted`, 15 proposals

Established already in [`OPERATING-RESTRICTION-REVIEW.md`](OPERATING-RESTRICTION-REVIEW.md)
and carried here for completeness, keyed by station rather than by name
(ADR-066). Fourteen carry the state's effective date; Coyote does not.

| Reservoir | Station | Restricted dam | Effective | Reason | Published percent full |
|---|---|---|---|---|---:|
| Tinemaha Reservoir | `TNM` | Tinemaha | 1993-03-03 | Seismic | 16.2% |
| Haiwee | `HWE` | Haiwee | 2002-07-23 | Seismic | 43.3% |
| Calero Reservoir | `CRO` | Calero | 2013-02-08 | Seismic | 38.6% |
| Gem Lake | `GLK` | Gem Lake | 2013-02-14 | Seismic | 57.7% |
| El Capitan Dam | `ELC` | El Capitan | 2015-05-27 | Seismic | 9.5% |
| Lake Mccloud | `MCO` | McCloud | 2020-01-09 | Other | 43.1% |
| Irvine Lake | `SGC` | Santiago Creek | 2020-05-08 | Other | 11.1% |
| San Andreas | `SNN` | San Andreas | 2020-08-03 | Other | 84.6% |
| Morena Dam | `MOR` | Morena | 2021-11-10 | Hydraulic | 13.6% |
| Lake Hodges | `HDG` | Lake Hodges | 2023-02-02 | Seismic | 8.1% |
| Lake Pillsbury | `LPY` | Scott | 2023-04-12 | Seismic | 47.9% |
| Murray Reservoir | `MRR` | Murray | 2023-07-19 | Seismic | 71.9% |
| Relief | `RLF` | Relief | 2024-06-02 | Other | 44.5% |
| Crane Valley | `CNV` | Crane Valley Storage | 2024-10-06 | Other | 83.5% |
| Coyote Lake | `CYC` | Coyote | *none published* | operator restriction | 40.8% |

Leroy Anderson is not here: it left the roster under ADR-113 and the payload no
longer carries it. Coyote is proposed at medium confidence because its
restriction is the operator's and the state's September 2025 list does not
carry the dam, so no effective date is established. The character does not
divide anything, so an undated restriction can still be labelled where ADR-111
would refuse to move a denominator.

## The natural-lake flag: one

**Bear Lake.** NHD types it LakePond, the roster carries no inventory record
for it, the nearest inventory dam is Sheep Creek 19.0 km away, and GNIS names
it a lake. It is 283 km² with a long-to-short ratio of 2.5.

It is a flag and not a finding, and ADR-078 has already ruled on this exact
water: "A natural lake raised by a control structure is a reservoir under this
rule, and may still be called a lake by the people who live beside it... Bear
Lake is the case the scoping named." The flag exists to be closed by that
sentence, or reopened by ADR-112's water type if the reviewer decides its
outlet works differ enough from a dam.

**Why only one.** The flag needs all four legs, and the reason is a measurement
this census repeated. Of the 356 waters NHD answered for, it types **343 as
LakePond and 13 as Reservoir** -- so the hydrographic type separates almost
nothing, exactly as ADR-078 found when it measured 25 of 26 dammed
impoundments typed LakePond. Twenty-six published reservoirs carry no inventory
record on the roster, and for all but Bear Lake an inventory dam stands within
2 km of the published point: Utah Lake's own outlet dam is 0.49 km away. The
twenty-five are the original Utah Conservation Service stations, whose
capacities live in `pipeline/constants.py` rather than in a roster's capacity
evidence; their dams exist in the inventory and the roster simply never
recorded an identifier for them.

## What each service could and could not answer

| Service | Asked | Answered | Silent | Failed |
|---|---:|---:|---:|---:|
| National Inventory of Dams (`geospatial.sec.usace.army.mil`) | 13 paged requests | 13 | 0 | 0 |
| NHDPlus HR NHDWaterbody (`hydro.nationalmap.gov`, layer 9) | 404 | 356 | 48 | 0 |
| NHDPlus HR NetworkNHDFlowline (layer 3) | 457 | 404 | 0 | 0 |

**The inventory answered everything it was asked.** 12,356 dam rows across the
eleven states the roster touches, downloaded once and answered offline. 378 of
the 404 reservoirs carry an `nid_id` on their roster entry and every one of
them matched a row; the remaining 26 are recorded as "no inventory record"
rather than guessed at. A nearest dam was computed for 402 of 404 from the same
download. Purposes are published as words -- `Navigation`, `Hydroelectric`,
`Flood Risk Reduction` -- and not as the single-letter codes the inventory
documentation lists.

**A dam identifier names a project, not a structure.** McNary answers with a
lock and dam and thirteen levees, and the levees carry `Flood Risk Reduction`
where the dam carries `Navigation`. The census picks the row the inventory does
not mark as an associated structure, that publishes a storage figure, and whose
name is not a dike's -- the same ordering `tools/add_dam_points.py` uses, so
two tools reading one identifier name one structure.

**The hydrography was silent for 48 points**, every one of them a published
point that is not inside a mapped waterbody: Shasta, Oroville, New Melones,
Lower Granite, Keswick, Seven Oaks and 42 others. For the 356 that answered,
the polygon was returned generalized and the elongation measured from it -- no
row fell back to a bounding-box ratio. 232 polygons hold the published point
and 124 do not, which is where a dam point usually falls.

**Which pool a dam belongs to needs the name after position fails.** A dam
between two pools is inside neither and 100 metres from both: McNary's point
answers with Lake Wallula and Lake Umatilla, and taking the larger handed Lake
Wallula its neighbour's shape and its neighbour's surface area. The census now
prefers a polygon whose GNIS name is the reservoir's, and only among polygons
the point is already beside -- the same weak-evidence treatment `admission.py`
gives a name. 307 of the 356 resolve by name, no polygon is now claimed by two
reservoirs, and one known error survives: Lake Umatilla's point at John Day Dam
falls inside the Lake Celilo polygon downstream of it, and no candidate carries
its own name.

**The flowline layer carries the value-added and EROM columns itself**, so no
separate table, EPA WATERS service or USGS VAA endpoint was needed:
`totdasqkm`, `streamorde`, `qama` and `qema` are fields on
`NetworkNHDFlowline`. Every one of the 404 points found a flowline, 403 with a
mean annual flow. Lake Granby is the one without.

**Two failure modes in EROM are worth knowing before the next audit uses it.**

- *A divergence's minor path carries the same drainage area and almost none of
  the water.* At Little Goose two flowlines both claim 212,415 km²; one is the
  Snake River at 57,640 cfs and the other is unnamed at 0.004. Choosing by
  drainage area alone gave the Lower Snake's second-largest navigation pool a
  residence time of five hundred years. The census now chooses the river by
  drainage area and the path by flow.
- *A point beside a tributary mouth answers with the tributary.* The Dalles's
  published point is 300 m from Fifteenmile Creek, which drains 945 km²
  against the inventory's 237,000 square miles for the dam. The census widens
  its search while the flowline carries less than half the drainage area the
  inventory gives the dam, and Lake Celilo resolves to the Columbia at 3 km.
  Two rows still disagree after widening -- Lake Almanor and Narraguinnep --
  and both are recorded as disagreeing rather than repaired.

**The residence-time proxy is available for 403 of 404** and exceeds ten years
for 46 of them. A long proxy is usually right (Murray's 15,000 days is a
4,818 acre-foot reservoir on an 8 km² catchment) and is sometimes EROM
reporting a near-zero mean annual flow on a real river: ten reaches draining
more than 500 km² report under 1 cfs, Brownlee's 136,258 km² among them. A
wrong proxy of that kind can only produce a missed `run_of_river` proposal, not
a false one.

**From the repository, not from a service:** huc6 and huc8 for 402, an upstream
trace with its basin area for 402 (`upstream_index.json`), a reviewed dam point
for 378, a Corps office for the 12 CWMS reservoirs, and a named operator for
164.

## The rules as run, and what changed while running them

The rules are in the output file's header, and each proposal records which
evidence rows it used. Three of them moved from the starting point, and each
move is a fact the data showed:

1. **The mainstem must drain 1,000 km², not 5,000.** The starting threshold cut
   off eleven waters that pass both other legs, and the ones it cut are
   re-regulating pools directly below larger dams -- Dexter below Lookout Point
   at 2,590 km², Foster below Green Peter at 1,274 -- held at a steady level in
   exactly the sense ADR-114 describes. There is no gap in the data to put the
   threshold in; it is set where a mainstem stops being a river, and the
   largest water it now excludes is Lyons Reservoir on a 174 km² creek.
2. **`flood_space` needed a fourth leg: who operates the dam.** Martis Creek's
   conservation pool is 64% of its maximum, so no storage test reaches it.
   Grand Coulee is why the leg names the *operating agency* and not federal
   ownership: its primary purpose is flood risk reduction too, Reclamation runs
   it as storage, and it fills every year.
3. **A geospatial leg was added that the starting rules did not have.** The
   inventory publishes a pool's surface area and NHD maps the water normally in
   it; dividing them says how full a reservoir usually is without reading a
   single reading. Across the 315 reservoirs answering both, the median share
   is 0.90 and Detroit sits at 1.03 -- against Martis Creek's 0.08 and Howard
   Hanson's 0.04. It raises confidence and never assigns a character.

**The observed series is beside every proposal and inside none of them.** Each
row carries its percent-full range over twelve monthly records and its 365-day
change, marked `agrees`, `disagrees` or `not assessed`. ADR-114 forbids reading
the character off the series, and
`tests/test_operating_character_census.py` holds the rule as a property: two
reservoirs with identical evidence and opposite series get identical proposals,
and only the agreement line moves.

## What this census cannot answer

- **Whether a Corps flood-control project "keeps space empty to catch floods"
  in ADR-114's sense.** Sixteen proposals turn on the operating agency alone.
- **What a restricted reservoir may hold.** The state's list gives dates and
  never volumes; that research is
  [`OPERATING-RESTRICTION-REVIEW.md`](OPERATING-RESTRICTION-REVIEW.md)'s and is
  unchanged by this pass.
- **Whether a reservoir outside California is restricted.** Every restriction
  here comes from one state's central list. No other western state's
  dam-safety register has been read, and no federal project has been checked.
- **Whether Bear Lake is a reservoir.** ADR-078 says it is. The flag records
  that the geospatial evidence, read cold, would have asked.

## Rerunning it

```bash
python tools/audit_operating_character.py                    # fetch, propose, write
python tools/audit_operating_character.py --dry-run          # write nothing
python tools/audit_operating_character.py --only "Lake Wallula"
python tools/audit_operating_character.py --cache-dir DIR --refresh
```

Raw service responses are cached by request, so a rerun that changes a rule
costs no network at all. A full cold run is about 900 requests and twenty
minutes at the polite quarter-second between them.
