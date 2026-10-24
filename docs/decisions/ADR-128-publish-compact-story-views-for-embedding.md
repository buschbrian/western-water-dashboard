# ADR-128: Publish compact story views for embedding

## Status

Accepted

## Date

2026-10-24

## Relates to

ADR-117 (the scope is closed at 1.0.0; a new page that computes something
needs its own record), ADR-124 (which supersedes ADR-117 for one pilot and
keeps its other limits), ADR-125 (the precipitation card), ADR-127 (what is
above a reservoir), ADR-002 (data is fetched at runtime), ADR-006 (visible
text), ADR-036 (accessibility is a gate).

## Context

The dashboard's figures are being used in an ArcGIS StoryMaps entry, "The
Same Numbers, Read Differently". StoryMaps shows an outside page in an
iframe. Measured on the story: the frame carries
`sandbox="allow-scripts allow-same-origin allow-forms allow-popups"`, the
Large embed is about 1300 by 730 pixels, a sidecar's media panel is about
900 by 900, and on screens 960 pixels wide or less the author can show a
card, an image or the live embed. The story scrolls past the frame, and
StoryMaps has no confirmed control to show an embed at full screen.

A test embed of `snow.html#precip-card` showed the whole page: the site
header, the introduction and the filter bar, with the card a screen below
them. The page ignores the hash, because the card is built after the page
loads. It also followed the browser's dark theme inside a light story, and a
page in a fixed frame either scrolls inside the story (and catches the
reader's wheel) or is cut off.

## Decision

**One entry page, `story.html`, draws exactly one compact view chosen by
the link, with no site header, no filter bar and no introduction.**

1. **Three views, one URL contract.** `story.html?view=precip` with a place
   is the precipitation card; `view=strip` with a place is only "Where this
   year stands", with its title, note and its own key;
   `view=upstream&reservoir=<name or station>` is the reservoir's stored
   water, percent full and reading date, then the ADR-127 stored-water
   groups. A place is the snow page's own parameters: `state` (a USPS code
   or `all`), `area` (a drainage-area code) and `level`. A link that names
   no view, no place, a place this site does not publish, or no published
   reservoir shows one plain sentence and reports `invalid`; a view never
   widens to everywhere on its own.
2. **No new computation.** The precipitation views call
   `createPrecipitationCard` with the stations the snow page would hand it,
   through `snowPlace` (`src/snow-place.ts`), the snow page's own place
   narrowing moved out of `snow.ts`. The strip is the card with
   `parts: "strip"`. The upstream view reads `describeReservoir` and the
   upstream section builder, moved out of `reservoir.ts` into
   `src/ui/upstream-section.ts` so both pages draw it from one module. The
   reservoir page does not change.
3. **The theme never persists.** `theme=light|dark` sets the view's theme;
   with no parameter it follows the reader's system setting, live. Either
   way the page reads and writes no storage: `stampTheme` sets the site's
   attribute and Calcite's mode classes, and the site toggle uses the same
   function, so the two cannot set different things. An embed must not
   change the site for the person reading the story.
4. **The view fills its frame exactly and never scrolls.** The page is the
   frame's height, with no page scrollbar and no inner scroller. Each view
   states, in order, what it can do without (the lead, the notes, the strip,
   the snow-water block, the notes under the figures, the keys, the axis
   title, the lesser figures, the chart, the trailing upstream rows) and
   `fitContent` leaves those out until what is left fits, measured from the
   frame's own box whenever the frame or its content changes size. The room
   left over goes to the precipitation chart, between 160 and 320 pixels.
   Rows left out are counted: "3 more drainage areas are on the full page."
   The upstream groups are rows here, not lists to open, because an opened
   list would not fit. The charts take a finger's drag as the story's scroll
   (`touch-action: pan-y`), listen to no wheel, and read a day on a tap.
5. **Every view links out.** A one-line footer gives the credit, "Western
   Water Dashboard", the data's date and "Open the full page" with the same
   place, in a new tab. Every link in a view opens in a new tab, which the
   sandbox's `allow-popups` permits; nothing needs downloads, modals or top
   navigation.
6. **The page is published and not in the navigation.** It carries the
   shared content policy, a static description and Open Graph title and
   description, and sets its own title and description per view once it
   runs. `window.__storyReady` reports the view, its state and its counts.

**The seam for steps.** A story may later want one view in steps, such as
the precipitation view with percent first, then inches, then the fixed
stations. Steps would be a `step` parameter read by `storyRequestFromSearch`
and passed to the view, and each step would be a different fit plan over the
same card (which blocks lead and which are left out), not a new model. None
is built here.

## Rejected alternatives

- **Embed the full pages.** Measured: the header, introduction and filters
  fill the frame before the figure, and the page follows the browser's
  theme into a story of the other colour.
- **A hash-scroll mode on the existing pages** (`snow.html#precip-card`
  scrolling to its card). The card is built after the page loads, so the
  browser's own jump never finds it; doing it in script still leaves the
  header and filters a scroll away inside the frame, and a page that scrolls
  inside a story catches the reader's wheel.
- **Hosted feature layers or web maps for these figures.** They would be a
  second copy of numbers this site computes in the browser every morning,
  with their own refresh and their own rules for a mean, and the snow and
  precipitation figures are not map features at all.
- **Static images for each view.** A daily image needs a browser in the
  daily refresh, and a published image of a moving figure goes out of date
  the day after it is drawn. Not built; the Open Graph preview carries a
  title and a description and no image.

## Consequences

- `story.html` and its parameters are a public URL contract. A published
  story embeds them, so a later change keeps old links working.
- ADR-117's scope (as ADR-124 keeps it): this adds a page and computes
  nothing new. Every figure on it is computed by the module its full page
  uses.
- Three shared modules gained an option each, defaults unchanged: the card
  (`parts`, `standalone`, `setChartHeight`), the chart (a height) and the
  upstream section (`newTab`, `groupRows`). The chart's readout now also
  shows on a tap, on the snow page as well.
- The smoke suite loads each view at 1280 and 390 pixels in both themes and
  in the 1298 by 730, 900 by 900, 640 by 480, 360 by 640 and 320 by 480
  frames, and five links the views cannot draw.
- A link preview shows the same title and description for every view,
  because a preview is read before the script runs. A per-view preview
  would need one file per view.
