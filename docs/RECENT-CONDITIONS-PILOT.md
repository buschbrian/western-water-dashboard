# Recent conditions pilot

Status: authorized scope and implementation plan, 2026-10-23.
Decision: [ADR-124](decisions/ADR-124-bound-recent-conditions-to-a-static-data-pilot.md).
No pilot observations, uploader or raster layer are published yet.

## What the first view answers

Show recent precipitation, daily river flow and mountain snow-water changes
for a small reviewed Utah station set. Keep the existing weekly drought
comparison accessible for the selected place. Carry the shared `state`,
`area` and `level` URL parameters; time window and selected gauge belong
to the pilot's own state. A date-specific link needs an archived snapshot;
the current view must not pretend to reproduce an earlier storm.

## Feasibility evidence

One six-request live probe on October 23 returned:

| Input | Result |
|---|---|
| USGS Provo River at Provo and Logan River above State Dam | Two metadata requests and two daily-series requests; 30 observations each, September 23–October 22 |
| AWDB Brighton, Mill-D North and Snowbird | One request for daily WTEQ and PREC, October 1–23 |
| NOAA latest-24-hour Stage IV CONUS GeoTIFF | One request; 225,412 bytes; GDAL recognized a 1121 by 881 grid and observation units of inches |

The six requests took 2.098 seconds combined in one run and returned 285,890
decoded bytes. This is not a wire-transfer measurement or a latency guarantee.
An illustrative JSON encoding of the flow and mountain records was 18,184
bytes raw / 1,794 bytes gzip level 6, retaining quality flags. It excludes
rasters, existing data and all application assets. The locations are probes,
not an admitted connected watershed set. An earlier single-gauge request was
separate from this measurement.

The experiment did not calculate precipitation watershed averages, review
normal periods, test browser rendering or establish a production quota.
Its temporary raw artifacts are not committed; rerun a dated probe before
using any measurement as an implementation acceptance result.

## Implementation sequence

1. Complete the stable dependency upgrade and existing verification.
2. Review a small Utah gauge roster and its regulation context. Use the
   USGS v1 API; cache metadata and fetch overlapping recent windows so
   revisions can be incorporated. Review the existing v0 adapter separately
   before moving the published reservoirs to v1.
   `tools/build_gauge_review.py` writes the evidence for this review to
   `gauge-review.csv`; see [Gauge review worksheet](#gauge-review-worksheet).
3. Establish precipitation valid windows, nodata coverage, projection and
   area-weighted basin summaries. Use dedicated raster tooling outside the
   existing three-dependency daily environment until the added dependency is
   justified. AWDB PREC is cumulative precipitation; it is not a daily total.
4. Write validated compact JSON and dated raster artifacts. Upload into an
   isolated R2 namespace and publish the current manifest last. Preserve the
   prior complete set on failure. Choose an explicit retention period before
   enabling archival cleanup.
5. Implement one accessible view with source dates, units, quality status,
   exact-value downloads and stable links. Do not sum nested gauges or equate
   a nearby gauge with measured reservoir inflow.
6. Compare direct COG display with pre-generated image tiles in system
   Chromium. ArcGIS still marks direct COG support beta and limits supported
   projections/compression. Preserve numerical source data independently of
   display resampling. Verify range responses, CORS, cache behavior and
   missing-data rendering before selecting the raster path.

Target at most 100 KB gzipped of additional opening JSON. Fetch station
histories and rasters on demand. Measure raster requests, total transfer,
render readiness, interaction, accessibility and errors separately against
the same device, viewport and network baseline. No page-speed claim follows
from the probe's server response times.

## Gauge review worksheet

`gauge-review.csv` lists every U.S. Geological Survey stream gauge in Utah
whose primary daily mean discharge series reported within seven days of the
screen. It is evidence for a ruling, not a roster: nothing reads it at
refresh time, and a gauge enters the pilot only when `reviewer_ruling` says
so. Rerunning the builder refreshes the screen and trace columns and never
changes `reviewer_ruling` or `notes`.

| Column | Meaning |
|---|---|
| `record_begin`, `last_daily_value` | The series' own period, from `time-series-metadata` |
| `covers_1991_2020` | The record starts by 1 January 1991. Gaps inside it are not checked |
| `trace_screen` | `traced`, `not_indexed` or `no_basin` are findings; anything else was the service, and `--missing` retries it |
| `nldi_basin_sq_mi`, `trace_check` | The NLDI basin indexed to the gauge, and a note when it differs from the published drainage area by more than 25% |
| `upstream_reservoirs`, `upstream_snow_sites` | Published reservoirs and snow sites inside that basin |
| `usgs_page` | The gauge's U.S. Geological Survey page, for checking a row by hand |
| `mean_flow_cfs`, `flow_years` | Mean of the water-year mean flows from 1991 on (the whole record when fewer than five fall there), from the U.S. Geological Survey annual statistics |
| `dams_upstream`, `dam_storage_af`, `largest_dams` | Every National Inventory of Dams record inside the basin outline the review page draws, and their storage counted once per pool: a dike carrying its reservoir's storage within 10 km is not a second pool |
| `storage_share_pct` | That storage as a percentage of one year's mean flow (the degree of regulation) |
| `irrigation_dams` | Dams in the basin whose listed purposes include irrigation, a prompt to look for canals |
| `dams_near_gauge` | Dams within 1 km of the gauge: the whole local catchment is traced, so one may sit below it |
| `gages2_class` | `reference`, `non_reference` or `not_listed` in the USGS GAGES-II point file (2011; fetched at build time, 0.7 MB, checked 2026-10-27). A reference gauge was least disturbed in 2011; it says nothing of later dams. `--reference-evidence` fills it |
| `nrcs_adjustment_pct` | NRCS adjusted over observed stream volume (`SRVO` over `SRVOO`) at the station with this gauge's number, in percent, over the months both exist since October 1991. `no_pair` and `no_data` are written as such. 5 or more in either direction is a finding: the flow is altered, not by what |
| `usgs_site_type` | `ST-CA` or `ST-DCH` when USGS now lists the site as a canal or ditch, otherwise `ST` (the screen admits only `ST`) |
| `huc8_name` | The watershed name the review page groups by |
| `suggested_ruling`, `suggestion_reason` | A tier worked out from the columns above, and every finding behind it. Recomputed on every write; never copied into the ruling |
| `proposed_display_name`, `name_patterns`, `name_check` | A readable name worked out from the station name by `tools/gauge_names.py`, the rules that fired, and what a person must check (a token the rules cannot settle stays as written). A proposal to accept, as with the reservoir names worksheet; nothing published is renamed (ADR-137) |
| `review_queue` | `bulk` when the suggestion is `exclude`, `reservoir` or `natural` by small storage, nothing else is in doubt, and it may be agreed a watershed at a time; `check`; otherwise `review` |
| `accepted_display_name` | The name a person accepted on the review page, merged by the importer like a ruling (ADR-138). Never written by the builder |

An upstream reservoir means storage can shape the flow. It is not a
finding that the flow is regulated, and the gauge does not measure that
reservoir's inflow. NLDI basins are simplified polygons; check a reservoir
listed close to a basin edge before relying on it.

First screen, 2026-10-23: 164 gauges, 118 covering 1991–2020. 157 traced
and 7 are not indexed by NLDI (tunnels, drains and small Wasatch Front
creeks). 79 have a published reservoir upstream; 34 have none, cover
1991–2020 and have a snow site upstream. Seven traced areas differ from the
published drainage area by more than 25%; Daniels Creek at Charleston
traced about 404 square miles against 50 and needs an outlet and flowline
check; the difference alone does not establish its cause. Early
requests took 13 to 150 seconds each, against the half second measured in
August, so the trace runs resumably; later requests were fast.

### Reviewing the worksheet

`.venv/bin/python tools/build_gauge_review.py --suggest` recomputes the
suggestions offline. Each row gets the strongest of its findings:

| Tier | Rule | What a ruling of this tier would mean |
|---|---|---|
| `exclude` | The gauge's own name is a tunnel, drain or canal (`FAIRVIEW TUNNEL NEAR …`), not a river measured beside one; or USGS lists the site as a canal or ditch (`ST-CA`, `ST-DCH`) | Not a river; not shown |
| `check` | The basin was not traced, or the trace differs from the published drainage area by more than 25% | Unresolved until the basin is checked |
| `diversion` | The name places the gauge below a diversion, canal, ditch, powerplant or tunnel; or NRCS adjusts the gauge's volume upward by 5% or more and no storage finding explains it (a negative adjustment is a review note) | Flow shown and labelled as reduced by diversions upstream; not ranked against normal |
| `reservoir` | A published reservoir sits in the basin, whatever else is found; or inventoried dams hold at least 10% of a year's flow (or hold storage and the gauge has no mean flow) | Flow shown and labelled as shaped by reservoirs upstream; not ranked against normal |
| `short` | The record starts after 1 January 1991 | Flow shown; no comparison with normal |
| `natural` | None of the above. Storage under 10% of a year's flow with no published reservoir in the basin, irrigation dams and a dam beside the gauge are kept as findings for the reviewer | Flow shown and compared with normal for the date |

Strongest first: `exclude`, `check`, `diversion`, `reservoir`, `short`,
`natural`. A diversion finding is about the gauge, a reservoir finding about
its basin, so a row with both is `diversion` and goes to review. The reader
words for the keys are `TIER_WORDS` in `tools/build_gauge_review.py` (ADR-138).

The rules see inventoried dams, published reservoirs and diversions a
gauge's name mentions. A canal that takes water out without a dam, a
transbasin import or city use can still make a `natural` row wrong. The 10%
line is Brian's ruling (ADR-137); it is not a finding that smaller storage leaves the flow
natural, and a small irrigation dam can take most of a dry-season flow. Write the ruling in
`reviewer_ruling` as one of the five tiers (blank means not yet reviewed),
and a reason in `notes` when it differs from the suggestion. How each tier
is published is a method decision for the pilot's flow record, not settled
by this worksheet.

First suggestions, 2026-10-24: 51 `natural`, 81 `shaped`, 18 `short`,
11 `check`, 3 `exclude`. A useful order is the 14 `check` and `exclude`
rows first, then the 51 `natural` rows, where a missed diversion costs most.

**Storage evidence, 2026-10-26.** `tools/build_gauge_review.py --evidence
--basins <bundle>/gauges.json` reads the outlines the review page draws,
asks the dam inventory for every dam in their combined box (2,473; fetched
by object id because the service's offset paging overlaps) and the annual
statistics service for each gauge's water-year means (150 of 164 answered;
ten sites per request is the service's limit). Suggestions moved to 26
`natural`, 110 `shaped`, 14 `short`, 11 `check`, 3 `exclude`: 25 rows
suggested natural had unpublished dams holding 2% or more of a year's flow
(the Dirty Devil's Johnson, Mill Meadow and Forsyth hold 58%). Queues: 96
`bulk`, 57 `review`, 11 `check`.

**Agreeing the safe direction in bulk.** The two mistakes do not cost the
same: a natural river ruled shaped loses only its comparison with normal;
a shaped river ruled natural publishes a wrong one. So `bulk` holds only
suggestions in the safe direction -- shaped by storage at or above the line
or by a named diversion, or excluded by the gauge's own name -- with no dam
near the gauge. The review page groups gauges by watershed and agrees a
group's open `bulk` rows after a second press, with a note saying so. A
ruling already made, or a local draft, is never overwritten.

**Rulings of 2026-10-27 (ADR-137).** A published reservoir in the basin
makes the gauge `shaped`, no matter what else is found. With none, inventoried
storage under 10% of a year's flow is `natural`; at or above 10% it stays
`shaped`. The Utah suggestions moved from 26 `natural`, 110 `shaped`, 14
`short`, 11 `check`, 3 `exclude` to 39, 96, 15, 11, 3; queues from 96 `bulk`,
57 `review` to 79 and 74. Five Utah names carry a `name_check`. Colorado, New
Mexico and Arizona worksheets take the new rules and columns when
`--suggest` runs on them after their traces end.

**Tier split, reference evidence and bulk queue (ADR-138).** `shaped` is
two tiers: `reservoir` (Shaped by reservoirs) and `diversion` (Reduced by
diversions); `exclude` reads as Not a river. A saved `shaped` ruling stands as
`reservoir` unless the row has a diversion finding; then it returns to review.
Bulk covers three outcomes: not a river, shaped by reservoirs and natural by
measured small storage, each only when no near-gauge dam, short record,
diversion evidence or added water is in doubt. Irrigation dams and GAGES-II
non-reference hold back a natural row only. Utah moved from 39 `natural`, 96
`shaped`, 15 `short`, 11 `check`, 3 `exclude` to 37, 91 `reservoir` + 7
`diversion`, 15, 11, 3; queues from 79 `bulk`, 74 `review` to 72 and 81.
Evidence coverage in Utah: 116 of 164 in GAGES-II (20 reference), 77 with an
NRCS pair (16 adjusted by 5% or more), none a canal or ditch.

```bash
.venv/bin/python tools/build_gauge_review.py --state UT --reference-evidence
.venv/bin/python tools/build_gauge_review.py --state UT --suggest
```

### Private review page

The maintainable source and republish procedure are in
[`tools/gauge-review/`](../tools/gauge-review/README.md). The private page saves
rulings to its own store, not directly to this worksheet. Export and review the
records before merging by USGS site number. A `natural` ruling is a candidate
classification, not approval of a normal: completeness within 1991–2020 and
the flow comparison method still need separate review.

Saved exports can be previewed and explicitly merged with
`tools/import_gauge_rulings.py` (ADR-130). The default is read-only; existing
rulings or notes require a site-specific replacement flag. Invalid or unsaved
records refuse the entire batch. Import does not admit gauges. See the
[review source procedure](../tools/gauge-review/README.md#merge-an-exported-review).

The area flag compares `(traced - published) / published`. Both numbers must
refer to the same outlet and area definition before the difference is treated
as a delineation error. NLDI's default basin is the full upstream network,
including the whole local catchment; it does not stop at an upstream dam.
Thus the basin above Deer Creek includes the basin above Jordanelle. Land
between reservoirs would require subtracting the union of verified upstream
basins, and an area percentage is not a percentage of flow or storage.
See the source notes for the worked example and USGS references.

## Next slice: daily river response and Provo drainage review

Brian selected daily river response and drainage review on 2026-10-24,
ahead of basin precipitation/raster work. Start with observed daily means;
the normal period, coverage gates and rank method are still undecided.

### Candidate connected set

Proposed first prototype: three gauges spanning the reservoir sequence.
These are **candidates, not admissions**. The committed worksheet screen is
dated 2026-10-23; it is not a fresh observation fetch. All seven rows in
HUC8 `16020203` still have blank reviewer rulings at this checkpoint.

| Candidate | Traced upstream reservoirs | Published / traced area (sq mi) |
|---|---|---|
| `10155000` Provo River near Hailstone | Lost, Trial and Washington lakes | 230 / 222 |
| `10155200` Provo River at River Road Bridge near Heber | Jordanelle and those three lakes | 270 / 261 |
| `10163000` Provo River at Provo | Deer Creek, Jordanelle and those three lakes | 673 / 675 |

All three suggestions are `shaped`, based on the containment evidence. That
does not establish the degree or timing of regulation. Their flows must be
shown separately, never added or described as measured reservoir inflow.
The middle gauge's record starts in 2001; no baseline claim follows from
the longer records at the other two gauges either.

Two tributary candidates need explicit drainage investigation before use:
Snake Creek (`10156000`, 31.8 / 23 sq mi) and Daniels Creek (`10157500`,
50.1 / 404 sq mi). Compare indexed outlets, flowlines and matching area
definitions, then inspect full catchment versus split-catchment geometry.
Do not diagnose a bad trace from area percentages alone. Record the actual
geometry and source settings before computing an area between reservoirs.
The existing reservoir index has areas and member IDs, not validated
difference polygons.

### Acceptance for the first observed-flow prototype

1. Brian reviews the candidate gauges and their context. Saved rulings move
   through the preview/import workflow; suggestions are never copied into
   rulings automatically. A review tier alone is not a production roster.
2. Request a bounded 30-day daily mean discharge series using the USGS v1
   API and explicitly identified primary series. Preserve agency observation
   dates, approval status, qualifiers, units and source identity. Keep
   missing values missing and validate identity/unit/range mismatches before
   they can become measurements.
3. Fetch overlapping recent dates on refresh so revisions replace previous
   values without duplicating days. Determine the overlap and failure/freshness
   policy in a method decision before connecting a daily job. Keep the old
   complete snapshot if the replacement fails validation.
4. Exercise the provider, revision merge and payload validator with synthetic
   fixtures first, including missing/provisional/estimated values, competing
   series, duplicate dates, zero flow and provider failures. Real station
   admission is a separate reviewed input, never a test fixture side effect.
5. Show exact daily values, dates, quality and downloads in one accessible
   map/history view. Label it as daily mean flow: it cannot establish a
   sub-daily storm peak, a present rising-water alert or flood safety.
6. Keep existing page opening data unchanged, measure the added JSON against
   the 100 KB gzip budget, and verify the real browser before publication.

The importer and local observed-flow prototype are built. Brian approved this
three-gauge, 30-day preview on 2026-10-24. It uses the USGS daily mean
discharge series, validates its site/series/date/unit, preserves daily
approval statuses and qualifiers, and exports exact readings and flags. The
window ends 2026-10-23: all 90 returned values are provisional, with no other
qualifiers reported. The full response is approximately 4.1 KB gzipped. The
preview output and cached maps remain outside the repository; nothing entered
the public route or daily refresh. A browser rendering check is still open.

The local prototype is a proof of the observed-value and review presentation,
not a production delivery. Real roster admission, scheduled revision refresh,
failure and freshness policy, payload ownership, map measurement, browser
accessibility and a public view still need review. Raster processing, R2
delivery, flow normals, automated gauge admission and edits to the private
Artifact are outside this first slice.

USGS documents daily observations separately from continuous readings and
keeps approval status distinct from other qualifiers in the
[OGC migration guide](https://api.waterdata.usgs.gov/docs/ogcapi/migration/)
(checked 2026-10-24). Verify the v1 schema and exact series metadata when
implementing the adapter; the current reservoir adapter still uses v0 and
must not be migrated incidentally.

## Credentials and hosting

The existing refresh and normals workflows already reference the repository
secret `USGS_API_KEY`. Reuse it; GitHub does not return its plaintext value.
Local Python reads exported environment variables. R2 is optional until the
uploader is implemented; its names below are the agreed configuration
contract for that future uploader, not currently consumed application inputs.

| Variable | Meaning |
|---|---|
| `USGS_API_KEY` | Existing USGS key, pipeline only |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Bucket-scoped Object Read & Write credential |
| `R2_ENDPOINT_URL` | S3 endpoint from the bucket's account/jurisdiction |
| `R2_BUCKET` | Destination bucket |
| `R2_PREFIX` | Isolated namespace, initially `western-water-dashboard/` |
| `R2_PUBLIC_BASE_URL` | HTTPS public base URL mapped to the bucket root |

Copy `.env.example` to the ignored `.env.local` and fill it locally, or
inject variables through a secret manager. Python does not load dotenv files.
In Bash, export a locally authored file before running a provider tool:

```bash
set -a
source .env.local
set +a
```

Do not prefix private credentials with `VITE_`: that namespace is exposed
to browser code. Store CI credential values in Actions secrets; keep account
and bucket identifiers out of committed files too. No new ArcGIS credential
is required by the proposed public data path.

For production R2 delivery, use a custom domain, explicit caching and CORS,
and verify HTTP Range support for COGs. Never enable public access or change
whole-bucket settings on a mixed business bucket merely to serve this pilot;
inspect its existing policy and use a dedicated bucket if isolation requires
it. The user's existing Cloudflare access is authorized; no account or bucket
was changed during this preparation.

## Sources

- [USGS v1 migration](https://api.waterdata.usgs.gov/docs/ogcapi/migration/)
- [NOAA precipitation downloads](https://api.water.noaa.gov/about/precipitation-data-access)
- [NRCS AWDB](https://wcc.sc.egov.usda.gov/awdbRestApi/swagger-ui/index.html)
- [ArcGIS COG support and limitations](https://developers.arcgis.com/javascript/latest/references/core/layers/ImageryTileLayer/)
- [R2 credentials](https://developers.cloudflare.com/r2/api/tokens/)
- [R2 public hosting](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Prior streamflow analysis](STREAMFLOW-SCOPING.md)
