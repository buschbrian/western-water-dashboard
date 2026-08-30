# Western reservoir source candidates

Status: Base research inventory checked 2026-08-20; Montana and Arizona
follow-up checked 2026-08-28; Columbia Basin and Nevada follow-up checked
2026-08-29. **Three of its candidates
were built since**: California (2026-08-20), Colorado (2026-08-21) and the
U.S. Geological Survey (2026-08-22), which took the roster from two providers
to five. Idaho, Oregon and Wyoming were the survey's remaining open ground; the
2026-08-29 follow-up found the Columbia Basin source the survey said did not
exist. The survey below is as it was written on its date and is not rewritten
to describe today; the current source list is
[`AUTHORITATIVE-SOURCE-INVENTORY.md`](AUTHORITATIVE-SOURCE-INVENTORY.md).

## Follow-up: the Columbia Basin and Nevada (2026-08-29)

This follow-up supersedes the original survey's finding that the Columbia
Basin is absent from the national CWMS Data API, and closes the Nevada entry
that admitted it was not exhaustive. The dated survey below is left as
written; the sentence it corrects is marked in place.

### USACE: the Columbia Basin is in the national API, under the region

The survey queried the three districts — `NWP` Portland, `NWS` Seattle,
`NWW` Walla Walla — and found zero storage series under each. That is still
true today, and it was the wrong question. The Northwestern Division
publishes its Columbia Basin data under a **regional** office,
**`NWDP` (Pacific Northwest Region, `type: MSCR`)**, the same way the
Missouri side sits under `NWDM`. Checked live on 2026-08-29, unauthenticated
throughout:

```
https://cwms-data.usace.army.mil/cwms-data/offices
  -> NWD (MSC), NWDP "Pacific Northwest Region" (MSCR), NWDM "Missouri River Region" (MSCR),
     NWP, NWS, NWW (DIS) ...
https://cwms-data.usace.army.mil/cwms-data/catalog/timeseries?office=NWDP&like=.*Stor.*&page-size=500
  -> total 595 series across 125 locations (Accept: application/json;version=2)
https://cwms-data.usace.army.mil/cwms-data/locations?office=NWDP
  -> 6,763 locations with state-initial, latitude, longitude, location-kind
https://cwms-data.usace.army.mil/cwms-data/timeseries?office=NWDP&name=GCL.Stor.Inst.1Hour.0.CBT-REV&unit=ac-ft&begin=2026-08-15T00:00:00Z&end=2026-08-30T12:00:00Z
  -> units "ac-ft", 362 values, last 2026-08-30T01:00Z = 8,121,220
```

So three of the survey's open questions close at once: **`unit=ac-ft` is
accepted** and returns acre-feet directly; **reads need no credential**
(every call above was bare); and the Northwestern Division's own portal
does not matter any more — `www.nwd.usace.army.mil/CRWM/Water-Control-Data/`
answers 403 from its edge cache and `www.nwd-wc.usace.army.mil` returns an
error page for every path tried, with or without a browser user agent, so it
is not machine-readable and does not need to be.

**What the 125 locations are.** Joined to the location list and to the
published roster by distance (3 km), the storage-bearing locations under
`NWDP` divide as follows. "Already on the roster" means a published
reservoir sits within 3 km, almost always the same dam through the Natural
Resources Conservation Service; those add nothing and are counted only so
the next reader does not count them again.

| State | Locations with storage | Already on the roster within 3 km | New to the roster |
|---|---:|---:|---:|
| Oregon | 45 | 30 | 15, of which 7 are basin rollups (`Willamette`, `Rogue`, `Santiam`…) and not places |
| Washington | 34 | 16 | 18 |
| Idaho | 30 | 19 | 11 |
| Montana (Columbia side) | 5 | 4 | 1 (`KER`, Flathead Lake at the dam — the roster's Flathead Lake gauge is the same water; ADR-069 review, not a candidate) |
| Wyoming | 2 | 2 | 0 |
| Nevada | 1 | 1 | 0 |
| British Columbia | 3 | 0 | out of scope |

The `NWDM` office holds another 74 storage locations, but they are the
Missouri basin — Boysen, Glendo, Seminoe, Keyhole, Kortes, Canyon Ferry,
Fort Peck, Yellowtail — and `data/watersheds/west-huc6.geojson` draws
regions 14–18 only, so none of them is inside this product's geography.
Wyoming's gap is not a source gap: its reservoirs on the Missouri side are
outside the drawn scope by decision, and its Green River and Snake River
reservoirs are already published.

**The new-to-roster reservoirs that returned a current acre-foot reading
in this session** (value and timestamp as returned, UTC):

| Location | Public name | State | Series read | Last value |
|---|---|---|---|---|
| `GCL` | Grand Coulee Dam (Lake Roosevelt) | WA | `GCL.Stor.Inst.1Hour.0.CBT-REV` | 8,121,220 at 2026-08-30 01:00 |
| `CHJ` | Chief Joseph Dam | WA | `CHJ.Stor.Inst.1Hour.0.CBT-REV` | 563,540 at 2026-08-30 01:00 |
| `LWG` | Lower Granite Lock and Dam | WA | `LWG.Stor.Inst.1Hour.0.Best` | 461,564 at 2026-08-30 02:00 |
| `JDA` | John Day Lock and Dam | OR | `JDA.Stor.Inst.1Hour.0.CBT-COMPUTED-REV` | 308,300 at 2026-08-30 00:00 |
| `PRD` | Priest Rapids Dam | WA | `PRD.Stor.Inst.1Hour.0.CBT-REV` | 31,433 at 2026-08-30 01:00 |
| `BOX` | Box Canyon Dam | WA | `BOX.Stor.Ave.~1Day.1Day.CBT-REV` | 42,270 at 2026-08-29 07:00 |
| `MLL` | Mill Creek Dam | WA | `MLL.Stor.Inst.15Minutes.0.USGS-COMPUTED-REV` | 558 at 2026-08-30 01:45 |
| `GSV` | Galesville Dam | OR | `GSV.Stor.Inst.0.0.MIXED-COMPUTED-REV` | 15,040 at 2026-08-22 01:45 |
| `ALF` | Albeni Falls Dam (Lake Pend Oreille) | ID | `ALF.Stor-Lake.Inst.1Hour.0.IRIDIUM-COMPUTED-RAW` | 1,541,914 at 2026-08-30 00:00 |
| `COEI` | Coeur d'Alene Lake | ID | `COEI.Stor.Inst.0.0.CBT-REV` | 211,530 at 2026-08-29 15:00 |
| `CAB` | Cabinet Gorge Dam | ID | `CAB.Stor.Inst.1Hour.0.CBT-REV` | 32,743 at 2026-08-29 23:00 |
| `HCD` | Hells Canyon Dam | OR/ID | `HCD.Stor.Inst.~1Day.0.IDP-COMPUTED-REV` | 165,220 at 2026-08-28 07:00 |
| `MIL` | Milner Dam | ID | `MIL.Stor.Inst.0.0.USBR-RAW` | 37,708 at 2026-08-30 03:45 |
| `HEN` | Henrys Lake | ID | `HEN.Stor.Ave.~1Day.1Day.USBR-RAW` | 69,201 at 2026-08-29 07:00 |
| `MAN` | Mann Creek Reservoir | ID | `MAN.Stor.Inst.0.0.USBR-RAW` | 447 at 2026-08-30 03:15 |
| `WAH` | Lake Waha | ID | `WAH.Stor.Inst.15Minutes.0.USBR-RAW` | 1,233 at 2026-08-30 01:45 |
| `KER` | Flathead Lake at the dam | MT | `KER.Stor.Inst.~1Day.0.CBT-RAW` | 1,791,000 at 2026-08-28 06:00 |

Bonneville, McNary and The Dalles (`CBT-COMPUTED-REV`), Ice Harbor, Little
Goose and Lower Monumental (`Best`), and Rock Island, Rocky Reach, Wanapum
and Wells (`CBT-REV`) carry the same series shapes as the rows above with
catalog extents to 2026-08-30 and were not each read individually.

**Four things the next reader needs to know before building against it.**

1. **The catalog's extents are not proof of readable data.** Yale, Merwin
   and Swift (`MIXED-COMPUTED-REV`), Big Cliff, Libby, Lake Pend Oreille at
   Hope (`HOPI`) and Dworshak's plain `Stor` series all advertise
   `latest-time` of 2026-08-29/30 and return `total: 0` for July and August
   in every window tried; Dworshak answers only through
   `DWR.Stor-Total.Inst.1Hour.0.Best` (2,509,042 at 2026-08-30 02:00). A
   candidate is confirmed by a read, never by the catalog.
2. **Forecast series pollute the extents.** `*-FCST` versions carry
   `latest-time` into 2027; exclude them before choosing a series, or the
   "freshest" pick is a forecast.
3. **The version suffix says whose number it is.** `USBR-RAW` / `USBR-REV`
   are Reclamation Hydromet readings republished by the Corps — Milner,
   Henrys Lake, Mann Creek and Lake Waha above are that — and ADR-069's
   one-dam-one-reservoir rule applies: check them against RISE before
   treating the Corps as their source. `CBT-*` is the Columbia Basin Teletype network,
   `IDP-*` is Idaho Power's computation, `CENWS-*` the Seattle District's
   own. Milner is also the U.S. Geological Survey candidate held in
   `admitted_usgs_reservoirs.json` because its matched dam record cannot
   contain the observed series; a second feed does not change that finding.
4. **Capacity is not published as storage.** `/pools?office=NWDP` returns
   41 projects with named pools (Dworshak, Grand Coulee, Albeni Falls and
   Hells Canyon each have a `Normal` pool) but every pool is defined by
   **elevation** level ids, and `/levels?office=NWDP` with any mask returns
   zero location levels, so there is no acre-foot full level to read.
   Under ADR-072 every denominator would come from the dam inventory, the
   same position the U.S. Geological Survey provider is in.

**Two decisions this source needs before anything is admitted.** First, a
product decision on the run-of-river Columbia and Snake pools — Bonneville,
The Dalles, John Day, McNary, the four lower Snake projects, and the five
mid-Columbia public-utility dams. They hold hundreds of thousands of
acre-feet each and publish it, but a mainstem pool that swings a few feet
for power is not what a reader means by reservoir storage, and ADR-078's
dam rule admits them as written. Second, `SourceKey` is exhaustive across
its providers, so a Corps adapter is a compile error until every table
names it; the visible name would be "U.S. Army Corps of Engineers".

**Terms and limits.** The API code is MIT-licensed
(`github.com/USACE/cwms-data-api`); no rate limit and no terms-of-use page
were found, and roughly 60 unauthenticated calls in this session drew no
throttling.

### Nevada, searched once

The state entry below said its search was not exhaustive. It has now been
done from four directions, and the answer is that Nevada is thin because it
is thin, not because a source was missed.

- **Natural Resources Conservation Service.** The reservoir-station list for
  the state holds **eight** stations with a storage element. Five are
  already published (Lahontan, Rye Patch, Wild Horse, Chimney Creek,
  Marlette Lake). The other three are Topaz Lake — the same water the
  U.S. Geological Survey audit holds under `10297000`, with the same missing
  dam match — and two natural terminal lakes, **Pyramid Lake** and **Walker
  Lake**, both monthly and semimonthly only, both needing the ADR-078
  successor that Walker Lake's held finding already names.
- **Truckee River Operating Agreement daily report**
  (`troa.net/reports/dwmr/`, dated 2026-08-29). Eight reservoirs — Tahoe,
  Boca, Stampede, Prosser, Donner, Independence, Martis, Lahontan. Seven are
  on the roster already through the Natural Resources Conservation Service
  and California; Martis is not, but the page is HTML only, carries no
  download or API, and its footer claims all rights reserved. Not a source.
- **Walker Basin Hydro Mapper** (`webapps.usgs.gov/walkerbasinhydromapper`).
  Bridgeport, Topaz, Weber and Walker Lake — every one a U.S. Geological
  Survey site this project already reads or holds. A republisher of a
  provider we have.
- **Nevada Division of Water Resources** (`data-ndwr.hub.arcgis.com`,
  `water.nv.gov/index.php/data`). Well logs, spring and stream flow, water
  levels, GIS layers. No reservoir-storage dataset.
- The one Corps location in the state, `WLD`, is Wild Horse republished
  from Reclamation (`USBR-RAW`), already on the roster.

What is left in Nevada is Lake Mead's neighbours on the Colorado (Mohave and
Havasu are Reclamation reservoirs already handled under the California and
RISE reviews) and the terminal lakes, which are a roster-rule question and
not a source question.

### Arizona: the Central Arizona Project is machine-readable

Lake Pleasant was Arizona's one remaining gap of consequence — about 812,000
acre-feet of normal storage behind New Waddell Dam, operated by CAP and absent
from every provider. CAP's public Lake Pleasant page fills its graphic from a
JSON endpoint that answers a bare GET:

```
https://azr-prod-rsg-dmz-app-waterqualityweb.azurewebsites.net/api/opslakepleasant
  -> {"RecordID":113000,"LP_Elev":"1649.1200","LP_Volume":"421560.0031",
      "LP_PercentFull":"47.2686","LP_SurfaceArea":"6520.8630",
      "PP_Flow":"-587.9121","RiverOutletFlow":"0.0000",
      "RecordTime":"2026-08-29T21:16:03"}
```

- **Key:** none. **Units:** acre-feet, stated by the page that reads it.
- **History:** none. `?start=`, `?days=`, `?recordid=`, `/history` and
  `/{id}` all answer the same single record or 404; no swagger or
  documentation exists. The series has to be accumulated by the reader.
- **Identifier:** none but the endpoint; `RecordID` is a row counter.
- **Full level:** `LP_PercentFull` is against the 1,702-foot maximum pool,
  which back-computes to about 891,840 acre-feet; the dam inventory gives
  811,784 normal and 1,063,163 maximum for New Waddell Dam (AZ82929). CAP
  publishes the percentage, never the acre-foot figure.
- **Terms:** none published. The host is an Azure application the public
  page calls once per visitor. AquaPortal (`aquaportal.cap-az.com`) is an
  Aquatic Informatics portal with a sign-in and a disclaimer, and was not
  found to expose the lake level.
- **Waddell pumping and generating** come from the same record (`PP_Flow`),
  which is outside this site's subject.

Admitted the same day as ADR-104: one record a day merged into the
dense-history cache, denominator from the inventory, the operator's
percentage recorded beside it as a finding.

The one Corps reservoir in Arizona, **Alamo Lake**, is in the CWMS Data API
under the Los Angeles District office (`SPL`, `Alamo.Stor.Inst.1Hour.0.GOES-rev`,
hourly since 2004, current), not the office ADR-102 reads; Painted Rock,
Whitlow Ranch and Tat Momolikot are there too and are dry flood-control
basins. Admitting Alamo is one roster entry once the loader accepts a second
office. **Lake Havasu** is readable through California and held with a spike
finding in `admitted_cdec_reservoirs.json`.


## Follow-up: Montana StAGE and Arizona SRP (2026-08-28)

This follow-up supersedes the original survey's findings about Montana DNRC
and SRP, while leaving that dated survey intact below. Both public sites have
structured sources behind their pages.

### Montana: one additive reservoir inside this product's scope

DNRC's Stream and Gage Explorer is a public ArcGIS REST service:
`https://gis.dnrc.mt.gov/arcgis/rest/services/WRD/WMB_StAGE/MapServer`.
It needs no key and publishes stable `LocationID`, `LocationCode` and
`SensorID` fields. Table 3 exposes ten published `LS` (total storage) sensors
in `Acre-ft`; table 2 answers time-series requests by `SensorID`. All ten
returned a provisional reading dated 2026-08-28:

| Location code | Reservoir | Sensor ID |
|---|---|---|
| `40J 09000` | Beaver Creek Reservoir near Havre | `5b0718d9093b42d18fec517ab8ad7724` |
| `42B 01900` | Tongue River Reservoir | `928adc9bb5274166be6f52b4220d421d` |
| `41C 01900` | Ruby River Reservoir | `7a2ad1bbaa6c482e853dd9ab4823c647` |
| `43D 07900` | Cooney Reservoir | `c5792b7a249d408eabaaacb77086bc2a` |
| `40M 05000` | Lake Bowdoin near Malta | `3acb2ca1b0a347e4861157fb67abd588` |
| `76E 01900` | East Fork Rock Creek Reservoir | `cdf80586ea15410ebee861ac51f924d3` |
| `40B 07000` | Petrolia Reservoir near Winnett | `16897ac316ab43cbaf511fdc058501ce` |
| `40A 01900` | Bair Reservoir | `771f2cee2bd6478ca8f86ebe8ada33de` |
| `40A 08900` | Deadman's Basin Reservoir | `593b5ba824304909898b0e3a04614a39` |
| `41H 01900` | Middle Creek Reservoir | `227096de7119474a9c089f0cef37ae27` |

The same point-in-polygon assignment used by the admission tools puts only
**East Fork Rock Creek Reservoir** in the drawn scope, HUC-6 `170102`
(`Pend Oreille`). The other nine drain through the Missouri system and are
outside regions 14 through 18 for the same reason the remaining Colorado
stations are outside: they ultimately reach the Gulf of Mexico. None of the
ten duplicates a published reservoir by name or point.

East Fork Rock Creek is therefore the measured Montana opportunity: one new
reservoir, not ten. DNRC publishes a 16,040-acre-foot capacity and current
storage under a stable sensor ID, but no National Inventory of Dams record was
found within the shared matching radius. A StAGE provider should first add a
small audit that reuses `admission.py`; admission then needs an explicit
decision allowing reviewed DNRC dam and capacity evidence where NID is absent.
The other useful federal checks remain Reclamation RISE for its own Montana
projects and USACE CDA for Missouri mainstem dams, but neither can add a point
inside this product's accepted drainage scope unless that scope changes.

### Arizona: the SRP page already has a usable JSON source

The SRP application bundle calls these public, keyless endpoints:

```
GET /api/watershedconnectiondata/getstationlist?getLastReadings=true
GET /api/watershedconnectiondata/getmeasurementdata
    ?measurementId=355&units=Acre-ft&startDate=2026-08-20&endDate=2026-08-28
```

The station list returned 65 stations and stable numeric `stationId` and
`measurementId` values. Seven reservoir stations publish current volume in
acre-feet. Three already overlap the roster: C.C. Cragin through AWDB, and
Horseshoe and Bartlett through USGS. Four are additive:

| Station ID | Reservoir | Storage measurement ID | Provider data ID |
|---:|---|---:|---|
| 8 | Roosevelt Lake | 355 | `LS.Official@111094033401800` |
| 23 | Apache Lake | 396 | `LS.Official@111203633352700` |
| 24 | Canyon Lake | 400 | `LS.Official@111263433331300` |
| 25 | Saguaro Lake | 406 | `LS.Official@111321133335900` |

The history endpoint returned five-minute observations with timestamp, value,
unit, approval and grade. It clips requests to a rolling three-year window
(2023-08-28 on the review date), so a one-time backfill can seed a short
standard comparison but cannot recreate the project's 2015 start or a
1991-2020 climate normal. SRP's own data-request route is the clean path for
an older reviewed archive. Reclamation's project pages and its Salt and Verde
operations study publish capacity and National ID evidence for the four dams.

No upstream webhook was found, and the JSON response explicitly disables
caching and supplies no `ETag` or `Last-Modified` validator. The best first
build is therefore ordinary polling inside the existing daily refresh: fetch
the station list once, validate the four pinned station/measurement pairs,
then request only the missing interval and reduce the five-minute series to
one daily representative value. The HTML daily report remains a useful parity
oracle because its current storage plus remaining storage states the full
level independently.

A webhook-shaped fallback is possible but adds no source evidence: an
external monitor could hash the seven storage timestamps and send GitHub's
`repository_dispatch` event only after the hash changes. That design needs an
always-on third party and a GitHub credential, while the existing scheduled
workflow already has to run once a day to refresh every other provider. It is
only defensible for a future subdaily product. Scraping the HTML, deriving
storage from lake elevation, or estimating storage from satellite area are
lower-ranked fallbacks because the JSON feed already publishes the measured
acre-foot value directly; any derived method would also need its own science
decision and uncertainty contract.

The production roster is now western and is still fed by two federal
providers, the Bureau of Reclamation and the Natural Resources Conservation
Service (`AUTHORITATIVE-SOURCE-INVENTORY.md`). This document preserves the
survey that asked the next question: **what else publishes current storage**
for a reservoir neither provider covers, and is any of it fit to build
against. Its Colorado-first recommendation was later reversed by measured
value in [`CDSS-CDEC-API-REVIEW.md`](CDSS-CDEC-API-REVIEW.md).

Every candidate is judged against two accepted decisions this project will
not trade away:

- **ADR-004** decided this project runs with no ArcGIS API key and refuses
  any credential challenge outright, because a 401 on a public dashboard
  produced "a username and password modal on a public dashboard" and a
  20-second hang rather than a clean failure. ADR-004's own text is scoped to
  the map SDK's basemaps, not to data-source keys, but the working rule this
  review holds every candidate to is the same one: a source that needs a
  credential to answer a read-only request is a conflict with an accepted
  decision, not a detail to work around, and must be flagged prominently
  rather than quietly used.
- **ADR-003** established the stable provider identity (a RISE catalog item
  id) as the thing capacity gets pinned to, and **ADR-066** generalized it:
  a reservoir is keyed by `source_station_id`, never by name, because the
  western pool holds two Lost Creeks 946 km apart, two Willow Creeks, and two
  Clear Lakes — and this review's own research below found a **third** Willow
  Creek Reservoir (Montana, state-owned) that ADR-066's authors had not seen.
  A source that identifies a reservoir only by a human-readable name is a
  poor fit before anything else about it is even measured.

## How this review was done

Three research passes covered the eleven states in parallel: California,
USACE and USGS; Colorado, Oregon, Idaho and Washington; and Arizona, Nevada,
Montana, New Mexico and Wyoming. Every endpoint, worked example, and figure
below was independently fetched and confirmed live on 2026-08-19 — none of
it is carried over from documentation alone unless the text says so
explicitly, and every claim that could not be confirmed is named in its own
section rather than smoothed over.

## Summary table

| Source | States | Key needed (ADR-004) | Identifier stability (ADR-003/066) | Capacity published | Update frequency | Verdict |
|---|---|---|---|---|---|---|
| Colorado DWR / CDSS | CO | No — verified keyless, ~20 live calls | `abbrev` and `wdid` — both stable, non-name | No, in the live storage feed (separate stale administrative series exists) | Sub-hourly, per-record timestamp, verified live | **Build first.** 128 reservoirs, ~110 not already in RISE/AWDB |
| California Data Exchange Center (CDEC) | CA | No — verified keyless | 3-letter station code + sensor number — stable | Yes, on a separate static page | Daily/hourly, timestamped, verified live | **Build first.** 154 reservoirs, confirmed overlap on two named dams |
| USGS NWIS / Water Services (parameter 00054) | CA, NM, CO, NV, OR, AZ, ID, WA, WY | No today; legacy service retires ~2027, successor rate-limits without a free key | USGS site number — the most stable id in this space | No — confirmed absent | Daily, timestamped, verified live | Build for the 9 states with coverage; **zero active sites in Utah and Montana today** |
| USACE CWMS Data API | Confirmed: MT (Missouri Basin), CA/CO/UT (Sacramento District); absent in the national API for OR/WA/ID (Columbia Basin) | No for reads, verified live | Office + structured timeseries name — stable, compound, not one field | Unconfirmed | Confirmed live but office-dependent (4-day lag seen at one station) | The one confirmed coverage gap worth closing, but fragmented by district — scope narrowly |
| Salt River Project (AZ) | AZ | No login to view | **Fails** — name only, no station id | Yes, on the HTML report only | Unconfirmed on a per-reading basis | Real data, no machine-readable form — do not build against as-is |
| Montana DNRC state-owned dams | MT | Unconfirmed | **Fails** — name only on public pages | Yes, in the static 22-dam table | Unconfirmed | Real but thin; no export found |
| New Mexico OSE/ISC (meas.ose.state.nm.us) | NM | No | **Fails** — mixed/inconsistent ids | No — does not carry reservoirs at all | N/A | Not a reservoir source |
| newmexicowaterdata.org | NM (mirrors other states too) | Apparently no | Inherited from source agency, unverified | Unconfirmed | Unconfirmed | Confirmed republisher of USGS/USBR/CO data — do not treat as new coverage |
| Wyoming WRDS | WY | Unconfirmed | **Fails** — name only | Unconfirmed | N/A — visualization only, no export found | Likely a mirror of USGS/USBR/NRCS, not an independent source |
| Oregon Water Resources Department | OR | N/A — no API to key | Station number / USBR code, seen in the UI only | Unconfirmed | N/A — stateful ASP.NET app, not a queryable endpoint | Confirmed no machine-readable endpoint; likely already RISE/AWDB territory |
| Idaho Department of Water Resources | ID | N/A | N/A | N/A | N/A | Confirmed no independent source — IDWR's own data-sources page points every reservoir row at USGS, USBR or USACE |
| Washington Department of Ecology | WA | N/A | N/A | N/A | N/A | Confirmed no independent source; Yakima system routed to Reclamation's older Hydromet system, not confirmed inside RISE |
| Arizona DWR (ADWR) | AZ | — | — | — | — | No reservoir-storage product found; groundwater only |
| Nevada Division of Water Resources | NV | — | — | — | — | No reservoir-storage source found; not exhaustively searched |

## Sources verified with a real, working endpoint

### Colorado Division of Water Resources (CDSS)

**Endpoint, verified live in this session, returning today's reading:**

```
https://dwr.state.co.us/Rest/GET/api/v2/telemetrystations/telemetrystation/?format=json&abbrev=GRARESCO
```

Returned, for Granby Reservoir — the Colorado River Storage Project's
largest Colorado reservoir:

```json
{"stationName":"GRANBY RESERVOIR","dataSourceAbbrev":"BOR","dataSource":"Bureau of Reclamation  (Station cooperator)",
 "stationType":"Storage Structure","structureType":"Reservoir","parameter":"STORAGE",
 "measValue":312018.00,"units":"AF","measDateTime":"2026-08-19T08:15:00-06:00",
 "abbrev":"GRARESCO","wdid":"5104055"}
```

The timestamp matched the time of the request — this is live telemetry, not
a cached export. Full documentation at `https://dwr.state.co.us/rest/get/help`.

- **Key:** none required. Roughly twenty live calls in this session all
  succeeded unauthenticated. An optional key raises the daily quota from
  1,000 calls / 600,000 rows (anonymous) to something higher — irrelevant at
  dashboard scale, and unlike a hard-gated source, nothing here produces a
  401 or a credential prompt.
- **Identifier:** two independent, stable, non-name keys are published on
  every record — `abbrev` (the telemetry station code, `GRARESCO`) and
  `wdid` (the Water District Identification number, the same key used across
  CDSS's structures and water-rights endpoints, `5104055` here). `wdid` is
  the more durable of the two, since it is a water-right structure
  identifier rather than a telemetry-station label.
- **Capacity:** not in this live feed. A separate historical series exists
  at `structures/divrec/divrecday`, tagged `divrectype: "StageVolume"`, which
  publishes an administrative accounting record — but for Terrace Reservoir,
  fetched as a check, that series' period of record **ended 2025-10-31**,
  roughly ten months stale as of this review. Only the
  `telemetrystations/telemetrystation` STORAGE feed is current; the
  StageVolume series must not be read as "now."
- **Units:** acre-feet, confirmed in the live payload (`"units":"AF"`).
- **Update frequency:** sub-hourly at the stations checked (readings between
  07:15 and 08:15 local time this morning across several stations), each
  carrying its own `measDateTime` and a separate `modified` field.
- **Freshness is per-station, not guaranteed by the endpoint.** Gross
  Reservoir (Denver Water, `GROSRECO`), fetched as a check, returned
  `measDateTime: "2021-09-20..."` — that station's telemetry feed has been
  stale for roughly five years, and the record still appears in a live
  query with no flag distinguishing it from a fresh one. Any ingestion needs
  a per-record freshness gate against `measDateTime`, the same discipline
  ADR-056 already applies to RISE and AWDB.
- **Terms of use:** a "Terms of Use" link exists in the CDSS site footer;
  its actual text was not retrieved in this session — flagged below as
  unverified.
- **Coverage:** the full telemetry roster (1,418 stations) was queried and
  filtered to `parameter == "STORAGE"` and `stationType == "Storage
  Structure"`, yielding **128 Colorado reservoirs** reporting current
  storage this way, across Water Divisions 1 through 7 — statewide.
- **Overlap, measured directly.** Every record self-declares its
  `dataSourceAbbrev`. Of the 128: 90 are `DWR` (state-owned), 12 are `BOR`
  (Bureau of Reclamation cooperator), 6 are `NWBOR` (Northern Water/BOR
  joint, Colorado-Big Thompson project), and the remainder split across
  `UAWCD`, `COSP`, `COE` and single-agency tags. **The 18 tagged `BOR` or
  `NWBOR`** — Granby, Blue Mesa, Green Mountain, Williams Fork, Ruedi,
  McPhee, Horsetooth, Carter, Twin Lakes, Turquoise Lake and Vallecito among
  them — are very likely the same gauges already reachable through RISE.
  **The other roughly 110** — Dillon (Denver Water, 184,880 AF), Cheesman
  (Denver Water), Gross (Denver Water), Chatfield (USACE), John Martin
  (USACE), Rueter-Hess (Parker Water & Sanitation), Steamboat Lake (Colorado
  Parks), Spinney Mountain, Homestake — are not Reclamation reservoirs and
  are this source's real value: a straightforward filter on
  `dataSourceAbbrev != "BOR" && dataSourceAbbrev != "NWBOR"` is most of the
  dedupe work before any reservoir needs a manual check.

### California Data Exchange Center (CDEC)

**Endpoint, verified live in this session:**

```
https://cdec.water.ca.gov/dynamicapp/req/JSONDataServlet?Stations=SHA&SensorNums=15&dur_code=D&Start=2026-08-15&End=2026-08-19
```

Returned a JSON array for Shasta Reservoir (station `SHA`, sensor 15 =
`STORAGE`), for example:

```json
{"stationId":"SHA","durCode":"D","SENSOR_NUM":15,"sensorType":"STORAGE",
 "date":"2026-8-15 00:00","obsDate":"2026-8-16 00:00","value":2826286,
 "dataFlag":" ","units":"AF"}
```

Multi-station, comma-delimited queries (`Stations=ORO,FOL`) were also
confirmed working. The most recent day in a query window commonly reads
`-9999` — CDEC's own not-yet-posted sentinel, which must be translated
explicitly rather than passed through, the same way this project already
refuses to encode a missing reading as a null or a zero (ADR-052's rule for
the snow calendar states the same principle for a different payload).

- **Key:** none required for this endpoint. `https://cdec.water.ca.gov/robots.txt`
  returns `Disallow: /` for crawlers, but this governs automated crawling of
  the HTML site, not a direct query to the data servlet by station and
  sensor — no user-agent gating was observed on the servlet itself, and no
  formal rate-limit or terms-of-service text was located to say otherwise.
  This is worth a second look before any high-frequency polling, since the
  robots directive is at least evidence CDEC does not want to be crawled at
  volume, even if this specific endpoint answered every query made of it.
- **Identifier:** a documented, stable 3-letter station code (`SHA`, `FOL`,
  `ORO`) paired with a sensor number (15 = storage), confirmed at
  `https://cdec.water.ca.gov/dynamicapp/staMeta?station_id=SHA` and
  `.../staSearch?sensor_chk=on&sensor=15` — a real station identifier, not a
  name.
- **Capacity:** published, but on a separate static page rather than in the
  sensor feed — `https://cdec.water.ca.gov/misc/resinfo.html` lists Shasta
  at **4,552,000 acre-feet**, matching its known gross-pool capacity. The
  page does not label the figure "normal" or "gross" explicitly, so which
  basis CDEC intends was not confirmed from the page text alone.
- **Units:** acre-feet, confirmed (`"units":"AF"`).
- **Update frequency:** daily (`dur_code=D`) confirmed live; hourly and
  monthly duration codes are documented on the query-tools page. Every
  record carries its own `date` and `obsDate`.
- **Coverage:** CDEC's own daily reservoir report states **154** "Active
  Daily Reservoir Reporting Stations in California"
  (`https://cdec.water.ca.gov/reportapp/javareports?name=DailyRes`) — all in
  California, no coverage outside the state.
- **Overlap, confirmed by name.** CDEC's own report labels Shasta and Folsom
  as U.S. Bureau of Reclamation facilities, and both have RISE catalog
  records: `data.usbr.gov/catalog/2226` (Shasta) and
  `data.usbr.gov/catalog/2304` (Folsom). Oroville (`ORO`) is a State Water
  Project facility — California DWR itself, not Reclamation — and is not
  expected to double up with RISE. Any CDEC ingestion needs the same kind
  of per-station overlap check CDSS's `dataSourceAbbrev` makes cheap; CDEC
  has no equivalent field, so the check has to be done by dam name and
  coordinate instead.

### USGS National Water Information System / Water Services

**Endpoint, verified live in this session:**

```
https://waterservices.usgs.gov/nwis/dv/?format=json&sites=10288500&parameterCd=00054
```

Returned daily-value data for **Walker Lake near Hawthorne, NV**, USGS site
`10288500`: `"variableName": "Reservoir storage, acre-ft"`, latest value
**1,164,000 ac-ft** dated 2026-08-18, qualifier `P` (provisional). Parameter
00054 is USGS's own code for "Reservoir storage, acre-feet," confirmed both
in the live response and at
`https://help.waterdata.usgs.gov/codes-and-parameters`.

- **Key:** the legacy `waterservices.usgs.gov` service required no key for
  any query in this session; its own documentation asks only for a "major
  filter" such as a site or state code, and describes informal request-rate
  guidance (roughly 5–10 requests/second steady, bursts to 40–50/second)
  rather than a hard limit. That same documentation states the legacy
  service **will be decommissioned in early 2027**, with migration pointed
  at `https://api.waterdata.usgs.gov`, whose own docs describe a 50
  requests-per-IP-per-hour ceiling without a free, self-service API key. This
  is a real, dated collision with ADR-004: keyless today, likely
  key-encouraged (though not hard-gated) after the 2027 migration.
- **Identifier:** the USGS site number — the most standardized,
  longest-lived station identifier in U.S. hydrologic data.
- **Capacity:** confirmed absent. The full expanded site-metadata record
  (`/nwis/site/?format=rdb&sites=10288500&siteOutput=expanded`) was fetched
  and its ~43 fields cover only location, administrative and physical
  metadata — no capacity or full-pool figure anywhere in it.
- **Units:** acre-feet, explicit in both the parameter name and the payload
  (`"unitCode":"ac-ft"`).
- **Update frequency:** the daily-values service (`/nwis/dv/`) is the
  practical product for this parameter — a check of the instantaneous-values
  service (`/nwis/iv/`) returned **zero** active parameter-00054 sites in
  every western state tested, so reservoir storage on NWIS is effectively a
  daily figure despite formally living on the "instantaneous" service too.
  Every reading carries a timestamp and a provisional/approved qualifier.
- **Terms of use:** "Data provided by this service is US Government work in
  the public domain," and every response embeds a provisional-data
  disclaimer directly in its `queryInfo.note` block.
- **Coverage, counted per state via live queries of active parameter-00054
  daily-value sites:**

  | State | Active 00054 sites |
  |---|---:|
  | California | 28 |
  | New Mexico | 24 |
  | Nevada | 14 |
  | Colorado | 13 |
  | Oregon | 9 |
  | Arizona | 8 |
  | Idaho | 7 |
  | Washington | 6 |
  | Wyoming | 4 |
  | **Utah** | **0** |
  | **Montana** | **0** |

  **Utah and Montana currently have zero actively reporting USGS
  reservoir-storage sites.** For a Utah-rooted dashboard this matters: NWIS
  adds essentially nothing to the existing roster today and would only pay
  off as the roster expands into the nine states with coverage. Site
  activation status changes over time and is worth rechecking periodically.
- **Overlap:** not cross-checked site by site against RISE, AWDB, CDEC or
  USACE in this session. Walker Lake, the worked example, is a naturally
  terminal lake rather than a dam-controlled project tied to Reclamation or
  USACE operations, which suggests some NWIS reservoir-storage sites are
  genuinely additive — but that is an inference from one example, not a
  verified finding, and needs a name/coordinate reconciliation pass before
  any site is treated as new.

### U.S. Army Corps of Engineers CWMS Data API

The roster has no source for USACE reservoirs at all today, and USACE
operates major western reservoirs across the Missouri and Columbia systems —
the single largest confirmed coverage gap in the current roster.

**Endpoint, verified live in this session, returning a real storage
reading — Fort Peck Dam & Reservoir, Montana:**

```
1. https://cwms-data.usace.army.mil/cwms-data/locations?names=FTPK&office=NWDM
   -> {"office-id":"NWDM","name":"FTPK","public-name":"Fort Peck Dam & Reservoir",...}

2. https://cwms-data.usace.army.mil/cwms-data/catalog/timeseries?office=NWDM&like=FTPK.*Stor.*
   -> "FTPK.Stor.Inst.~1Day.0.Best-MRBWM", latest extent 2026-08-15T05:00:00Z

3. https://cwms-data.usace.army.mil/cwms-data/timeseries?office=NWDM&name=FTPK.Stor.Inst.~1Day.0.Best-MRBWM&begin=2026-08-01T00:00:00Z&end=2026-08-16T00:00:00Z&unit=m3
   -> [[1785560400000, 1.577129877488259E10, 0], ...]
```

That last value is roughly **12.8 million acre-feet** after unit conversion,
plausible against Fort Peck's approximately 18.5 million acre-foot capacity.
None of these three calls carried any authentication header, and none
produced a 401 or 403.

- **Key:** not required for these reads. The project's own GitHub repository
  (`github.com/USACE/cwms-data-api`) states authentication gates write
  access only, consistent with what was observed.
- **Identifier:** locations are keyed by `office-id` + `name` (`NWDM` /
  `FTPK`), and timeseries by a structured, documented name — `Location.
  Parameter.ParameterType.Interval.Duration.Version`
  (`FTPK.Stor.Inst.~1Day.0.Best-MRBWM`). This is a genuinely stable,
  government-maintained identifier, though it is a compound string rather
  than a single opaque id, and a roster entry would need to store the full
  timeseries name alongside the office.
- **Capacity:** not confirmed published through this API; a `/levels`
  endpoint exists and may carry pool or flood-control levels, but was not
  checked against Fort Peck specifically in this session.
- **Units:** cubic meters (`m3`) by default for the Fort Peck series, not
  acre-feet — confirmed in the live payload. The API accepts a `unit=`
  query parameter; whether an acre-feet unit code is accepted was not
  tested.
- **Update frequency:** the most recent Fort Peck value at the time of the
  check was dated 2026-08-15, a roughly four-day lag behind the 2026-08-19
  check date. A separate Sacramento District series checked for comparison
  was only two to three days stale, so lag is office-dependent rather than a
  single global cadence. Every value carries its own timestamp.
- **Terms of use / rate limits:** not confirmed. The GitHub repository states
  the API code itself is public domain/MIT-licensed; no explicit published
  rate-limit figure was located.
- **Coverage, confirmed empirically and unevenly:**
  - `NWDM` (Missouri River Basin Water Management — MT, WY, CO, NE, KS, SD)
    returned Fort Peck (MT), Oahe (SD) and Fort Randall (SD) among 12,060
    total locations under that office — that count includes river gauges and
    sub-basin points, not 12,060 reservoirs.
  - `SPK` (Sacramento District — CA, CO, UT) has **260 storage-related
    timeseries**, current to within a few days, including both
    wholly-USACE reservoirs and jointly compiled "Section 7" reservoirs.
  - `NWP` (Portland District — the Willamette Valley and Columbia Basin
    projects, e.g. Detroit, Lookout Point, Dworshak) returned **zero**
    storage timeseries and zero matching project locations in the national
    API as of this check. That data instead appears to live on the
    Northwestern Division's own separate portal,
    `https://www.nwd.usace.army.mil/CRWM/Water-Control-Data/`, whose
    structure was found by search but not independently fetched, so whether
    it offers anything machine-readable beyond an HTML report is
    unconfirmed. **The Columbia Basin — the core of USACE's Oregon,
    Washington and Idaho presence — is not reachable through the national
    CWMS Data API today.**
    *(Corrected 2026-08-29: it is reachable, under the regional office
    `NWDP`, not the districts. See the follow-up at the top of this file.)*
  - Sacramento District separately runs a legacy HTML report site,
    `https://www.spk-wc.usace.army.mil/`, covering California, Colorado and
    Utah flood-control reservoirs including non-Corps "Section 7" dams
    through tabulated report pages — this reads as pre-CDA HTML reporting,
    not a documented JSON/CSV API, and was not confirmed machine-readable.
- **Overlap, confirmed.** At least one Sacramento District series is
  explicitly labeled USBR-combined data (a Beardsley Lake series carrying
  `Rev-USBR-Combined` in its name) — meaning USACE and Reclamation can
  publish figures for the same physical reservoir under different offices
  and ids. This needs the same name/coordinate cross-check as every other
  overlap risk in this review.

## Sources checked and found to have no independent machine-readable endpoint

**Oregon Water Resources Department.** The near-real-time hydro tool at
`https://apps.wrd.state.or.us/apps/sw/hydro_near_real_time/` is a stateful
ASP.NET WebForms application (confirmed via raw HTTP fetch: IIS 10.0,
ViewState-driven `.aspx` postbacks). A direct, parameterized GET to
`DisplayHydroGraph.aspx?station_nbr=...` returned an HTTP 302 to an error
page, confirming the tool requires interactive form navigation rather than
accepting a simple query string — it cannot be treated as a machine
endpoint without scraping a session. The tool's own station listing shows
some Oregon reservoir stations keyed directly by "Station ID (Number or
USBR code)," a signal that Oregon's reservoirs likely already surface
through Reclamation RISE, consistent with the 38 Oregon candidates the
admission review already found via AWDB. `oregonwaterdata.org` returned no
fetchable body content in this session (likely a JavaScript-rendered page
this tooling could not execute), so it remains unconfirmed rather than
ruled out.

**Idaho Department of Water Resources.** IDWR's own "Water Supply Data
Sources" page (`https://idwr.idaho.gov/water-data/water-supply/data-sources/`)
is itself an outbound-links page, and every reservoir-storage row on it
points to a federal system, not an IDWR one: Mackay Reservoir to USGS NWIS,
the Boise/Payette and Upper Snake systems to Reclamation's Hydromet system,
the Pacific Northwest/Columbia system to USACE, and the Bear River to the
interstate Bear River Commission. IDWR's ArcGIS Open Data Hub
(`https://data-idwr.hub.arcgis.com/`) was checked via its DCAT-US feed
(`.../api/feed/dcat-us/1.1.json`, 283 datasets, keyless) — its one
dam-related dataset, "Dams of Idaho," is confirmed to be a dam-safety
hazard/inventory map under Idaho Code 42-1709–1721, not a current-storage
feed. **Idaho contributes no independent source; IDWR's own documentation
defers every reservoir to USGS, Reclamation or USACE.**

**Washington Department of Ecology.** Ecology's "Statewide conditions" page
is a narrative summary, not a data service — it states current Yakima
system figures in prose ("61% of full capacity") and links out to
Reclamation's older Pacific Northwest **Hydromet** system, a separate,
older web system from `data.usbr.gov/rise`; whether those Hydromet stations
are already indexed inside RISE was not checked and should not be assumed.
Washington's major reservoirs — the five Yakima Project reservoirs and the
Columbia system's Grand Coulee/Banks Lake — are federally operated
(Reclamation or USACE), consistent with the thin independent state coverage
expected going in. Ecology's other public tools (Freshwater DataStream, the
EIM/Freshwater Information Network) are water-quality and streamflow
oriented, with no reservoir-storage fields found in what was surfaced.

**Nevada Division of Water Resources.** `water.nv.gov/index.php/data` lists
precipitation, streamflow, well-level and water-use data — no reservoir or
dam storage dataset is described. An ArcGIS Hub link
(`data-ndwr.hub.arcgis.com`) returned HTTP 404 and was not otherwise
verified. Nevada's major reservoirs (Mead, Mohave, Lahontan) are already
Reclamation dams, and Walker Lake — the one Nevada reservoir this review did
verify data for — came through USGS NWIS, not a Nevada state source.

**Wyoming Water Resources Data System (WRDS).** The surface-water and
"Water and Climate Explorer" pages at `wrds.uwyo.edu` are confirmed to be
map and "teacup diagram" visualizations only — no API, bulk download, JSON
or CSV export was found on any page checked. WRDS describes its own data as
drawn from 13 source agencies with USGS as the largest, making it a likely
**republisher** rather than an original collector even for a reservoir this
project does not otherwise track. Wyoming's State Engineer's Office site
surfaced only SNOTEL reporting (already AWDB territory) and water-rights
administration pages, nothing reservoir-specific.

**Arizona Department of Water Resources (ADWR).** Its data-dashboards page
(`azwater.gov/adwr-data-dashboards`) covers groundwater, drought and
assured/adequate water supply determinations — no surface reservoir storage
product was found.

## Sources with real data but no clean fit

**Salt River Project (Arizona).** SRP's daily water report at
`https://streamflow.watershedconnection.com/dwr` was fetched and confirmed
to show current elevation, storage in acre-feet, remaining capacity to
full, 24-hour change, rainfall and percent full for Roosevelt, Apache,
Canyon, Saguaro, Horseshoe and Bartlett — real, current numbers. No JSON,
CSV or documented API was found; a guessed `/api/dwr` path returned 404.
Reservoirs are identified only by name in the URL and on the page — a clean
ADR-066 failure. Two of these dams (Roosevelt and Bartlett) are federally
owned by Reclamation, but RISE's own catalog record for Roosevelt
(`data.usbr.gov/location/3713`) carries only a historical sedimentation
survey, not a current daily storage series, so **SRP is currently the only
place this data exists at all** — a real gap, just not one this project can
build against as published today.

**Montana DNRC state-owned dams.** A fetched page
(`dnrc.mt.gov/Water-Resources/State-Owned-Dams-and-Canals/`) lists 22
state-owned dams with capacity in acre-feet, but only about eight link to
any near-real-time monitoring page, with no unified table or export across
them. A separate map application, StAGE
(`gis.dnrc.mt.gov/apps/stage/gage-report`), could not be confirmed either
way to expose an underlying REST/JSON service. DNRC's own pages explicitly
point to Reclamation's data for the federal reservoirs it does not
duplicate, confirming no overlap there but also confirming DNRC's own
coverage stops short of the Missouri mainstem dams this review reached
through USACE instead. This research also surfaced a real instance of the
exact naming hazard ADR-066 was written to prevent: Montana's state-owned
**Willow Creek Reservoir** is a third Willow Creek, distinct from the
Colorado one already published and the Oregon candidate already flagged in
`WESTERN-RESERVOIR-ADMISSION.md`.

**New Mexico.** `meas.ose.state.nm.us`, the state's real-time water
measurement system, is public and keyless but does not carry reservoir
storage at all — it links out to USGS and Reclamation for that, and its own
station identifiers are an inconsistent mix of USGS numbers, local names
and water-rights codes. A separate project, `newmexicowaterdata.org`, does
expose a genuine machine-readable interface — a CKAN catalog API plus a
live OGC SensorThings API (`FROST-Server` endpoints) that appears keyless —
but its own dataset description states it carries "reservoir elevation and
storage data from USGS, Colorado Department of Water Resources, and U.S.
Bureau of Reclamation." That is a **confirmed republisher**, not an
independent New Mexico source, and using it risks double-counting
reservoirs this project already has through RISE or a future Colorado
source — the exact failure ADR-046 and this review's overlap rule both
exist to prevent.

## What I could not verify

- **Whether USACE CWMS publishes reservoir capacity anywhere**, and its
  formal terms of use or rate limits. A `/levels` endpoint that may carry
  pool figures was not queried against Fort Peck.
- **Whether an acre-feet unit code is accepted by the CWMS `unit=`
  parameter** — the worked Fort Peck example returned cubic meters, and
  conversion was done by hand for this document.
- **Whether the Northwestern Division's own Columbia Basin water-control
  portal (`nwd.usace.army.mil/CRWM/Water-Control-Data/`) is machine-readable
  in any form.** It was located by search but not fetched directly, so
  Oregon, Washington and Idaho's USACE reservoirs remain a confirmed
  coverage gap with an unconfirmed second path around it.
- **Whether the Sacramento District legacy report site
  (`spk-wc.usace.army.mil`) is anything more than tabulated HTML.**
- **CDSS's actual Terms of Use text.** A footer link exists; its content was
  not retrieved.
- **CDEC's formal terms of use or rate-limit policy beyond `robots.txt`.**
  The `Disallow: /` directive was found and is noted above, but no separate
  terms page confirming or narrowing what it means for direct API-style
  queries (as opposed to crawling the HTML site) was located.
- **Whether CDEC's published capacity figures are gross pool or a
  regulated/normal figure** — the one example checked (Shasta) was not
  labeled either way on the page it came from.
- **Per-site overlap between USGS NWIS reservoir-storage sites and
  RISE/AWDB/CDEC/USACE**, beyond the single Walker Lake example, which
  suggested but did not prove some NWIS coverage is genuinely additive.
- **Whether Reclamation's older Pacific Northwest Hydromet stations (behind
  Washington Ecology's Yakima-system link) are already indexed inside RISE**
  or would need separate ingestion — treated as an open question, not
  assumed either way.
- **`oregonwaterdata.org`'s actual contents** — it returned no fetchable
  body in this session, likely because it is a JavaScript-rendered
  application this tooling could not execute; this is a verification gap,
  not a finding of absence.

## Recommendation

**Build against Colorado CDSS and CDEC first.** Both returned a real,
current, correctly-unitted storage value in this session with no
credential of any kind, both key on a genuine stable identifier rather than
a name, and CDSS in particular ships a self-declared `dataSourceAbbrev`
field that makes the RISE-overlap check close to mechanical — filter out
`BOR` and `NWBOR` and roughly 110 of 128 Colorado reservoirs are left, none
of them already on the roster through Reclamation. Both sources share the
same missing piece this project has already solved once: neither publishes
capacity in its live feed (CDEC keeps it on a separate static page; CDSS's
capacity-shaped series is administratively stale), which the National
Inventory of Dams — already adopted under ADR-003 — can very likely fill
the same way it already fills that gap for RISE and AWDB reservoirs.

**USGS NWIS is a real third pick, but not for Utah today.** It is keyless,
carries the strongest identifier of any candidate here, and has confirmed
coverage in nine of the eleven states — but zero active reservoir-storage
sites were found in Utah or Montana, so it would add nothing to the current
roster and only pays off as western admission proceeds. Its 2027
decommission deadline is real and specific enough to put a date on: build
against the legacy endpoint now, and revisit before the migration rather
than after.

**Treat USACE as the priority gap, and a genuinely fragmented one.** It is
the only candidate here that plausibly answers the roster's single largest
hole — zero USACE reservoirs today, against a real western fleet of them —
and this review did produce one working example, Fort Peck, with a real
current-ish storage value. But coverage is confirmed uneven by design: solid
in the Missouri Basin and Sacramento District, and **absent from the
national API for the Columbia Basin**, which is exactly where Oregon,
Washington and Idaho's USACE reservoirs sit. Scope this as two separate
questions rather than one integration: what the national CDA can already
reach (Missouri Basin, Sacramento District), and whether the Northwestern
Division's own Columbia Basin portal is machine-readable at all, which
remains unverified.

**Do not build against SRP, Montana's state-owned dams, WRDS, or
newmexicowaterdata.org as published today.** Each fails ADR-066 on
identifier, or turns out on inspection to be a republisher of data this
project can already reach more directly, or both. SRP is the one exception
worth remembering rather than discarding: it is genuinely the only current
source for six real Arizona reservoirs, two of them federally owned with no
current data in RISE at all, and if SRP ever publishes a stable
per-reservoir identifier or a structured feed, it moves straight to the top
of this list.

## The count that was missing (2026-08-21)

Item 5 of the water-body scoping said nobody could size the USGS question
until a number existed. Measured with `tools/probe_nwis_storage.py` against
the legacy daily-values service -- distinct sites answering parameter
`00054` with `siteStatus=active` and values inside the last seven days, so
**active means reporting**, not merely registered:

| State | Reporting 00054 sites | Within 3 km of a published point |
|---|---:|---:|
| Arizona | 6 | 4 |
| Nevada | 8 | 4 |
| Idaho | 3 | 3 |
| **Oregon** | **9** | **9** |
| Washington | 6 | 2 |
| Wyoming | 2 | 2 |
| **Total** | **34** | **23** |

Two readings, and they point the same way:

**Oregon needs nothing from USGS.** All nine reporting sites are already on
the roster through NRCS and Reclamation -- the probe matched every one to a
published reservoir within metres, which is also the first real evidence
that the roster and NWIS describe the same ground rather than different
gauges.

**The genuinely additive remainder is eleven, not thirty-four.** Arizona
contributes two -- **Horseshoe and Bartlett, the Salt River Project pair**
whose absence from RISE this document already recorded -- plus Nevada's four
(Walker Lake, Topaz Lake, Weber Reservoir, Little Washoe Lake; the first is
the terminal-lake example the survey worked from, the second straddles the
California line), Idaho's one (Milner), and Washington's four (Wynoochee,
Alder, Mud Mountain, Lake Tapps -- the Puget Sound/Tacoma fleet the Columbia
Basin CWMS gap predicted). The counts are smaller than the 2026-08-18
registration table above because a seven-day window drops registered-but-
quiet sites; both tables are true of their own definitions.

**This sizes the item as a provider, not a project**: roughly a dozen new
reservoirs across six states, each still needing a dam match for its
denominator under ADR-072 -- the expensive step named in the scoping's step
3, unchanged by this count. The 23 near-duplicates are *candidates*, listed
by the probe and ruled nowhere: promoting any of them to confirmed duplicate
is a review judgement under ADR-069, and the retirement warning about the
legacy endpoint (2027) stands exactly as written above.

## Still open, checked against the roster on 2026-08-21

The survey above was made before California and Colorado were promoted. With
those two built, the published roster holds 375 reservoirs, and six of the
eleven states remain thin: **Idaho 25, Washington 18, Wyoming 9, Nevada 6,
Arizona 4** — 62 reservoirs between them, fewer than Utah's 58 from the two
federal providers alone. Oregon's 45 are federal as well.

Nothing above has been acted on for those six -- except this count, which
became the U.S. Geological Survey's admission on 2026-08-22: seven of the
eleven additive reservoirs published, four held with findings in
`admitted_usgs_reservoirs.json` (Walker Lake's needs ADR-078's dam rule
changed first). USACE CWMS for the confirmed Columbia Basin gap has not been
measured, and Nevada's own entry above says its search was not exhaustive.

The next pass, and the order to work it in, is scoped in
[`WATER-BODY-AND-NAVIGATION-SCOPING.md`](WATER-BODY-AND-NAVIGATION-SCOPING.md),
section 5. **This document remains the authority for what each source is**;
that one records only what is left to do about it and what has to be counted
before anyone can size it.
