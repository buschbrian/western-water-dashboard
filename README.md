# Western Water Dashboard

**Live site:** <https://buschbrian.github.io/western-water-dashboard/>

A public dashboard for reservoir storage, mountain snow, and drought across
the western United States. It combines official observations, reviewed full
levels, climate comparisons, weekly drought measurements, and drainage-area
context in one typed ArcGIS 5.1 and Calcite 5 application.

The project began as a Utah reservoir map. Its current scope follows five
western hydrologic regions across eleven states. The application can draw five
regions, 44 subregions, 75 basins, or 571 drought subbasins. It reads a reviewed
western reservoir roster fed by five observation providers and a western
network of automated mountain snow sites. Counts that can change with provider
reporting are read from the runtime payloads rather than written into
application code.

## Dashboard pages

| Page | What it answers |
|---|---|
| [Western Reservoir Storage](./) | Where water is stored now, how full each reservoir is, and how levels compare with earlier years. |
| [Western Storage Charts](overview.html) | What moved this week and how the current reservoir set compares across charts and an exact-value table. |
| [Reservoir Details](reservoir.html?name=Lake%20Powell) | One reservoir at a time: its reading, both comparisons, its twelve-month history, and its sources. Every published reservoir has one. |
| [Western Snowpack](snow.html) | How much water is held in mountain snow, by site and drainage area, against the 1991–2020 comparison period. |
| [Western Drought](drought.html) | How much land is in each U.S. Drought Monitor class and how that relates to stored water. |
| [Methods and Sources](methods.html) | Where each number comes from, how it is worked out, and what it does not claim. |
| [Public Data API](data.html) | Stable JSON paths, field definitions, update behavior, and code examples. |
| [Terms and License](terms.html) | Project terms, source-data terms, and the noncommercial code license. |

`modern.html` is a stable alias for the storage map. The former ArcGIS 4.34,
MapLibre, and overview paths are accessible compatibility redirects. They
preserve saved links without restoring retired runtimes.

## Use the dashboard

The storage map lets a reader:

- point at or select a reservoir for its storage, full level, reading date,
  comparison period, history rank, and change over time;
- narrow the view by place, storage class, reporting status, Lake Powell, or
  Lake Mead. The place controls run coarsest to finest — State, then County,
  then Area size, then the one hydrologic tier that size names (ADR-095).
  State changes the roster and the totals; County and the hydrologic area are
  analysis filters that dim the rest and leave every total alone;
- move or play the month slider through the last twelve published months;
- open a keyboard-reachable reservoir list;
- sort the matching reservoirs in a table and download the exact rows and
  order on screen as CSV or WGS84 point GeoJSON; and
- share the complete view through the address bar.

The storage map opens on the complete western roster, with Lake Powell and
Lake Mead both in the totals. Each is large enough to dominate a regional
figure, so each keeps its own switch and every page states which of the two
the figure beside it holds. The separate Utah-waterbody reservoir scope was
retired with its `?reservoirs=` parameter (ADR-087); Utah is reachable through
the same State control as every other state.

A first visit with no link and no remembered place opens a short chooser: a
state or a hydrologic region, and one of the four data views. It is skippable
in one action, it is never shown over a shared link, and the choice it produces
is the same `?state=` and `?area=` a reader can set from the controls. The
place is remembered between visits; a link always outranks it.

The storage charts use the same geographic and reservoir scope. Their search,
filters, summary strip, six ArcGIS charts, and semantic table update together.
Every published reservoir also has a page of its own —
`reservoir.html?name=...` — linked from the map's details panel and from each
other surface that names one; a reservoir whose feed goes quiet keeps its page
and says its reading was withdrawn rather than disappearing into an error.
The page also shows its Region → Subregion → Basin path, copyable decimal and
DMS coordinates, and a link to the current snow-measuring sites upstream of
it when the committed trace contains any. Snowpack can export the sites now
listed as WGS84 point GeoJSON.
The snow and drought pages share the reader's chosen state or drainage area
where that choice has the same meaning, and every page writes its own view to
a shareable URL.

## Quick start

Requirements:

- Node.js 22
- Python 3.11 or newer for pipeline work
- Playwright Chromium, or a local Google Chrome executable, for browser tests

```bash
npm ci
npm run dev
```

Vite opens the storage map. The maps need network access for Esri basemaps and
hosted reference layers. Stored measurements still load when an optional map
service does not answer.

### Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server. |
| `npm run verify:fast` | Typecheck and run the Vitest unit suite. |
| `npm run verify:frontend` | Typecheck, unit tests, SDK bundle budget, and build `dist/`. |
| `npm run verify:pipeline` | Run pipeline, source, geography, and measurement tests. |
| `npm run verify:browser` | Build, then check every page in Chromium, including axe-core. |
| `npm run verify:all` | Everything above, in order. |
| `scripts/refresh-daily.sh --dry-run` | Print the daily refresh plan and its published file list. |
| `python refresh_reservoirs.py --dry-run` | Fetch and validate reservoir data without writing. |
| `python tools/build_normal_baselines.py --missing` | Build only missing 1991–2020 reservoir comparisons. |
| `node tools/audit-transfer.mjs` | Measure page requests and hosts against a built `dist/`. |

The individual steps (`npm run typecheck`, `npm test`, `npm run budget:sdk`,
`npm run build`, `node tests/smoke.mjs`, `node tests/smoke-modern.mjs`) all
still exist; the `verify:*` targets are what CI runs and what
[`docs/operations/verification.md`](docs/operations/verification.md) explains.

Playwright is intentionally not a package dependency. Restore it after an
ordinary `npm install` with:

```bash
npm install --no-save --no-package-lock playwright
```

To use an installed Chrome instead of downloading Chromium:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node tests/smoke-modern.mjs
```

## Data and methods

The browser fetches runtime JSON. It never imports a daily payload into an
application bundle. This keeps a data-only morning commit deployable without
turning measurements into compiled source.

Stable public paths are documented on the [data page](data.html):

| Path | Contents |
|---|---|
| `/api/reservoirs.json` | Current storage, comparisons, changes, twelve-month history, reporting status, source identity, and geography. |
| `/api/snowpack.json` | Water-year site series and drainage-area summaries against 1991–2020. |
| `/data/drought/usdm-huc6.json` | Weekly drought shares for 75 basins. |
| `/data/drought/usdm-huc4.json` | The same week measured over 44 larger subregions. |
| `/data/drought/usdm-huc8.json` | The same week measured over the finer subbasins (ADR-088). |
| `/data/drought/usdm-current.geojson` | The verified current U.S. Drought Monitor polygons. |
| `/api/reference.json` | Reviewed capacity evidence and the drainage-area roster, without polygon geometry. |
| `/data/upstream_index.json` | For each reservoir, the published reservoirs and snow sites on land that drains to it (ADR-077). |

The daily pipeline reads observations from nine providers: the Bureau of
Reclamation, the Natural Resources Conservation Service, the U.S. Geological
Survey, the California Department of Water Resources, the Colorado Division
of Water Resources, the Salt River Project, the Montana Department of
Natural Resources and Conservation, the U.S. Army Corps of Engineers and the
Central Arizona Project. The Salt River Project, Montana and the Central
Arizona Project are operators publishing readings for water they run
themselves, rather than agencies publishing for everyone; the
Corps' water-management service carries the Columbia Basin, its own projects
and the public-utility dams on the mainstem alike (ADR-102). Dam evidence comes from the U.S. Army Corps of Engineers
National Inventory of Dams. Drainage areas come from the U.S. Geological
Survey Watershed Boundary Dataset, and what drains to each reservoir from the
same agency's Network-Linked Data Index (ADR-077). Drought data comes from the
U.S. Drought Monitor. The complete ownership and failure contract is in
[`docs/AUTHORITATIVE-SOURCE-INVENTORY.md`](docs/AUTHORITATIVE-SOURCE-INVENTORY.md).

California is a production provider, re-audited 2026-08-28: 147 reservoirs,
read from the state's own service, with the full level taken from the operator's
published figure wherever it publishes one (ADR-070). Twelve candidates
are held rather than published and
[`admitted_cdec_reservoirs.json`](admitted_cdec_reservoirs.json) names each
with the finding behind it. Colorado followed on 2026-08-21 with ten
reservoirs inside the drawn drainages — 91 of the state's storage stations sit
on the eastern slope, outside the drawn western geography — held to the same
review in
[`admitted_cdss_reservoirs.json`](admitted_cdss_reservoirs.json). The review
of both sources is in [`docs/CDSS-CDEC-API-REVIEW.md`](docs/CDSS-CDEC-API-REVIEW.md)
and [`docs/COLORADO-ADMISSION-REVIEW.md`](docs/COLORADO-ADMISSION-REVIEW.md).

The U.S. Geological Survey became the fifth provider on 2026-08-22 with seven
reservoirs in Arizona, Nevada and Washington, admitted on confirmed dam
matches; four more candidates are held with their findings in
[`admitted_usgs_reservoirs.json`](admitted_usgs_reservoirs.json). It is the
only provider that publishes no full level of its own, so every one of its
denominators comes from the dam inventory. It now reads the agency's modern
OGC daily collection, which needs an API key: the key is a pipeline-only
secret that never reaches a reader's browser, and the reviewed daily statistic
is committed beside each station so the service cannot silently change which
series a published number came from (ADR-098).

The Salt River Project and Montana's Department of Natural Resources and
Conservation followed on 2026-08-29 — four Arizona reservoirs on the Salt
River system, and East Fork Rock Creek in Montana. Both publish a full level
for water they operate themselves, so both denominators are the operator's own
figure (ADR-070). East Fork Rock Creek is the one reservoir on the roster with
no dam inventory record behind it at all; ADR-099 admits it on the operator's
own location and full level, and its roster file states the absence as a
finding rather than leaving a blank field.

The U.S. Army Corps of Engineers became the eighth provider on 2026-08-29
(ADR-102), reading the Columbia Basin under the Northwestern Division's
Pacific Northwest region office — the Corps' own projects and the
public-utility dams on the mainstem in Idaho, Oregon, Washington and western
Montana. Each roster entry pins the office and the whole series name, because
the series' version suffix says whose number it is: forecasts and readings
republished from the Bureau of Reclamation are refused, and every denominator
comes from the dam inventory. The admitted locations and every one held back,
with its finding, are in
[`admitted_cwms_reservoirs.json`](admitted_cwms_reservoirs.json).

The Central Arizona Project followed the same day (ADR-104) with Lake
Pleasant, Arizona's largest reservoir with no feed until then. Its endpoint
publishes one current record and no history, so the series grows in the
dense-history cache from the day of admission; its percent of full is measured
against the dam inventory's normal storage, and the operator's own percentage
of the maximum pool is recorded beside it as a finding in
[`admitted_cap_reservoirs.json`](admitted_cap_reservoirs.json).

### Storage metrics

- **Percent full** is current storage divided by the reviewed full level. The
  full-level source is published per reservoir.
- **Standard comparison** is the median of one representative value per year
  near the same calendar date from 1991 through 2020.
- **Recent-years comparison** uses the years this project collects through the
  prior year.
- **History rank** compares the current value with one representative value
  per earlier year near the same calendar date.
- **Change** reports the measured interval and reference date for 7-, 30-, and
  365-day targets when the source supports them.
- **Monthly history** carries the mean, minimum, maximum, ending storage, and
  comparison value for each of the last twelve months.
- **Reporting status** is evaluated per source update schedule. A reading that
  is late remains visible and named. A reading from another season is removed
  from current totals until the provider resumes.

Regional storage is full-level weighted:

```text
percent full = sum(current storage) / sum(full level) × 100
```

The result describes the reservoirs tracked by this dashboard, not every
reservoir or every form of water in a drainage area.

### Geographic scope

The western scope follows where water drains, not a longitude box. It includes
hydrologic regions 14 through 18: the Colorado River, Great Basin, Pacific
Northwest, and California systems. Storage, snow, and drought offer three
complete measurement levels:

- 5 two-digit regions;
- 44 four-digit subregions; and
- 75 six-digit basins, the default.

Drought also offers 571 eight-digit subbasins. Its weekly land-share figures
are measured again at that level; they are not split or averaged from a larger
area.

A reservoir is assigned to a drainage area from its reviewed dam or outlet
point. State and county filters describe where the waterbody is. Those are
separate facts: a dam, a lake, and the land feeding it can cross different
lines.

## Architecture

The reader-facing application is strict TypeScript built with Vite, ArcGIS
Maps SDK for JavaScript 5.1, ArcGIS Charts 5.1, and Calcite Components 5.1.

| Path | Role |
|---|---|
| `index.html`, `modern.html`, `src/main.ts` | Primary reservoir map and stable alias. |
| `overview.html`, `src/overview*` | Storage charts workspace and shared filter model. |
| `reservoir.html`, `src/reservoir*` | One reservoir at a time: reading, comparisons, history, provenance. |
| `snow.html`, `src/snow*` | Snow curves, drainage-area map, site map, and detail views. |
| `drought.html`, `src/drought*` | Weekly drought map, comparisons, rankings, and distribution. |
| `methods.html`, `data.html`, `terms.html` | Methods, public API, and legal documentation. |
| `legacy/`, `maplibre/`, `explore.html` | Compatibility redirects only. |
| `public/retired-route.js` | Allowlisted translation for retired URL state. |
| `shared/reservoir-viz.js` | Frozen source-only storage color-table oracle; never published. |
| `refresh_reservoirs.py`, `pipeline/` | Reservoir refresh: the orchestrator, and one module per concern. |
| `refresh_snowpack.py` | Snow refresh pipeline. |
| `scripts/` | Verification entry points and the daily refresh orchestration. |
| `huc.py`, `watershed_scopes.py` | Drainage assignment, grouping, and named-scope contracts. |
| `tools/` | Source audits, boundary work, drought processing, symbol profiling, and transfer measurement. |

The load-bearing rules are:

1. Runtime data is fetched and copied, never bundled.
2. Each map quantity has one color table; storage retains the frozen oracle
   until a later ADR moves ownership.
3. Retired routes preserve bookmarks, not runtimes.
4. Public pages never ask for ArcGIS credentials.
5. Anything that can wait forever has a deadline and an explicit failure
   state.
6. Visible application text uses Simplified Technical English.
7. Accessibility is a release gate at 1280, 390, and 360 pixels.
8. One readiness field reports one fact, so deleting a rendered layer cannot
   hide behind another successful signal.
9. Comparisons name their period, method, and sample size.
10. Shares with different denominators are never subtracted into a stated
    quantity.

The rationale and supersession history are in the
[architecture decision records](docs/decisions/).

## Refresh, build, and deploy

The scheduled [refresh workflow](.github/workflows/refresh-data.yml) updates
reservoir and snow data independently, retains verified previous data when a
provider fails, refuses broad or inconsistent results, computes drought
coverage from the polygons downloaded in the same run, and maintains issues
for late and withdrawn reservoir feeds.

The [Pages workflow](.github/workflows/deploy-pages.yml) builds and publishes
`dist/` after changes to `main` and after successful scheduled refreshes. It
checks public paths and fails if runtime data appears in `dist/assets`.

The [CI workflow](.github/workflows/ci.yml) runs TypeScript, Vitest, pytest,
the SDK bundle budget, Playwright smoke tests, axe-core, URL compatibility,
and font-host checks. Tests derive changing counts from the payload rather
than asserting today's numbers.

## Project status and documentation

The original modernization phases are complete. ArcGIS 5.1 is the production
runtime; the MapLibre rebuild was superseded by the decision to keep retired
paths as redirects. The western geography, reader-chosen opening scope, the
first-visit place chooser and the remembered place behind it, the mountain
snow network, the nine-provider western reservoir roster, the upstream sets,
drought measurements and every other map at four area sizes, accessibility gates, and transfer
policy have all shipped. The Utah state
mask is retired and the state boundary is no longer published (ADR-067);
state outlines a reader can see come from Esri's Living Atlas, built from
U.S. Census Bureau boundaries, and are drawn only where a continuous surface
means a line cannot hide the subject (ADR-061).

Current product work is narrower, in the order it should be worked:

- **complete a human visual review of every page and viewport.** Automated
  tests cannot judge colour balance, terrain, density, or visual hierarchy
  because the ArcGIS canvas is blank in headless Chromium;
- settle the 12 California and 4 U.S. Geological Survey candidates still held
  for source disagreements, each named with its finding in its roster file;
- keep automatically reported late and withdrawn feeds under review;
- re-check the two vendor accessibility items and the content policy on the
  next SDK upgrade: the `aria-prohibited-attr` entry in `AXE_EXCEPTIONS`, the
  unnamed Calcite slider handle that `src/ui/slider-label.ts` works around, and
  the measured `script-src`;
- resolve the four published points that have no water body in any source that
  can be asked;
- source what is left of the coverage gaps, which is now much narrower. The
  Corps of Engineers' Columbia Basin service (ADR-102) covers Idaho, Oregon
  and Washington, and the Central Arizona Project (ADR-104) closed Arizona's
  largest hole. What remains is not a missing survey in any of them:
  Wyoming's other large reservoirs are on the Missouri side, which drains
  east outside the drawn areas by decision; Nevada's remainder is terminal
  lakes, a roster-rule question rather than a source one; Washington keeps
  several utility-owned reservoirs whose operators publish nothing a program
  can read, three of which the Corps' own service lists and answers nothing
  for; and Alamo Lake sits under a Corps district office this site does not
  yet read. Every location kept out names its finding in
  [`admitted_cwms_reservoirs.json`](admitted_cwms_reservoirs.json). The
  survey is item 5 of
  [`docs/WATER-BODY-AND-NAVIGATION-SCOPING.md`](docs/WATER-BODY-AND-NAVIGATION-SCOPING.md),
  whose other four items are closed; and
- two deferred decisions, neither of them blocking: whether to order the
  upstream sets, which is the flowline-navigation slice
  [`docs/UPSTREAM-TRACE-SCOPING.md`](docs/UPSTREAM-TRACE-SCOPING.md)
  deliberately left out of ADR-077, and whether to give the first-visit chooser
  its counts. That design wanted "eleven reservoirs, eighty-five snow sites" on
  each tile, which is what makes offering a state with no reservoirs obviously
  right rather than apparently broken. It needs all three payloads, and a
  chooser that waits on three fetches arrives late, which is the one thing that
  shape must not be.

Start with [`docs/README.md`](docs/README.md) for the maintained documentation
index. Key records include:

- [`CHANGELOG.md`](CHANGELOG.md) — user-facing changes, excluding daily data refreshes;
- [`docs/history/modernization-2026.md`](docs/history/modernization-2026.md) — historical roadmap and implementation journal;
- [`docs/AUTHORITATIVE-SOURCE-INVENTORY.md`](docs/AUTHORITATIVE-SOURCE-INVENTORY.md) — current data ownership and failure behavior;
- [`docs/data-transfer.md`](docs/data-transfer.md) — measured page and payload cost;
- [`docs/decisions/`](docs/decisions/) — immutable architecture decisions and their current status;
- [`AGENTS.md`](AGENTS.md) — the repository contract and the routing layer to every scoped rule, with [`CLAUDE.md`](CLAUDE.md) adding only Claude-specific behaviour;
- [`docs/architecture/`](docs/architecture/README.md) — how the system works now; and
- [`maplibre/README.md`](maplibre/README.md) — archived findings from the retired comparison runtime.

## Known limitations

- Monthly sources cannot support a meaningful seven-day change.
- Maps depend on third-party basemap and reference services. Local
  measurements and non-map views remain available when those services fail.
- The content policy must currently allow the ArcGIS CDN and `unsafe-eval`
  because of SDK workers and chart schema compilation. Re-measure it on every
  SDK upgrade.
- One accessibility exception remains in a vendor component and is documented
  in `AXE_EXCEPTIONS` in `tests/smoke-modern.mjs`.
- ArcGIS map pixels render blank in headless Chromium. Runtime readiness and a
  human review are therefore both required evidence.
- A link carries only what a reader changed, so the meaning of an absent
  parameter is part of the contract. `powell=` and `mead=` changed default
  when the two largest reservoirs joined the opening view, and a link written
  before that change reads as the current default. `?reservoirs=` is no longer
  read or written at all: an old link carrying it opens the current western
  view, with no hidden scope kept behind it (ADR-087). Both spellings of every
  surviving parameter are still accepted.

## License and commercial use

Copyright © 2026 Brian Busch. The source code is licensed under the
[PolyForm Noncommercial License 1.0.0](LICENSE.md). Noncommercial use,
inspection, and modification are allowed under that license. Commercial use
requires a separate license; contact <brian.busch@me.com>.

The license covers the code, not source measurements. The federal and state
publishers credited on the [methods page](methods.html) retain their own terms.
Esri mapping services are provided under Esri's terms. See
[terms.html](terms.html) for the site terms.
