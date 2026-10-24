# Esri defect and limitation register

Every place this project pins, works around, excludes or tolerates a defect or
limitation in an Esri product, so that ours can be fixed and Esri's can be
reported with a reproduction. Kept current: when a workaround is added or
removed, its row changes here in the same commit. Upstream-watch issues #16
and #17 track re-measurement on each SDK upgrade.

Status as of 2026-10-24 (release 1.1.1). Nothing is filed with Esri yet.
Drafts ready to file are in [`esri-reports/`](esri-reports/): E1 so far. The
other rows marked "yes" need a draft; E6, E7 and E10 need an isolated
reproduction first, and E9 needs re-measuring on 5.1.27.

Observed on: @arcgis/core, map-components, charts-components, common-components 5.1.27; @esri/calcite-components 5.1.2 (pinned `~5.1.2`, package.json:31). Sources: package.json, src/, tests/smoke-modern.mjs, index.html and sibling pages, docs/decisions, CLAUDE.md, issues #16/#17/#23, commits 0c83ae3, 1dbcd12, 32ec91c. Line numbers are from the working tree on 2026-10-24. Nothing was re-reproduced for this register; "measured" means the repo's own commit or comment says so.

## Summary

| ID | Product | Symptom | Our workaround | File | Report? |
|---|---|---|---|---|---|
| E1 | charts-components 5.1.27 + Calcite 5.2 | `Unknown color syntax: light-dark(...)`; legend, no marks | Pin Calcite `~5.1.2`; test guard; drawn check with fallback message | package.json:31, src/architecture.test.ts:98-105, src/overview-charts.ts (`hasDrawingSurface`) | yes |
| E2 | charts-components | `aria-prohibited-attr`: inner div has `aria-label`, no role | Axe exception | tests/smoke-modern.mjs:387-389 | yes |
| E3 | Calcite 5.1.x slider | Handle `role="slider"` has no accessible name | Write `aria-label` onto handle | src/ui/slider-label.ts:38-68; src/snow.ts:470-473 | yes |
| E4 | charts-components | Needs `https://*.arcgis.com` in script-src (worker code) | Permissive CSP | index.html:27 (all pages) | yes (enhancement) |
| E5 | charts-components | Compiles JSON schemas with `new Function` | `'unsafe-eval'` in CSP | index.html:27 | yes (enhancement) |
| E6 | charts-components | `arcgisRenderingComplete` sometimes never fires, and can arrive late | 8 s and 30 s deadlines; verdict from the drawing surface | src/overview-charts.ts (`mountChart`) | yes |
| E7 | charts-components | Teardown race: `getComputedStyle` on a disposed element | Test accepts one exact message | tests/smoke-modern.mjs:2062-2077 | yes |
| E8 | charts-components box plot | One colour per series; no per-category colour | Hand-built SVG chart | src/viz/spread.ts (ADR-075) | unclear |
| E9 | core IdentityManager | 401 builds sign-in modal; load promise hangs | Override `getCredential`, tear down modal | src/arcgis/auth.ts:83-111 | unclear |
| E10 | map-components / core | `view.updating` stays true after refused portal request | Read layer views, not the view | CLAUDE.md:36-40 | unclear |
| E11 | core Basemap | `referenceLayers` draw above all operational layers | Move reference layers under data | src/arcgis/basemap-reference.ts:1-30, 76, 111 | unclear |
| E12 | core FeatureLayer | Publisher `minScale` inherited; layer suspends | Force `minScale = 0` | src/arcgis/watershed-layers.ts:165-178 | no |
| E13 | Calcite switch | Real control in shadow root; no accessible name from label | Native checkbox | src/drought.ts:1215-1221 | unclear |
| E14 | Basemap Styles service | `arcgis/*` styles 401 without key; no anonymous tier | Legacy ids, `World_Hillshade` | docs/decisions/ADR-004; src/arcgis/hillshade.ts:1-12 | no (policy) |
| E15 | 2D label fonts | Slug built from family and weight; wrong name 404s silently | Family + weight, wire watcher | docs/architecture/frontend.md:117-122; tests/smoke-modern.mjs:406 | unclear |
| E16 | Calcite label/navigation/sheet | Styling and clipping surprises | CSS tokens | docs/architecture/frontend.md:259-282 | no |
| E17 | map-components | `arcgis-basemap-gallery` fetches portal group on connect | Add on first expand | docs/architecture/frontend.md:100-104; src/ui/basemap-gallery.ts:28 | no |
| E18 | Headless Chromium + ArcGIS canvas | Blank canvas | Real browser for visual checks | CLAUDE.md:34-36 | unclear |
| E19 | charts-components peer range | `^5.1.1` admits Calcite 5.2 which it cannot draw under | Pin (E1) | package.json | yes (with E1) |

Not defects (do not file): see the last section.

## E1. Calcite 5.2 `light-dark()` colours break every arcgis-chart

- Product/version: @arcgis/charts-components 5.1.27 with @esri/calcite-components 5.2.x.
- Symptom: `Unknown color syntax: light-dark( #ffffff, #2b2b2b )`. Each chart draws its legend and no marks. Nothing failed in CI.
- Detection (added after 1.1.1): `mountChart` calls a chart drawn only when its shadow root holds the SVG or canvas the chart library draws into, and otherwise replaces it with the failure message and counts it in `__overviewReady.chartsFailed`. The smoke suite asserts every chart drew, and reproduces this defect by setting `--calcite-color-foreground-1` to a `light-dark()` value, at page start and after the first chart is ready. Measured 2026-10-24 in headless Chromium 155 against this build: the component's `render()` reads the tokens before any markup, so the throw leaves the shadow root with no SVG or canvas; `arcgisRuntimeError`, `arcgisDataProcessError` and `arcgisRenderingComplete` do not fire. With the token set before the first render, or with Calcite 5.2.0's own `main.css` tokens swapped into the served CSS, `componentOnReady` rejects and the 1.1.1 page's catch saw the error (readiness was never published). Only with the token set after the first chart was ready did the 1.1.1 page publish readiness over blank charts, which is what shipped. Why the shipped page took that path under Calcite 5.2 is not established: the Calcite 5.2 JavaScript was not installed for this measurement.
- Workaround: Calcite held at `~5.1.2` (package.json:31, commit 0c83ae3, release 1.1.1). `src/architecture.test.ts:98-105` fails if the locked version is not 5.1.x, with the reason. Note: docs/architecture/frontend.md:4 still says "Calcite Components 5.2" and is stale.
- Cost: Calcite 5.2 fixes and features unavailable. Calcite and charts packages must be upgraded together from here on. Each upgrade needs a real-browser look at the charts.
- Whose bug: Esri's. Charts reads a computed Calcite theme colour and its parser has no `light-dark()` support. Calcite 5.2 emitting a syntax its own sibling package cannot read is a coordination defect between the two.
- Repro: new Vite page, `@esri/calcite-components@5.2`, `@arcgis/charts-components@5.1.27`, `@arcgis/core@5.1.27`. Import `@arcgis/charts-components/components/arcgis-chart` and `@esri/calcite-components/main.css`. Create a `FeatureLayer` from any item with a numeric field, set `chart.layer = layer; chart.model = <bar chart model from setup-utils>`. Open in desktop Chrome. Console shows the error; the legend renders, bars do not. Same page with Calcite 5.1.2 draws bars.
- Ask Esri: make the charts colour parser accept `light-dark()` (and `color-mix`, `oklch`) or resolve through the browser (canvas `fillStyle`); tighten the charts peer range to the Calcite minors it was tested against.
- Root cause, read from the shipped bundle
  (`@arcgis/charts-components/dist/cdn/QRY6QKVG.js`): the charts draw with
  amCharts, whose `Color.fromAny` accepts a `#hex` string or an `rgb(...)`
  string and throws `Unknown color syntax` for anything else. The charts read
  Calcite theme tokens as CSS custom properties -- `--calcite-color-foreground-1`,
  `-foreground-2`, `-foreground-3`, `-text-1`, `-text-3`, `-border-1`,
  `-border-2`, `-brand`, `-brand-hover`, `-background` -- and a custom
  property's computed value is its declared text, unresolved. Calcite 5.2
  declares those tokens as `light-dark(<light>, <dark>)`, so the parser
  receives `light-dark( #ffffff, #2b2b2b )` and throws before any mark is drawn.
- Proposed fix for Esri: resolve a token through the browser before handing
  it to amCharts. Assign `var(--token)` to a hidden probe element's `color`
  and read `getComputedStyle(probe).color`, which is always `rgb(...)`/`rgba(...)`
  and already reflects the active colour scheme. This also future-proofs
  `color-mix()`, `oklch()` and named colours. A narrower fix is to teach
  `fromAny` those syntaxes; the probe is smaller and exact.
- Also check: `@arcgis/map-components/dist/cdn/XDQDTW2I.js` carries the same
  parser and message. Not measured under Calcite 5.2; any map component that
  reads Calcite tokens through it would fail the same way.
- Remove when: a charts release is verified drawing under Calcite 5.2 in a real browser; then relax the pin and the test.

## E2. `aria-prohibited-attr` on `arcgis-chart`

- Product: charts-components 5.1.27 (re-measured on 5.1.22 and 5.1.27, issue #16, commits 32ec91c, 1dbcd12).
- Symptom: axe-core 4.x, WCAG 2.1 AA, rule `aria-prohibited-attr`: an inner `div` has `aria-label` and no role, so the label is inert. Nodes in the capacity, watershed and trend charts (3 nodes at 2 viewports).
- Workaround: `AXE_EXCEPTIONS = [{ rule: "aria-prohibited-attr", target: "-arcgis-chart" }]`, tests/smoke-modern.mjs:387-389 (reasoning at :368-386). Each chart also sits in a `section` named by `aria-labelledby` against our heading.
- Cost: low. One narrow exception; the chart's own label is inert for screen readers.
- Whose bug: Esri's markup.
- Repro: any page with one `arcgis-chart` bound to a layer and model; run axe-core (`axe.run`, tags wcag2a, wcag2aa, wcag21a, wcag21aa); read the violation's nodes.
- Ask: give the labelled element a role (`img` or `figure`) or move the label to a named container.
- Remove when: the exception matches no nodes in the browser suite.

## E3. Calcite slider handle has no accessible name

- Product: @esri/calcite-components 5.1.2 (5.1.22-era template adds `minLabel`/`maxLabel` binding that evaluates to nothing unless set; recorded in 32ec91c).
- Symptom: axe `aria-input-field-name` on the `div[role=slider][tabindex=0]` inside the shadow root. It carries `aria-valuenow/min/max` only. Neither host `aria-label` nor the component's `label` property reaches it (both measured).
- Workaround: `nameSliderHandle` writes `aria-label` onto each unnamed handle in the open shadow root, polling up to 4 s for first render (src/ui/slider-label.ts:38-68); called at src/snow.ts:473. It only writes when the handle has no name, so a fixed Calcite wins.
- Cost: reaches into a shadow root; timer poll; relies on Lit not managing `aria-label` on that node (verified, not guaranteed).
- Whose bug: Esri's. `label` is a documented property and is not applied to the control.
- Repro: `<calcite-slider label="Day shown" min="1" max="100" value="10"></calcite-slider>`; query `shadowRoot.querySelector('[role=slider]')`; `getAttribute('aria-label')` is null; axe flags `aria-input-field-name`. Repeat with `aria-label` on the host.
- Ask: forward `label` (and host `aria-label`) to each handle's accessible name.
- Remove when: the handle exposes a name with no helper; delete slider-label.ts and its call at snow.ts:473.

## E4 and E5. CSP: the SDK forces a permissive `script-src`

- Product: core 5.1.27 (workers) and charts-components (schema compile). Issue #17.
- Symptoms: without `https://*.arcgis.com` the charts workspace (overview.html) throws `@arcgis/core/core/workers/WorkerOwner` errors and never becomes ready, with no CSP violation logged. Without `'unsafe-eval'` the charts package logs `Error compiling schema` (it uses `new Function`).
- Workaround: every page's meta CSP, `script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob: https://*.arcgis.com https://*.arcgisonline.com` (index.html:27 and the same line in drought, data, explore, methods, modern, overview, snow, reservoir.html:9). Comment at index.html:8-26 states it gives little script-injection protection. `frame-ancestors`, `report-uri`, `sandbox` are unavailable on GitHub Pages (header-only).
- Cost: `script-src` provides almost no injection protection; `unsafe-eval` blocks a strict policy.
- Whose bug: both are design limits rather than defects; the silent worker failure (no CSP violation reported, readiness never reached) is the reportable part.
- Repro: serve a built page with `script-src 'self'` only that loads an `arcgis-map`; watch workers fail to import from js.arcgis.com. Add one `arcgis-chart` page for the `new Function` case.
- Ask: self-hostable worker code (assets option) so the CDN allowance is not required; a CSP-safe (no eval) schema validator in charts-components; report worker-import failures visibly.
- Remove when: measured on each upgrade (tools/audit-transfer.mjs; last re-measured on 5.1.27, unchanged); narrow script-src when the two needs go away.

## E6. `arcgisRenderingComplete` may never fire

- Product: charts-components 5.1.x.
- Symptom: a chart fully drawn (bars measurable in the shadow root) never emits `arcgisRenderingComplete`; the page waits forever, `aria-busy` stays on, readiness never publishes. Separately, measured 2026-10-24 on a heavily loaded machine (load average 34 on 12 cores): the event arrived 10 to 19 s after the chart was created, and the histogram's data step alone took 9 s.
- Workaround: the event only decides when to look. `mountChart` waits for it up to 8 s (`RENDER_SETTLE_MS`), then checks for a drawing surface; with none, it waits up to 30 s in total (`CHART_DRAW_DEADLINE_MS`), checks again, and only then calls the chart failed. A drawn chart without the event is accepted at the first check. Also frontend.md, "Failure, readiness and accessibility".
- Cost: a chart that draws nothing keeps `aria-busy` for 30 s before the failure message; a drawn chart without the event, up to 8 s. The deadlines are measured guesses.
- Whose bug: unclear. Observed intermittently; the trigger is not recorded in the repo (possibly our reuse of the host, possibly a charts race). One known trigger is ours and fixed: setting `colorMatch` before the first render (comment in `renderArcgisBarChart`).
- Repro: not captured. Needs: create chart, set `layer` then `model`, add the `arcgisRenderingComplete` listener with `{ once: true }` before assignment, repeat many times across filter changes; count runs where the event does not arrive although the DOM shows marks. Collect those first.
- Ask: guarantee the event after every render or document the conditions.
- Remove when: soak test shows the event always arrives; keep a deadline anyway (frontend.md makes deadlines a project rule).

## E7. Chart teardown race

- Product: charts-components.
- Symptom: uncaught `Failed to execute 'getComputedStyle' on 'Window': parameter 1 is not of type 'Element'.` after a chart is replaced mid-measure.
- Workaround: the smoke test ignores only this exact message (tests/smoke-modern.mjs:2062-2077). Chart already off the page; no reader impact.
- Whose bug: probably Esri's (a pending callback uses a disposed element, and there is no dispose to cancel). Our replacement of a chart while it measures is the trigger, so partly ours.
- Repro: mount `arcgis-chart`, set model, remove the element within one frame (or replace its host), observe window `error`.
- Ask: cancel pending measure callbacks in `disconnectedCallback`.
- Remove when: the message stops appearing with the exception removed.

## E8. Box plot cannot colour per category

- Product: charts-components.
- Symptom: a box plot is one series, and `setSeriesColor`, `meanLinesBoxColor`, `colorMatch` (unique-value, class-breaks, continuous variable) are per series; every box came out one colour. `splitByField` gave five series but each category reserved five lanes, shrinking boxes to slivers (ADR-075).
- Workaround: hand-built SVG `src/viz/spread.ts`.
- Cost: owned chart code and tests.
- Whose bug: unclear; a feature gap. Not filed as a defect; could be an enhancement request.
- Repro: layer with category field and 0-100 value, box-plot model, `colorMatch` over unique values: all boxes one colour.
- Ask: per-category box colour, or `splitByField` without per-category lane reservation.
- Remove when: a charts release colours boxes per category.

## E9. Credential challenge builds a modal and hangs the load

- Product: core 5.1.15 measured (IdentityManager); not re-measured on 5.1.27.
- Symptom: a 401 (Basemap Styles style, secured item) opens a username/password modal and the load promise stays pending (about 20 s measured). The caller sees an error whose prototype is lost, only the message text survives.
- Workaround: replace `getCredential` with a rejection, tear down the dialog if built anyway (src/arcgis/auth.ts:83-111), marker string match (:31-40); wired from src/arcgis/basemaps.ts:11,24.
- Cost: the whole app is anonymous by design; error classification is by message text.
- Whose bug: unclear. Default behaviour is intended for apps that sign in; the lack of a "no interactive sign-in" switch is the gap.
- Repro: `new Basemap({ style: { id: "arcgis/topographic" } })` in a map with no apiKey and no session; observe the modal and `await basemap.load()`.
- Ask: documented option to disable the IdentityManager dialog and fail fast; preserve error class across `[request:server]` re-throw.
- Remove when: such an option exists.

## E10. `view.updating` stays true after a refused portal request

- Product: map-components / core 5.1.x.
- Symptom: after the portal request is refused (ADR-004), `view.updating` stays true with every layer view settled.
- Workaround: read layer views, not the view (CLAUDE.md:36-40). Only a verification procedure; no app code.
- Whose bug: unclear. May follow from E9 (our refusal leaves a pending portal promise).
- Repro: not isolated. Apply E9, load a map, wait for all `layerView.updating === false`, read `view.updating`.
- Ask: first isolate whether it persists without our auth override.
- Remove when: `view.updating` falls to false on a settled map.

## E11. Basemap reference layers draw above data

- Product: core Basemap (Oceans' `World Ocean Reference`, vector tile, contains admin boundaries and labels).
- Symptom: a grey borders line through Flaming Gorge draws over our layers; no operational reordering fixes it (ADR-042).
- Workaround: move `basemap.referenceLayers` into the map as the lowest operational layers (src/arcgis/basemap-reference.ts:76, :111).
- Cost: borrowed place names now sit under our layers.
- Whose bug: by design in Esri (reference stack above operational). Not a defect.
- Ask: optional per-layer ordering of reference layers.
- Remove when: not removable by an Esri change; this is a choice.

## E12. Hosted layer `minScale` inherited

- Product: core FeatureLayer with hosted HUC8 service (publisher's `minScale` 1,000,000; HUC-2/4/6 publish 0).
- Symptom: layer view suspended at all opening scales; the areas silently did not draw; roster still reported (src/arcgis/watershed-layers.ts:165-178).
- Workaround: `properties["minScale"] = options.minScale ?? 0` (:178). The comment calls it an ADR-050 choice, not a workaround.
- Whose bug: not Esri's SDK; data publisher metadata. Not reportable.

## E13. Calcite switch has no accessible name through a label

- Product: Calcite 5.1.2 `calcite-switch`.
- Symptom: axe refuses it; neither a wrapping `<label>` nor the `label` attribute names the shadow-root control (src/drought.ts:1215-1221). No repro details recorded.
- Workaround: native checkbox.
- Whose bug: unclear; may be the same cause as E3 (host `label` not forwarded). Check against E3 before filing.
- Repro: `<calcite-switch label="Show reservoirs"></calcite-switch>`; axe.
- Remove when: a Calcite release names its switch control; optional.

## E14. Basemap Styles service needs a key

- `arcgis/*` styles return 401 anonymously; Esri's design. Workaround: well-known basemap ids and `World_Hillshade` (src/arcgis/hillshade.ts:1-12; ADR-004, ADR-043). Not filed.

## E15. 2D label font slug

- Product: core 2D labelling. The glyph atlas slug is built from family and weight (`atkinson-hyperlegible-next-regular-regular`); a bad slug 404s and the label silently falls back (frontend.md:117-122; tests/smoke-modern.mjs:406-420).
- Workaround: family plus numeric weight; wire watcher in the smoke suite.
- Whose bug: unclear; documented names do not map to the slug. Could be filed as a docs/diagnostic request: the SDK should warn when a font cannot load. Repro: `font: { family: "Atkinson Hyperlegible Next Regular" }` on a LabelClass; watch 404 on fonts host.

## E16 to E18 (minor)

- E16: Calcite `calcite-label` ignores host font-size and color (frontend.md:274-280), `--calcite-label-margin-bottom` defaults to .75rem (:281-283), `calcite-navigation` clips overflow (:259-261), `calcite-sheet` height token (:266-267). Documented CSS limits; handled in app.css. Not defects.
- E17: `arcgis-basemap-gallery` fetches the portal basemap group and a thumbnail per background on connect, so it is added on first open (frontend.md:100-104; src/ui/basemap-gallery.ts:28). Performance tolerance; could be an enhancement request for lazy loading.
- E18: headless Chromium renders the ArcGIS canvas blank (CLAUDE.md:34-36), so screenshots are not evidence. Cause not diagnosed (GPU/WebGL in headless likely). Not reported; test with `--use-angle=swiftshader` or `--enable-unsafe-swiftshader` before filing. The charts are not affected: their SVG and 2D canvases do paint headless (2026-10-24, the histogram's canvas holds its bar colour), so the smoke suite can see whether a chart drew.

## E19. Charts peer range admits an unsupported Calcite

- charts-components 5.1.27 peer `^5.1.1` for Calcite admits 5.2, so npm raised no objection (0c83ae3). File with E1.

## Not defects (project choices, do not file)

- No `@arcgis/core/widgets/*` imports: widgets are deprecated in 5.0 and removed in 6.0; enforced at src/architecture.test.ts:47 (frontend.md:88-91).
- One component per custom element, never a package root; Calcite root exports only asset-path configuration (src/architecture.test.ts:71-82).
- A single physical Calcite installation (architecture.test.ts:88-97).
- Map SDK is not in the storage-map entry (ADR-120); the basemap gallery is lazy.
- UTM 12N not used: Esri tiled basemaps are Web Mercator (issue #23, closed).
- Basemap fallback chain and deadlines (src/arcgis/fallback.ts:12 says it is "insurance, not a workaround"; ADR-101, ADR-034).
- Calcite icons committed locally under public/assets/icon (404 if one is missing).
- Hosted boundary services have deadlines because a service may fail (ADR-034); the snapshot is ours.
- The CDEC upstream-watch issues (#44-#47) concern California data records, not Esri.

## Gaps in this register

- Re-verified nothing live; E6, E7, E10 lack isolated reproductions, and E9 was measured on 5.1.15 only.
- The CSP line number is for index.html; other pages carry the same meta at line 27 (reservoir.html at line 9).
- MODERNIZATION_PLAN.md, named in the issues, was not in the tree.
