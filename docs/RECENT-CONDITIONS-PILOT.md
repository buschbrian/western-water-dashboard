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
| `suggested_ruling`, `suggestion_reason` | A tier worked out from the columns above, and every finding behind it. Recomputed on every write; never copied into the ruling |

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
| `exclude` | The gauge's own name is a tunnel, drain or canal (`FAIRVIEW TUNNEL NEAR …`), not a river measured beside one | Not shown |
| `check` | The basin was not traced, or the trace differs from the published drainage area by more than 25% | Unresolved until the basin is checked |
| `shaped` | A published reservoir sits in the traced basin, or the name places the gauge below a diversion, canal, tunnel or powerplant | Flow shown and labelled as shaped upstream; not ranked against normal |
| `short` | The record starts after 1 January 1991 | Flow shown; no comparison with normal |
| `natural` | None of the above | Flow shown and compared with normal for the date |

The rules see only published reservoirs and diversions a gauge's name
mentions. An unlisted reservoir, a canal that takes water upstream or a
transbasin import can still make a `natural` row wrong. Write the ruling in
`reviewer_ruling` as one of the five tiers (blank means not yet reviewed),
and a reason in `notes` when it differs from the suggestion. How each tier
is published is a method decision for the pilot's flow record, not settled
by this worksheet.

First suggestions, 2026-10-24: 51 `natural`, 81 `shaped`, 18 `short`,
11 `check`, 3 `exclude`. A useful order is the 14 `check` and `exclude`
rows first, then the 51 `natural` rows, where a missed diversion costs most.

### Private review page

The maintainable source and republish procedure are in
[`tools/gauge-review/`](../tools/gauge-review/README.md). The private page saves
rulings to its own store, not directly to this worksheet. Export and review the
records before merging by USGS site number. A `natural` ruling is a candidate
classification, not approval of a normal: completeness within 1991–2020 and
the flow comparison method still need separate review.

The area flag compares `(traced - published) / published`. Both numbers must
refer to the same outlet and area definition before the difference is treated
as a delineation error. NLDI's default basin is the full upstream network,
including the whole local catchment; it does not stop at an upstream dam.
Thus the basin above Deer Creek includes the basin above Jordanelle. Land
between reservoirs would require subtracting the union of verified upstream
basins, and an area percentage is not a percentage of flow or storage.
See the source notes for the worked example and USGS references.

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
