# Product review plan, November 2026

Status: Waves 1–3 are merged through PR #129. The eight USGS storage
backfills and Mead daily inflow remain source gaps. Items 8, 9 and 13 are
integrated locally under proposed ADR-163–165, awaiting Brian's review.
Great Salt Lake's arms already shipped through PR #138 (ADR-159); its
remaining navigation entry is integrated locally under proposed ADR-166.
Brian Busch chose the four scopes below
on 2026-11-09. ADR-153 records the storage-map choice; each later wave writes
its own record where required.

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

## What the repository survey found before Wave 1

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

The four implementation PRs are published:

- Quick repairs: the first-visit place question, reporter link, cross-state
  river-gauge names, sitemap and question-service data address.
- Storage compared with normal, filtered subtotals, the phone summary and
  per-reservoir comparisons in the list, table and downloads (ADR-153).
- Snow-water inches beside the percent and map framing for a linked site.
- Copyable figures, links and native sharing on reservoir, storage charts
  and precipitation pages.

[Deployment verification](https://github.com/buschbrian/western-water-dashboard/actions/runs/42748675363)
passed. The public page entry bundles, copy control, sitemap and robots file
match the reviewed build byte for byte.

Current behaviour is documented in `architecture/frontend.md`. Remaining
work from this wave is explicit:

- Offer copyable snow-summary figures; the existing control covers three
  pages only.
- Offer a picture download where a published picture exists. General
  reservoir pictures depend on items 5 and 6.
- Raise a self-healing issue when a share capture uses a fallback.
- Confirm or deploy the question service separately if it is in use; the
  Pages workflow does not deploy a Cloudflare worker.
- Inspect the map canvas and visual hierarchy in a visible browser below
  500 CSS pixels. The automated browser suite cannot establish map rendering.

## Wave 2: sharing and place

### 5. A share frame for any reservoir

Implemented locally with item 6: storage and reviewed-level frames share the
same 1200 by 630 contract. Current behaviour is in `architecture/frontend.md`.

### 6. A share page and a daily picture for every reservoir

Implemented locally on `feat/permanent-reservoir-shares`, awaiting Brian's
review and publication (ADR-154): the append-only station ledger, generated
pages retained after withdrawal, daily captures, and eleven state, five
region and West cards. Copy link and native Share on a reservoir page use
its permanent preview address when available. Static descriptions carry no
water figure; a failed capture keeps a figure-free fallback.

Measured on system Chrome on 2026-11-10: 425 active frames from 428 addresses
captured in 136.8 seconds with four workers, with no failed capture. The three
withdrawal/hold pages retain fallbacks. The capture pool has a five-minute
budget. Full regression verification accompanies the implementation commit.

### 7. Link previews on the main pages, and an embed snippet

Implemented locally on `feat/page-previews-and-story-embeds`, awaiting Brian's
review and publication: static picture tags on all six main pages, four new
daily pictures (the two storage pages reuse the West card), and **Embed this
view** controls on precipitation and reservoir upstream sections. They offer
the existing full precipitation, history-strip and upstream story views,
carrying the resolved place or station identity. Static previews describe
the whole coverage; story embeds carry the selected place.

Current behaviour is documented in `architecture/frontend.md`.

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

Implemented locally on `feat/town-search` (ADR-164). The offline Census
reference holds 4,283 place points in 48,735 gzip bytes. Search opens the
finest containing published area with a current reservoir and names the
point's location without claiming a water-supply area. Existing area URLs
carry the selection; no town parameter or preference is introduced.

## Wave 3: new data

Each is a new published contract. Verify with `npm run verify:pipeline` and
`npm run verify:browser`; payloads regenerate in CI.

Local implementation on 2026-11-11: the history writer, lazy chart, full CSV
and storage share chart (ADR-160); the three available observed flow series
and their operator definitions (ADR-161); upstream station means, the
precipitation link and aligned 30-day context (ADR-162). The focused browser
target passes at all three widths, including the history failure path.
The final full-suite result is still to be recorded. History is backfilled
for 412 of 420 published stations. The other eight use the Geological
Survey key in GitHub Secrets; the diagnostic workflow has a read-only
artifact job and the builder can validate and merge that artifact locally.
No branch has been pushed and no release has been made from this work.

Reclamation's Mead catalog contains no daily inflow series. That part of
item 11 remains a source-evidence gap. The implementation publishes release
and the reason inflow is unavailable, rather than manufacturing a series.

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

Implemented locally on `feat/snow-history`, awaiting Brian's review and
publication (ADR-165): `snow_history.json` from the precipitation builder
with `WTEQ` (366 of 639 stations cover 1991–2026), and a lazy card under the
snow page's season chart that follows the page's place. On 2026-11-11 it
compares 365 sites for the West and 74 for Utah with 36 earlier seasons. It
keeps ADR-081's summed ratio and ADR-121's floors, and no existing snow
figure moves. Current behaviour is in `architecture/frontend.md` and
`architecture/hydrology-methods.md`.

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
- The size of the town reference file.
- Reclamation's inflow items and what its inflow figure is.
- Great Salt Lake's stations and datum.
- Map rendering and visual hierarchy below 500 CSS pixels in a visible
  browser. Automated layout checks passed at 390 and 360 pixels.

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
