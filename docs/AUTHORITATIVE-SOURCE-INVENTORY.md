# Authoritative source inventory

Status: Maintained inventory, checked 2026-08-20

This inventory turns the source preference in the modernization plan into a
review checklist. It separates measurement services from map services because
an ArcGIS service is not automatically the best source for a measurement. The
data owner's public API remains the source for storage and snow measurements;
the data owner's ArcGIS REST layer is preferred for boundaries and facility
geometry.

## Rules for choosing a source

1. Use a public service operated or named by the data owner.
2. Use the owner's measurement API for observed values. Do not replace it with
   an ArcGIS display layer that may round, delay, or omit records.
3. Prefer the owner's ArcGIS REST layer for spatial context when the dashboard
   can set a deadline and keep useful local data on screen after a service
   failure.
4. Commit normalized measurements, reviewed assignments, and analytical
   geometry when a changing live response would make a published result hard
   to reproduce.
5. Use geometry accurate to about 100 metres or finer for new GeoJSON. A
   coarser file needs measured size savings, unchanged analytical results, and
   an architecture decision.
6. Record one current owner, endpoint, update schedule, failure behavior, and
   copy policy for every source before it becomes a dashboard layer.

## Current inventory

| Data | Authoritative owner and service | Dashboard use | Copy and update behavior | Failure behavior | Geometry and status |
|---|---|---|---|---|---|
| Reservoir storage observations | Bureau of Reclamation data API: `https://data.usbr.gov/rise/api/result` | Daily and month-end storage records | `refresh_reservoirs.py` validates and commits a normalized `reservoirs.json` each day. `tools/audit_rise_reservoirs.py` joins the live catalogues and records the reviewed admission funnel without writing production data | An individual failure keeps the last known record; a broad failure does not replace the complete payload | No geometry is taken from this service. Twenty-five western daily items admitted under ADR-069; the reviewed roster is source-only. Adopted. |
| Reservoir storage observations | Natural Resources Conservation Service water and climate API: `https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data` | Daily and month-end storage records for provider stations | The same normalized daily payload as above | The same per-site and broad-failure checks as above | No geometry is taken from this service. Adopted. |
| Dam capacity and outlet points | U.S. Army Corps of Engineers National Inventory of Dams public ArcGIS service: `https://geospatial.sec.usace.army.mil/dls/rest/services/NID/National_Inventory_of_Dams_Public_Service/FeatureServer/0` | Capacity evidence, dam identifiers, outlet points used for drainage-area assignment, and the physical identity used to deduplicate providers | Capacity and point decisions are committed so an upstream edit cannot change a past assignment during a daily refresh | No runtime dependency; a deliberate rebuild stops before writing if a dam is absent or implausibly far from its reservoir | Adopted 2026-08-18, replacing the hosted copy at `https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/NID_v1/FeatureServer/0`. The parity report is below. ADR-069 keeps it as the default capacity source but permits a named reservoir-operator project record to resolve an explicit conflict; Billy Clapp, Keswick and Cachuma are the three committed exceptions. The layer is pinned rather than searched for. |
| Drainage areas | U.S. Geological Survey Watershed Boundary Dataset ArcGIS service: `https://hydro.nationalmap.gov/arcgis/rest/services/wbd/MapServer`. Each hydrologic level is a layer on it — HUC2 is 1, HUC4 is 2, HUC6 is 3, HUC8 is 4 — and the scope's level decides which is queried. The published dashboard reads layer 3, for the 75-basin `west-huc6` scope (ADR-063). | Boundaries, labels, reservoir assignment, and drainage-area summaries | Scope fetches obtain the complete object-ID set, validate it, and commit GeoJSON. Scope changes are deliberate, not part of the daily refresh | No runtime service dependency; a failed rebuild leaves the last verified file in place | A scope file a figure is measured against requests `0.0005` degrees, about 56 metres, under ADR-037: measurement showed the source stops adding vertices past that point. `huc6.geojson` was refetched at it when the outlines became a drawn subject, and `data/watersheds/west-huc6.geojson` when it became the drawn scope (ADR-063) -- at the 100-metre default two of the fourteen published drought figures moved by a tenth of a point, which is a rounding step at the precision this project publishes. Unpublished research scopes still request `0.001`. Adopted. |
| Utah state boundary | Utah Geospatial Resource Center Utah State Boundary ArcGIS service: `https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/UtahStateBoundary/FeatureServer/0` | Python's `in_utah` and `intersects_utah` point-in-state checks. No map draws a mask from it any more (ADR-067); the outside-state mask this row used to serve is retired | `scripts/fetch-utah-boundary.mjs` validates one Utah polygon and commits the normalized copy when run | No runtime service dependency; a failed rebuild writes nothing | Requests `0.0001` degrees, about 10 metres. Adopted under ADR-014. |
| Current drought polygons | U.S. Drought Monitor ArcGIS service, produced by the National Drought Mitigation Center, U.S. Department of Agriculture, and National Oceanic and Atmospheric Administration: `https://services5.arcgis.com/0OTVzJS4K09zlixn/arcgis/rest/services/USDM_current/FeatureServer/0` | Source geometry for the drought map and drainage-area statistics | The daily workflow validates the complete current layer and commits `data/drought/usdm-current.geojson`; the producer normally publishes a new map each week. Coverage is computed for both offered levels and the current and prior weeks are retained | A failed independent download keeps the last verified polygons and coverage files and does not block current reservoir data | Requests `0.001` degrees, about 100 metres. Adopted and loaded by the Drought page. |
| Snow monitoring-site inventory | Natural Resources Conservation Service station API: `https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations`, joined to the full-resolution U.S. Geological Survey drainage-area layer | Reviewed station list and drainage-area assignment | `snow_sites.json` is a committed inventory rebuilt deliberately | No runtime service dependency; an incomplete inventory build writes nothing | Full-resolution drainage-area geometry is used for point assignment. Adopted. |
| USGS reservoir storage observations | U.S. Geological Survey OGC daily-values collection: `https://api.waterdata.usgs.gov/ogcapi/v0/collections/daily/items`, parameter 00054, acre-feet | Daily storage records for seven admitted sites in Arizona, Nevada and Washington | `refresh_reservoirs.py` validates and commits them into the same normalized `reservoirs.json`. The reviewed statistic is pinned per station. `tools/audit_usgs_stations.py` gathers admission evidence and `tools/check_usgs_migration_parity.py` compares the retired path before cutover; four candidates remain held with findings | An individual failure keeps the last known record; a broadly failed run does not replace the complete payload. The API key is held only by the pipeline and sent in `X-Api-Key` | No geometry is taken from this service. The provider publishes no full level, so every denominator comes from the dam inventory under ADR-003/ADR-072. Migrated under ADR-098 on 2026-08-29. |
| Upstream contributing areas | U.S. Geological Survey Network-Linked Data Index over NHDPlus: `https://api.water.usgs.gov/nldi`. Keyless, anonymous, CORS-open | What drains to each reservoir: the contributing basin polygon (tool input, never published) and which published reservoir and snow points sit inside it | `tools/build_upstream_index.py` traces every published reservoir once -- position, COMID, basin, point-in-polygon against this project's own rosters -- and commits `upstream_index.json` with the COMID as evidence (ADR-077). Derived on demand: rebuilt after an admission or a snow-network change, not daily. Published verbatim in `dist/`; the details panel and each reservoir page read it | The tool screens rather than empties (`no_flowline`, `no_basin`, service errors carry reasons), flags basins past 300,000 square miles for review, and aborts with nothing written on a quota refusal. A failed browser fetch costs the panel's upstream row, not the page | No geometry is published from this service. Traces start at the reviewed dam point where one exists, at the published waterbody point otherwise; self-inclusion is excluded by rule. Adopted 2026-08-22. |
| Snow measurements | Natural Resources Conservation Service water and climate API: `https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data` | Daily snow-water values and 1991–2020 comparisons | `refresh_snowpack.py` validates the 637-site western inventory and writes `snowpack.json` atomically | A short response is retried per station; a bounded number of missing sites is named in the payload, and a broader failure keeps the previous complete payload | No geometry is taken from this service. Adopted and loaded by the Snowpack page. |
| Reservoir discovery and basin references | Bureau of Reclamation public ArcGIS feature services, including `https://services5.arcgis.com/HDRa0B57OVrv2E1q/ArcGIS/rest/services/Reclamation_Reservoirs/FeatureServer` | Discovery, scope review, and design comparison only | No ArcGIS feature-service response is copied into daily observed storage | An outage cannot change or stop the measurement refresh | Reference only. Promote a specific layer only after its fields, update schedule, and failure path are documented here. |
| Map background | Esri public basemaps `oceans` (leading), `dark-gray-vector`, `gray-vector`, `topo-vector`, and direct portal item `7dc6cea0b1764a1f9af2e679f642f0f5` | Optional geographic background on every map | Loaded at runtime; no local copy | Each candidate has a 10-second deadline. The application tries the next candidate and ultimately keeps reservoirs and drainage areas visible without a background map | Optional runtime context. Adopted under the existing anonymous-access and fallback contract. `oceans` leads both theme chains from 2026-08-16: its bathymetry and shaded relief are the terrain the water sits in, which the deliberately featureless gray canvases could not show. Its base is a public tile service and its labels a public vector style; both were verified anonymous before adoption. |
| State boundaries | Esri full-resolution boundaries, published by Esri Demographics from U.S. Census Bureau geography: `https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Census_States/FeatureServer/0` | Outlines and state names on the drought map, where the national drought sweep needs something that says which land it crosses | Loaded at runtime; no local copy. Nothing on any page is computed from these boundaries | An 8-second deadline; a layer that does not answer is not added, and the drought classes, drainage outlines, reservoirs and every published figure are already drawn from local data | Full resolution, adopted 2026-08-19 after measurement: quantized to the view, the detailed layer costs no more on the wire than the generalized one (511 KiB against 534 KiB, drought page, both layers, reproducible). Optional runtime context, adopted 2026-08-16. Verified anonymous. |
| County boundaries | Esri full-resolution boundaries, published by Esri Demographics from U.S. Census Bureau geography: `https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Census_Counties/FeatureServer/0` — the same layer the county assignment and drought selection use, so the drawn line and the selected county agree | Outlines and county names on the drought map, hidden until the reader has zoomed past 1:2,500,000 | Loaded at runtime; no local copy. Nothing is computed from the drawn `FeatureLayer`; the separate assignment and selected-scope queries are governed by the row below | The same 8-second deadline and the same non-addition on failure | Full resolution, adopted 2026-08-19; see the row above for the measurement. Optional runtime context, adopted 2026-08-16. The scale limit is on the layer, not only its labels, so it does not fetch features nobody will see. Verified anonymous. |
| County assignment and drought county selection | Esri Living Atlas, USA Census Counties, layer `dtl_cnty`: `https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_Census_Counties/FeatureServer/0`. Marked authoritative; carries the U.S. Census Bureau 2020 boundaries | Which county each reservoir sits in, for the storage search and filter axis (ADR-058); which whole drawn-level drainage areas intersect a reader's county on drought (ADR-091). Neither use is a county aggregation | `tools/build_county_assignments.py` resolves one point per reservoir and commits `counties.json`. Drought reads a chosen state's county list at runtime, then sends the selected boundary to the drawn-level WBD service and keeps the matching codes; weekly drought shares still come only from the committed HUC payload | The assignment builder stops before writing on any missing point. An unchosen drought county list fills independently and may report unavailable; a chosen county has a deadline and falls back to the wider place with an on-page notice rather than holding the page forever or claiming a county result | Assignment copies no geometry. Drought requests geometry at `0.001` degrees only for row selection and commits none; a Utah County probe reduced 450 KB to 12 KB with unchanged HUC-2/4/6/8 matches. The *detailed* layer remains required for reservoir assignment because the generalized layer puts Lost Lake outside Wasatch County. Adopted 2026-08-18; drought selection added 2026-08-23. |
| Drought-monitor land mask | U.S. Census Bureau TIGERweb, layer 0 of the States and Counties service: `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0`. The same owner-operated service the county assignment reads, one layer up | The extent the drought engine measures against, so land the monitor does not cover is reported as unmeasured rather than as land with no drought on it (ADR-059) | `tools/fetch_us_land_mask.py` validates that every western state is present and commits `data/us-land.geojson`. Rebuilt deliberately, never during the daily run | No runtime dependency. A missing mask **stops** the coverage run rather than defaulting: running without one does not fail, it silently reports every border basin's far half as drought-free, which looks like a clean run | Requests `0.001` degrees, the 100-metre default under rule 5; no exception is claimed, because the sampling grid is an order of magnitude coarser and a finer mask could not move a published figure. Committed, never published -- the engine reads it offline like `huc6.geojson`. Adopted 2026-08-18. |
| Drainage-area boundaries, drawn | Esri Living Atlas copies of the USGS Watershed Boundary Dataset, one service per level: `https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Watershed_Boundary_Dataset_HUC_6s/FeatureServer/0` (and the HUC 4s and HUC 8s beside it) | The drainage outlines and shapes the maps draw | Loaded at runtime, scoped by an explicit list of the units in scope. The committed `huc6.geojson` remains the assignment source, so which unit a reservoir belongs to is still reproducible from a file and never depends on a service | The same deadline and non-addition on failure as the boundaries above | Measured before adopting: the fourteen published basins cost about 12 KB at 1:18,000,000 and 24 KB at 1:9,000,000 once the SDK quantizes them to the view, against 982 KB for the same outlines inside `reference.json`. The saving is the quantization, not the hosting -- the same features fetched in bulk are 935 KB. This service ignores `maxAllowableOffset`. Verified anonymous. |

## Source slices and their outcome

### 1. Migrate the dam inventory reference -- done 2026-08-18

Scoped as a five-step parity exercise. Two of the five steps turned out not to
exist, and the measurement found something the plan had not looked for.

**Step 2 was retired by measurement.** Both services publish **81 fields under
the same names** -- `NIDID`, `NAME`, `NID_STORAGE`, `MAX_STORAGE`,
`NORMAL_STORAGE`, `LATITUDE`, `LONGITUDE`. There was nothing to normalize.

**The parity report passed with nothing to review.** All 29 committed dam
identifiers resolve in both services, returning **33 rows each** -- the counts,
the names, all three storage figures and both coordinates agree row for row.
Zero unexplained losses, zero differing values. Rebuilding the dam points
against the owner service reproduces all 29 committed positions exactly.

**What the parity plan did not ask about: a dam identifier is not unique.** It
names a *project*, and three of the committed ones return several structures --
Lost Lake and Hyrum have a dike beside the dam, Stateline has two. Every row of
a project carries the same storage, so capacity was never exposed; the
coordinates differ by up to 600 metres, and that point is the drainage-area
assignment point. `tools/add_dam_points.py` kept whichever row arrived last,
so the two services' different row orders produced different committed points
from identical data. It now chooses the principal structure by rule. No
published assignment changes either way at HUC-6, where every structure of a
project falls in one drainage area -- see ADR-057 for why that is a property of
the level rather than of the data.

**Step 5 is done.** `tools/build_capacity_table.py` no longer locates its layer
by searching ArcGIS Online for the most-viewed copy -- a search that could never
reach this service, since USACE runs its own ArcGIS Server and publishes nothing
to ArcGIS Online, and that wrote its result into `capacities.json` as the
provenance. All five active tools name the owner service, and
`src/source-inventory.test.ts` rejects the retired URL in every one of them and
in the three committed files that republish it.

### 2. Publish drought statistics before a drought view -- done 2026-08-16

The pipeline intersects the verified current polygons with the committed
western geography, distinguishes measured U.S. land from cross-border land,
and publishes dated class shares for both the 75-basin and 44-subregion
levels. The Drought page reads those checked results. The current file carries
the prior week for weekly change, and the level-six archive retains the longer
history. A missing land mask or mismatched week stops the coverage update.

### 3. Split research geography from the first page load when measured -- done 2026-08-18

The measured split became ADR-048 and ADR-049. `reference.json` carries the
drainage-area roster, names, states, and boxes but no polygon geometry.
Committed geography remains the reproducible assignment and measurement
source; browser maps request view-quantized outlines from the hosted Watershed
Boundary Dataset. Research scopes stay committed and are not copied to
`dist/`.

### 4. Keep the hosted boundary layers inside their contract

The state and county layers were the first runtime service dependency any
dashboard view took on for map context, so the condition rule 3 states is
enforced in code rather than assumed: `src/arcgis/reference-layers.ts` loads
each layer against a deadline and adds it to the map only if it answered. The
browser suite therefore checks the layer list against what actually loaded
rather than against a fixed list -- a refused service is a supported outcome,
and a test that failed on it would be testing the publisher's uptime instead of
this project's behavior.

ADR-091 adds one bounded selected-scope use on drought. An unchosen county
list never blocks the figures. A chosen county must resolve before first paint,
but failure widens with a notice instead of producing a result. The WBD query
returns codes only; the committed weekly HUC payload remains the sole source of
every drought number.

Two things to watch if they change upstream. The name fields are read once each
(`STATE_NAME`, `NAME`); a rename would silently produce blank labels rather than
an error. The drawn layers use Esri's own generalizations rather than a
tolerance this project requested. Drought's separate county-selection query is
the stated exception: it requests `0.001` degrees, selects whole WBD rows and
is never a source for an analytical figure.

### 5. Add a third reservoir provider only after its evidence agrees

California's Data Exchange Center and Colorado's Division of Water Resources
both answer keyless requests with stable station identifiers. The measured
review in [`CDSS-CDEC-API-REVIEW.md`](CDSS-CDEC-API-REVIEW.md) puts
California first by water covered, and **California was promoted on
2026-08-20; re-audited 2026-08-28**: 147 reservoirs publish current
observations from it, and the
denominator decision this rule required is recorded as ADR-070 -- where the
provider that publishes the readings also publishes a full level, that figure
is the denominator, and it carries its own citation in the reviewed roster.

Twelve California candidates are still held where the dam, the full level or
the series disagree, and each is named with its finding in
`admitted_cdec_reservoirs.json` rather than published over.

**Colorado followed on 2026-08-21, scoped to the drawn drainages.** The
service's telemetry carries storage for 142 stations; 91 sit on the eastern
slope, whose drainages reach the Mississippi basin and are outside the drawn
western scope, so ten stations were admitted (`admitted_cdss_reservoirs.json`)
and three held with findings. This provider publishes no full level of its
own, so ADR-070 never fires for it: every denominator is the dam inventory's,
chosen per ADR-072 as the smallest record figure the water has not been seen
above. Its daily refresh costs about 400,000 rows against the service's own
published 600,000-row daily quota, which the admission review records as an
operating constraint rather than a problem -- nothing else may share that
quota on a refresh morning.

### 6. Move the Geological Survey to its modern service -- cut over 2026-08-29

ADR-080 built the provider against the keyless legacy daily-values service and
named its early-2027 retirement as debt. ADR-098 spends that debt: the modern
OGC daily collection, a key held only by the pipeline and sent in a header,
and the reviewed daily statistic committed beside each station -- because
Weber Reservoir exposes two of them and selecting by response order would let
a published figure change with no decision behind it.

**The comparison ADR-098 requires has been run at day level and agrees
everywhere.** `tools/check_usgs_migration_parity.py` compares the two services
directly and needs the key for its modern half. What has been measured without
one is the published output against the retired service, and it is repeatable
by anyone on any morning:

```bash
.venv/bin/python tools/check_usgs_migration_parity.py --against-published
```

For each of the seven stations it takes the day the payload reports and the
three days its 7, 30 and 365-day changes are measured from -- **28
comparisons spanning a year, all 28 identical**, Weber Reservoir among them.
That confirms site identity, the chosen statistic and the unit on real
published values, and it exits non-zero if that ever stops being true.

**The full-series comparison has now been run, and agrees everywhere.** With
`USGS_API_KEY` set, `--days 365` compared both services day by day for all
seven stations on 2026-08-29: **2,496 days on each side and nothing
differing**. The day counts match station for station -- 365 where the record
is complete, 362 for Alder Reservoir and 309 for Mud Mountain Lake -- so
neither service omits a day the other returned, which is the second half of
what the tool calls a pass.

Mud Mountain Lake is measured on statistic `30800` where the other six use
`32400`. That is the reason ADR-098 committed the statistic beside each
station rather than taking whichever the service returned first, and the run
is the evidence it was the right call.

**Where the key comes from, because ADR-098 does not say.** The record
decided that the pipeline holds a key and never says how one is obtained,
which is how a documented dependency becomes tribal knowledge. It is issued
by the service itself at <https://api.waterdata.usgs.gov>. It belongs in two
places and nowhere else: the repository's `USGS_API_KEY` Actions secret,
which the morning workflow reads, and the shell of whoever runs the parity
tool by hand. It is never committed, never placed in a request URL, and
never sent to a reader's browser.

```bash
gh secret set USGS_API_KEY --repo buschbrian/western-water-dashboard
```

**The repository had no such secret when this was written**, so the migrated
provider had never run anywhere but on the machine that migrated it. A run
without the key is not silent: each of the seven records carries the failure
as its `fetch_error`, the refresh prints that text rather than the generic
quiet-feed note, and the self-healing stale-feed issue opens once the
two-day threshold passes. ADR-056's sixty days is the outer bound for
withdrawal, not the time to notice.

## Review boundary

This inventory records ownership and current behavior; it does not claim that
every upstream value is final. Provider values can be revised. Source changes
that can alter a measurement, capacity, point assignment, or geographic scope
require a parity report and a separate reviewed change.
