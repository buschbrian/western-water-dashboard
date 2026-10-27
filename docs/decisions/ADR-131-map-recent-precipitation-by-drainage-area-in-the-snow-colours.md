# ADR-131: Map recent precipitation by drainage area, in the snow map's colours

- Status: Accepted
- Date: 2026-10-26
- Relates to: ADR-008 (one colour table per measure), ADR-125 (the
  precipitation card), ADR-129 (the 1-, 3- and 7-day totals), ADR-130 (the
  precipitation page), ADR-121 and ADR-081 (the snow map and its floor)

## Context

ADR-129 gave the precipitation card 1-, 3- and 7-day totals and a list of
the eight stations with the most. A reader asking "where did it rain this
week" had numbers and names but no picture of where.

## Decision

**A map on the precipitation page fills each drainage area by the mean of
its stations' totals for the chosen window, with every station as a point on
the same scale, in the snow map's six colours.**

1. **Colours.** The six colours of `SNOW_CLASSES` (Crameri roma), in the
   same order, taken from that table in code: dry earth through pale olive
   to water. Blue means wet on every map on this site.
2. **Breaks.** Under 0.1, 0.1 to 0.25, 0.25 to 0.5, 0.5 to 1, 1 to 2, and
   2 inches or more. The same breaks for 1, 3 and 7 days, so changing the
   window changes the amounts and never what a colour means. They are
   amounts: this site publishes no normal for a few days' precipitation.
3. **Area mean.** ADR-129's rule for one area: the mean of the stations
   that measured both days, never counting a missing value or a falling
   gauge total as dry. An area needs as many such stations as its snow
   reporting floor, or it is grey and says how many it had.
4. **Window.** The card's 1/3/7-day buttons drive the map and the station
   list together; they sit above the map.
5. **Cost.** The map, the drainage areas and the map SDK load with
   `import()` only after the totals are drawn and the map is within 600 px
   of the screen. The sign-in policy (`installAnonymousAuthPolicy`) is
   installed in that start, before any map or layer.
6. **Every value in text.** A collapsed table lists every station's total,
   and hover gives an area's mean and station count.

## Rejected

- **The National Weather Service precipitation scale, verbatim.** Read from
  the River Forecast Center service's own legend, it has fifteen classes in
  radar colours, with red beside green at a similar lightness. Brian
  refused it on review: it is the opposite of the moisture direction every
  other map here uses, and it is not colour-vision safe.
- **Points only.** Cheaper, but it does not show which basin a total falls
  in, which is the question the drainage-area pages are organised around.
- **Different breaks per window.** Closer to the national product, but a
  colour would mean a different amount on each button.

## Consequences

- The snow and precipitation maps share one colour language. A change to
  `SNOW_CLASSES` changes both, and the precipitation test pins that they
  match.
- The map costs one request to the hosted drainage boundaries, as the snow
  map does, and only for a reader who scrolls to it.
- NOAA's gridded precipitation analysis is not used. Drawing it would need
  its own record: a third-party service, a content-policy host, and windows
  that end at 12Z rather than on the station day.
