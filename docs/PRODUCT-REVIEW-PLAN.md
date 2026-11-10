# Product review plan, November 2026

Status: planned 2026-11-09. Nothing here is built. The four scope choices
below were made by Brian Busch on 2026-11-09 and are not yet in a decision
record; each wave writes its own.

This is a plan, not a description of the site. Current behaviour is in
[`architecture/`](architecture/README.md). When a piece lands, its record and
the architecture documents become the authority and this file keeps only what
is still planned.

## Where it came from

An outside review of the live site on 2026-11-09 walked six reader tasks
(conditions near me, this year against normal, recent rain and snow, whether a
storm reached a reservoir, what is upstream, and sharing a view) and compared
them with what people post about western water on X. The review is kept
outside the repository. A survey of this repository on the same day checked
each of its findings against the code.

The review's evidence has limits it states itself: one day's inspection, a
keyword search that is not a sample, several posts that are one news story,
and no layout narrower than 500 CSS pixels. Engagement was read as attention,
not as demand.

## The four choices

| Question | Choice |
|---|---|
| Which larger data additions are in? | All four: daily storage history for every reservoir, snow-water history since 1991, Reclamation's inflow and release at Lake Powell and Lake Mead, and Great Salt Lake with its arms kept apart. |
| What does the storage map's headline do under a county or drainage filter? | It stays the wider total. A second labelled line gives the filtered area's own figures. |
| How far do share cards go? | A generated share page and daily picture for every published reservoir, with a ledger so a withdrawn reservoir keeps its page. |
| Does the site send anything out? | It publishes a feed and a weekly card with a caption. Nothing is posted automatically. |

[ADR-117](decisions/ADR-117-close-the-scope-at-version-1-0-0.md) still holds:
a new measured element, a new rollup axis or a page that computes something
needs its own record. Choosing them here does not write those records.

## What the code says about the review

- **The map already computes percent of usual and discards it.**
  `rollupOfScoped` in `src/data/rollup.ts` returns `percentOfNormal`,
  `normalCovers` and `normalBaseline`. `updateSummary` in `src/main.ts` calls it
  with the reader's comparison period and uses none of the three. The storage
  charts page prints the same rollup.
- **"Compare against" changes nothing in the summary.** `applyBaseline` in
  `src/main.ts` refreshes the control and the details panel and never calls
  `updateSummary`.
- **The headline under a filter is deliberate.** ADR-029 and
  [ADR-095](decisions/ADR-095-order-storage-map-place-filters-from-state-to-area.md)
  keep the map's total at the wider scope; ADR-149 lets only the charts page's
  weekly card follow every filter.
- **The share pictures do refresh each morning.** The Pages workflow captures
  them after the build. A failed capture publishes the committed fallback with
  only a log warning, which is the one way a card goes quiet unnoticed.
- **The two river gauges with Wyoming in their names are in Utah.** Both are
  south of the state line in Summit County; the U.S. Geological Survey names
  them for the nearest town. The roster's `state` is right and the page reads
  oddly beside the survey's name.
- **Search has no towns.** The index (`data/assistant/places.json`) holds
  reservoirs, drainage areas and snow sites. There is no geocoder and no
  point-to-drainage lookup in the browser.
- **A snow-site link does not frame its site.** `site=` fills one card. The
  snow map's controller has `setDay` and `setArea` only, and the link carries
  `state=all`, so the summary and the map stay west-wide.
- **Snow's inches are already in the model.** A `CurvePoint` carries
  `meanInches` and `normalInches` over the same reporting sites as the percent.
- **Upstream sets join to precipitation by station id today.** Measured
  2026-11-09: 132 of Lake Powell's 134 upstream snow sites are in
  `precipitation.json`, and 148 of Lake Mead's 150.
- **No daily storage history is published.** A reservoir record carries
  summary figures and a twelve-entry `monthly` array. Only Lake Powell's and
  Lake Mead's levels have a daily file.
- **No pipeline module reads an inflow or release series.**
  `tools/probe_rise.py` notes that Reclamation's catalog lists them.
- **River flow is out of the first-visit chooser by ruling**
  ([ADR-148](decisions/ADR-148-put-river-flow-in-the-page-menu-and-the-bar.md)).
  The review suggested adding it; this plan does not.

Also found, outside the review's list:

- No page but the two share pages and `story.html` has link-preview tags.
  There is no sitemap, robots file or feed.
- `worker/wrangler.toml` still sets `PUBLIC_DATA_BASE` to the old repository
  name. Whether that address still answers was not checked.

## Rules this plan keeps

- Precipitation is never stated as the cause of a storage change, and percent
  full is never stated as water-supply security.
- Every sentence a reader can copy is built by code from figures the page
  already shows. No model writes text.
- No new runtime dependency. Every chart but the storage charts' bars is
  hand-built SVG in `src/viz/`, and the new charts follow existing ones.
- The snow threshold (`MEANINGFUL_NORMAL_INCHES`, `headlineFloor`) and every
  published estimator stay as they are unless a wave says otherwise and goes
  through the `science-method-change` skill.
- Saved links keep working: `state=all`, the `area` and `drainage` aliases,
  `name=` on the reservoir page, `reservoir=` on the story views, and the two
  existing share page addresses.
- Tests compare against the payload's own fields or the frozen oracle, never a
  literal percentage.
- One reviewer. Each item below is one pull request sized to be read alone.

## Wave 1: existing numbers, where the eye lands

No new data. Verify each with `npm run verify:browser`.

### 1. Quick repairs

- Reproduce the first-visit chooser overlap reported at about 831 by 899 CSS
  pixels (`src/ui/opening-splash.ts`, `.splash-places` and `.splash-skip` in
  `src/styles/app.css`), then repair it. The source reads as if it cannot
  overlap, so reproduce before changing anything.
- Link the reporter guide from the storage panel's footer beside the data
  reference.
- Add a sentence to `whereSentence` in `src/rivers-model.ts` for a gauge whose
  survey name carries another state.
- Add `sitemap.xml` and `robots.txt` under `public/`, held to the page list by
  a deploy test.
- Raise a self-healing issue when a share capture falls back, the way a late
  feed does. This touches the Pages workflow's permissions; read
  `.github/workflows/AGENTS.md` first.
- Confirm the worker's data address against the live site, then correct it.
- Open every page at 390 CSS pixels in a real browser and record what breaks.
  Nobody has looked below 500.

Record: none.

### 2. The storage map states normal, and a filtered area gets its own line

- A "Compared with normal" tile beside the storage tile, from the rollup the
  map already makes, with the period and "N of M reservoirs" beside it. Move
  the sentence out of `src/overview.ts` into a shared pure helper so the two
  pages cannot drift.
- `applyBaseline` calls `updateSummary`, so "Compare against" changes the tile.
- In month mode the rollup has no normal. The tile says so and does not keep
  the last value.
- When a county, drainage area or search narrows the rows, a second
  `rollupOfScoped` over those rows gives a labelled subtotal: the area's name,
  its count, percent full and percent of usual. The headline is unchanged.
- The storage tile's note names Lake Powell and Lake Mead when either is in
  the total.
- At phone width, a chip over the map carries the place, the count and both
  percents, and opens the sheet.
- A "Compared with normal" column in the list, the table, the CSV file and the
  GeoJSON file, with a sort value. The data reference documents the column.

Done when the Utah summary shows both figures, turning Lake Powell off moves
both together, and the Jordan filter shows a subtotal while the Utah headline
stays. Watch the smoke suite's 25-word sentence limit and its exact strings.

Record: one, amending ADR-095 for the subtotal and stating ADR-041's rule that
a normal travels with its period.

### 3. Snow: inches beside the percent, and a site link that shows its site

- Where the summary prints a percent, print the inches behind it: the snow
  water at the reporting sites and the amount usual for the date.
- One sentence under it: this is the share usual for this date, not for a
  whole winter.
- With `site=`, frame the map on the site, mark it, and lead with its card at
  phone width. The link's format does not change.

Record: none. A "share of the usual peak" figure would be a new published
number and is left for the snow history wave.

### 4. Copy these figures

- A pure builder turns the page's own card rows into two or three sentences:
  the provider first, the reading date always, then the credit line the
  reporter guide already gives.
- On the reservoir page, the weekly card, and the snow and precipitation
  summaries: copy the text, copy the link, save the picture where one exists,
  and the phone's share sheet where the browser has one.

Record: none. It states no figure the page does not already show.

## Wave 2: sharing and place

### 5. A share frame for any reservoir

`shareFrame` in `src/reservoir-share-model.ts` returns nothing without a
reviewed level. Add a storage frame at the same 1200 by 630: name, percent
full with its basis, compared with normal with its period, the twelve-month
trend, the reading date and the source.

### 6. A share page and a daily picture for every reservoir

- A committed, append-only ledger keyed by station (ADR-066) fixes each
  reservoir's share address the first time it is published. A pipeline step
  appends to it so it rides the morning commit; it is registered in
  `data/generated-files.json`.
- The deploy generates one static page per ledger entry. A withdrawn reservoir
  keeps its page, which says it was withdrawn. This answers the objection
  [ADR-141](decisions/ADR-141-publish-a-share-page-and-a-daily-picture-for-a-reservoir-link.md)
  refused generated pages for.
- Because the page is rebuilt each morning, its description can carry a dated
  figure. The record decides whether it does.
- The capture reads its list from the ledger, runs several frames at once
  against a stated time budget, and still never fails the deploy.
- The same generator makes cards for the eleven states, the five regions and
  the whole West.
- The "a shared link shows a picture" block in `src/deploy.test.ts` pins the
  folder to two pages and is rewritten with this.

Verify with `npm run verify:frontend` and `npm run verify:browser`.

Record: a successor to ADR-141, covering items 5 and 6.

### 7. Link previews on the main pages, and an embed snippet

Card tags and a daily picture for the storage map, storage charts, snow,
precipitation, drought and river pages. An "Embed this view" control that
gives the frame code for a story view (ADR-128), which today has no way in.

Record: none.

### 8. A weekly digest and a feed

- Once a week a job writes the week's "what moved" text, from `weeklySummary`
  and `weeklyScopeText` in `src/weekly-model.ts`, into a committed list. An
  entry is frozen when written: it is evidence about a date.
- The deploy builds an Atom feed and a JSON feed from that list, a weekly
  share page and its picture, and a caption ready to copy.
- Nothing is posted anywhere.

How a Node step loads the TypeScript models is not settled; confirm it against
the installed Vite before choosing.

Record: one.

### 9. Search finds towns

- An offline tool takes place names from the Census Bureau's gazetteer for the
  eleven states and assigns each to a drainage area with the committed,
  unpublished `data/watersheds/west-huc8.geojson`. It writes a reference file
  beside the existing index, inside a measured byte budget.
- Search gains a town result. Choosing one opens the finest area around it
  that holds a published reservoir, and says the town is in that area. It
  never says where a town's water comes from.
- No geocoder and no new host (ADR-004, ADR-036).
- Whether a link carries the town is a URL question for the `scope-state`
  skill and the record.

Record: one.

## Wave 3: new data

Each is a new published contract. Verify with `npm run verify:pipeline` and
`npm run verify:browser`; payloads regenerate in CI.

### 10. Daily storage history for every reservoir

- Publish each reservoir's daily storage from the start of its record in the
  dense layout `pipeline/daily_history.py` already gives the level, river and
  soil histories.
- Proposed shape: finished water years in one file per reservoir, written once
  a year; the current water year in a shared file the morning commit rewrites.
  Measure the repository growth and the gzipped transfer before the record is
  written. R2 storage, which
  [ADR-124](decisions/ADR-124-bound-recent-conditions-to-a-static-data-pilot.md)
  already allows for archives, is the alternative.
- Every reservoir page draws this water year against earlier ones, following
  `src/viz/elevation-years.ts`, fetched when the chart nears the screen.
- The share frames switch to that chart, and the CSV file can carry the whole
  record.

### 11. Inflow and release at Lake Powell and Lake Mead

- A reviewed roster in the pattern of `admitted_reservoir_elevations.json`:
  the Reclamation item, its unit, the operator's own definition and a source
  for each. The loader refuses an entry without them.
- An optional block on the reservoir record and a daily history file.
- A "Water in and out" card on the two pages. Its words wait until
  Reclamation's definitions have been read; the item numbers are not yet
  probed.
- Modelled and forecast series are refused, as ADR-102 refused the Corps'.
- `REFUSED_FIELDS` in `pipeline/rivers.py` stays. A river gauge is still never
  a reservoir's inflow.

### 12. Rain and snow upstream of a reservoir

- On the reservoir page, the gauges in the committed upstream set: the catch
  over the last 7 days and since 1 October, and the snow water now.
- `precipitation.html?upstream=` narrows that page to the set, as
  `snow.html?upstream=` does (ADR-097). The comparison with history stays on
  that page because its file is large.
- The page keeps the sentence that these values do not show where the water
  went, and adds that they are not inflow and not the cause of a change in
  storage.
- For Lake Powell and Lake Mead, one 30-day view on a shared time axis: the
  upstream gauges' catch, the four rivers, inflow and level. It states no
  cause.

## Wave 4: before spring

### 13. Snow water against earlier seasons

A snow-water history since 1991, built the way
`tools/build_precipitation_history.py` builds precipitation's, so the snow
page draws this season against the range of earlier ones for a state, a
drainage area or an upstream set. It keeps the ratio of sums (ADR-081) and the
floor (ADR-121) and goes through the `science-method-change` skill. It is
worth most if it lands before February.

### 14. Great Salt Lake

The terminal-lake record gains arms that are measured apart and an optional
volume block, which is what `admitted_terminal_lakes.json` says holds both
Great Salt Lake and Pyramid Lake. Station identity and datum go through the
admission and datum reviews (ADR-139). With a second lake published, the
lakes page takes a place in the page menu.

## Order

Waves run in order; items inside a wave are independent except where noted.

- Item 6 needs item 5. Item 4's "save the picture" needs item 6 for a
  reservoir without a level.
- Item 12's 30-day view needs item 11. The rest of item 12 does not.
- Item 10 changes the chart items 5 and 6 draw; ship them on the twelve-month
  trend first.
- Item 13 is the only one with a season on it.

## Not measured yet

- The repository growth and transfer cost of daily history.
- The deploy time 400 captures add. If a browser is too slow, the fallback is
  to draw the cards at build time without one.
- The size of the town reference file.
- Reclamation's inflow items and what its inflow figure is.
- Great Salt Lake's stations and datum.
- Any layout below 500 CSS pixels.

## Left out, with reasons

- **Boat ramps.** Ramp elevations are not in this data and would go out of
  date.
- **A second "usable" percent.** A new denominator is a method change with no
  reviewed source behind it.
- **Watering restrictions and allocations.** They are agency decisions;
  storage cannot establish them.
- **A written summary from a model.** The reporter guide and item 4 state the
  comparisons more safely.
- **River flow in the first-visit chooser.** Ruled out in ADR-148.
- **More river gauges toward Jordanelle.** They wait on rulings in the gauge
  worksheet, not on code.

Possible later, each needing its own record: colouring the storage map by
compared-with-normal in the snow page's classes, a "use my location" lookup,
counties in search, reviewed levels at more reservoirs, and counting visits.
