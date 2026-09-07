# ADR-118: Show terminal lakes on their own page

- Status: Accepted
- Date: 2026-09-06
- Extends: ADR-117 and ADR-045
- Qualifies: ADR-078's glossary statement, already superseded by ADR-112

## Context

ADR-117 built the pipeline half of ADR-112: `lakes.json` carries Walker Lake's
surface elevation and volume with no full level, and named the reader surface
as the next decision. Three places could show a lake.

The storage map draws every point with a colour from the storage class table
(ADR-008) and adds every point into a drainage area's total and combined full
level. A lake has no percent full to colour by and must join no total
(ADR-112), so putting one on that map means a second symbol language, a guard
in every rollup, a guard in the table, the ranking chart, the CSV export, the
hover card and the details panel, and a runtime validator that accepts a
record with none of the fields every other consumer requires.

The one-reservoir page resolves a name against the reservoir payload and
describes the reading through the details panel's builder, which begins from a
percent full. A lake would need a parallel path through the same page,
distinguished by a parameter, with most of the page's sections not applying.

A page of its own has none of those costs and one of its own: another page to
reach, on a navigation bar that clips rather than scrolls at phone widths.

## Decision

**Terminal lakes have their own page, `lakes.html`.** It is a reading page in
the one-reservoir page's frame, with every published lake on it: the site has
one lake, and a page per lake would be a link to a page with one thing on it.
Each lake states what it is and why it has no percent full, then shows two
measurement cards, surface level and volume, each with its current value,
dated record readings, dated changes and history rank; the twelve months of
volume through the shared trend chart with a single neutral bar colour and no
share of anything; location from the lake point; any targets as goals; and its
sources, with the datum and the volume table named in full.

**The page is reached from the methods and data pages, not from the bar.**
The glossary gains a "Terminal lake" entry that links to it and the
"Reservoir" entry now scopes itself to the storage map and charts. The data
page documents `lakes.json` and every field. Whether one lake earns a place in
the navigation bar, at the cost of clipping at 390 pixels, is left for when
there is more than one lake or a reader asks.

**The payload is published like the reservoirs'.** `lakes.json` is copied to
the root, under `data/` and as `api/lakes.json`, checked by the deploy and
never imported (ADR-002). The runtime validator refuses a lake record carrying
a reservoir-only field, a level carrying a percentage change, a target spelled
as a capacity, and a notice carrying a measurement, so the browser holds the
same rules the pipeline does.

**The words are the details panel's where a fact is the same fact.** Change
intervals and the ordinal of a history rank come from `src/state/detail.ts`.
A lake publishes no percentile, so its rank reads "3rd-lowest of 12" and stops
there. A level is never a percentage of anything; a volume's change carries a
share of the earlier reading. The vertical datum is spelled out — "National
Geodetic Vertical Datum of 1929" — and the smoke suite refuses its initials
(ADR-006).

## Rejected alternatives

- **Draw the lake on the storage map** with a distinct symbol and exclude it
  from every total. Every reservoir consumer needs a guard, and the map's
  legend has to explain a mark that means "not in this total" beside marks
  that are. It may still be right once several lakes exist; it is not right
  for the first one.
- **A `reservoir.html?lake=` path.** One page describing two kinds of water
  through two builders, with a parameter deciding which sections exist.
- **A bar entry now.** The bar clips at phone widths and the page has one
  lake on it.
- **Colour the volume bars by a storage class.** There is no class to colour
  by; a colour from the storage table would say there was.

## Consequences

- New: `lakes.html`, `src/lakes.ts`, `src/lakes-model.ts`,
  `src/data/lakes-validate.ts`, `src/ui/lakes-template.ts`,
  `src/styles/lakes.css`, `window.__lakesReady`, the `lakes` page id, a data
  page section and field groups, and a smoke-suite case at every width.
- The methods glossary changes for the first time since ADR-078: a reservoir
  is every water on the storage map and charts, and a terminal lake is
  defined beside it.
- `docs/data-transfer.md` gains `lakes.json` once it is measured on the wire.
- The next lake decisions are the elevation-only record (Pyramid Lake) and
  the arm-aware record (Great Salt Lake), each of which changes the payload
  contract before it changes this page.
