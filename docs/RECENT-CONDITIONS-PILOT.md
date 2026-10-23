# Recent conditions pilot

Status: authorized scope and implementation plan, 2026-10-23.
Decision: [ADR-121](decisions/ADR-121-bound-recent-conditions-to-a-static-data-pilot.md).
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
