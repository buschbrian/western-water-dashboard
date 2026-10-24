# ADR-123: Draw ten years of drought on the drought page

- Status: Accepted
- Date: 2026-10-18
- Relates to: ADR-117 (scope closed at 1.0.0), ADR-122 (the decade these
  charts read), ADR-008 and ADR-032 (one colour language), ADR-059 (not
  measured is not no drought), ADR-074 (week against week), ADR-082 (no colour
  ramp for the severity index)

## Context

ADR-117 closed the scope at 1.0.0 and named "a new page that computes
something" and new analytical surfaces as needing their own record to come
back. This is that record. **Brian asked for it on 2026-10-18**: ten years of
weekly drought, measured by this pipeline's own method, drawn as a time series
on the drought page.

It is a narrow return. No new measured domain, no new rollup axis and no new
page: the archives already existed, ADR-122 filled them to a decade with the
same measurement the weekly figures use, and the charts sit on the existing
drought page under its existing place controls. What the page could not say
before is whether this week is unusual -- a basin 90% in severe drought reads
differently if it has been there for three years.

## Decision

**Two cards below the week's figures, both drawn from the archive at the
page's level (`?level=` 2, 4 or 6).** HUC-8 keeps no archive (ADR-088); at that
level the cards say so in words and fetch nothing.

**"Ten years in one area": the monitor's own time series.** For one drainage
area, the share of its measured land at each class or worse, every week,
stacked D0 under D1 under D2 under D3 under D4 in the class colours the map and
bars already use (`DROUGHT_CLASSES`). It is the Drought Monitor's canonical
chart, so a reader who knows theirs knows this one.

- Each week is a step a week wide, not a point joined to the next: a weekly
  map describes its week, and a line sloping between Tuesdays would draw
  values nobody measured.
- A week with no map is a grey band, never bridged.
- This week is marked with a line and the words "This week".
- The area is the reader's chosen one when `?area=` names one in view, and
  otherwise the most severe area this week. A select in the card changes it.
  The select is not written to the address bar: `?area=` already says which
  place a link is about, and this is which of its areas the reader is looking
  at; adding a second area parameter would give one link two answers to
  "where".
- The chart is a keyboard stop. Left and right step a week, Page Up and Page
  Down a year, Home and End go to the ends, and the readout under the chart
  says the week in words. Pointer movement does the same.
- The text alternative is a table of the highest share each class reached in
  each year. Highest, not an average: a week is a published measurement and an
  average of fifty-two of them is a figure no one measured.

**"Ten years across the areas": a calendar.** One row per drainage area in
view, one column per week. Each week is coloured by one stated rule: **the
most severe class that at least half of the area's measured land is in, or
worse** (`CALENDAR_SHARE = 50`). Half, because it makes the colour the area's
typical ground rather than its worst corner.

- A week with less than half its land even abnormally dry wears the page's
  existing "no drought" hatch. A week with no share -- no map, or no measured
  land -- is flat grey, which is neither (ADR-059). A partly measured area is
  marked with an asterisk, as in the ranked comparison (ADR-082).
- Rows are in drainage-code order. The codes run down each river system, so
  neighbours sit together and a regional drought reads as a block. Ordering by
  this week's severity would scatter that block and rank a decade by its last
  week.
- Each name is a button. Choosing one draws that area in the chart above,
  scrolls to it and moves focus there.
- The text alternative is a table of weeks at each class for every area, and
  each strip carries the same counts as its accessible name.

**The severity index is not drawn.** ADR-082 gives it no colour ramp anywhere;
the calendar is coloured by the classes, not by the index.

**The archive is fetched only when a card comes near the screen.** The basin
archive is the largest drought file the page can read. An
`IntersectionObserver` with a 600 px margin starts the request, which has a
30-second deadline, and every exit -- loaded, failed, not kept -- clears
`aria-busy` and says what happened. A reader who never scrolls that far pays
nothing, so the page's first load is unchanged.

**Hand-built SVG, like every other chart on this page.** The drought page does
not load the charts SDK, and these are two shapes -- stacked steps and
rectangles -- that need no axis engine. The calendar strips are small SVGs
inside HTML rows, stretched to their width, so the names wrap and stack at
phone width as text does.

## Alternatives rejected

**One chart of an aggregate across the areas in view.** An area-weighted
share across basins is a new estimator with a denominator this project does
not publish. The calendar shows every area instead of averaging them.

**A smoothed line, or a line through the gaps.** Both draw values nobody
measured.

**Colouring by the severity index, or by a ramp of the share.** ADR-082, and
the class colours are the page's language.

**The charts SDK.** Heavier than the page, for shapes it does not need.

## Consequences

The readiness signal gains `decadeState`, `decadeWeeks`, `decadeArea` and
`calendarRows`, and the smoke suite scrolls to the cards, waits on them,
chooses a calendar row and steps the readout with the keyboard. The
`content-language` check reads the three new files.
