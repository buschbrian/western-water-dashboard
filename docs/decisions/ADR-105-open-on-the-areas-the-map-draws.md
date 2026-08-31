# ADR-105: Open on the areas the map draws, not on the box saved links resolve to

- Status: Accepted
- Date: 2026-08-31
- Supersedes: the part of ADR-068 that keeps `MAP_BOUNDS` as the box the
  storage map opens on for a reader who has chosen no scope

## Context

ADR-063 opened the storage map on the roster's box. ADR-068 moved the roster
west and, to protect ADR-044's contract, froze the opening box at the value
the roster had on the day it was still `utah-connected`:
`expandBounds([[-115.70611, 35.1088], [-105.62642, 43.45212]], 2)`. That was
the right call for the constant. It left the *view* behind.

The reservoirs moved and the opening view did not. `MAP_BOUNDS` is centred at
about -110.7; the roster is centred at about -114.7. Every reader who has
chosen no place has since opened the map four degrees east of its own
subject, on a page titled "Western Reservoir Storage" and reached by a button
that says "Show the whole west".

Measured against the committed roster, on the deployed build, counting
reservoirs outside the opening frame:

| Viewport | Map stage | Off screen at open |
|---|---|---:|
| Phone, portrait | 390 × 778 | **182 of 404** |
| Tablet, portrait | 768 × 958 | **254 of 404** |
| Desktop | 1440 × 834 | 15 of 404 |

The tablet figure is the worst because an extent is a *minimum*: the taller
the canvas relative to its width, the more latitude the fit adds and the less
longitude is left for the geography. The whole California coast — the densest
cluster of reservoirs on the continent — sat outside the frame on both
portrait sizes, while the canvas that would have shown it was spent on empty
plains east of the divide. The reader was not told; nothing is missing from
the list, the table or the totals, so the map simply looked like a map of
somewhere else.

This was invisible to every automated suite. The browser suites assert that
the map draws, that layers load and that readiness is reached — all true on
every one of these runs. Where the frame *is* has no assertion, and headless
Chromium renders the canvas blank, so no screenshot could have shown it
either. It was found by opening the built page in a real browser at a real
phone size and counting.

## Decision

**The storage map opens on `OPENING_BOUNDS`: the box of the drainage areas it
draws**, `[[-124.903, 29.838], [-105.626, 52.881]]`.

`OPENING_BOUNDS` is its own exported constant in `src/viz/extent.ts`, with its
own literal and its own tests. It is numerically equal to `DRAWN_BOUNDS`
today and is deliberately not aliased to it: "which areas are drawn" and
"where does a page open" are two of the four scope questions, they happen to
have one answer at the moment, and the second has to stay free to move
without dragging the first.

**`MAP_BOUNDS` does not move and does not lose a job.** It keeps its value,
keeps its parity test against the frozen module, and keeps feeding
`NAVIGABLE_BOUNDS` — where a reader may go is still a contract with the saved
links the retired routes translate, and unioning with it is what stops that
contract narrowing. What it stops being is the answer to a second question it
was never measured for. `regionExtent()` remains, and now names only the
first.

The box is used unexpanded. An extent is a minimum, so a wide canvas already
gets its margin for free; expanding the box as well would push the geography
further away on every screen.

Measured after the change, same builds and same viewports:

| Viewport | Off screen before | after |
|---|---:|---:|
| Phone, portrait | 182 | **11** |
| Tablet, portrait | 254 | **0** |
| Desktop | 15 | **0** |

The eleven that remain on a phone are the easternmost headwaters. At 390
pixels the fit needs zoom 4.83 to hold all 17.8 degrees of the roster's
longitude and `MAP_MIN_ZOOM` is 5 (ADR-044), so the frame is about a degree
short at the east edge. Raising that ceiling is a separate question about
whether a zoom floor expressed in levels means the same thing on a phone as
on a desktop, and it is not answered here.

## Alternatives considered

**Move `MAP_BOUNDS` west.** One constant, no new name, and it breaks the
contract ADR-044 wrote down and ADR-068 went to some trouble to protect. It
would also require editing `shared/reservoir-viz.js`, which ADR-008 froze.

**Choose the box by viewport aspect** — the drawn areas on a portrait canvas,
`MAP_BOUNDS` on a landscape one. Rejected after measuring: the drawn areas
are better on *every* size, desktop included, where they take the off-screen
count from 15 to 0 at essentially the same scale (zoom 5.81 to 5.74). A
branch that has no case to serve is a second behaviour to keep true.

**Expand the box for margin, as `MAP_BOUNDS` expands its own base.** Rejected:
see above. The margin a wide canvas needs is the one the fit already adds.

**Leave it and lower `MAP_MIN_ZOOM` instead.** Does not address the centring
at all — a wider view of the wrong middle is still the wrong middle — and
reopens a ceiling ADR-044 measured deliberately.

## Consequences

- A reader who has chosen no place sees the west the page is named for, at
  every viewport, and the phone stops hiding 45% of the roster.
- `MAP_BOUNDS` now answers exactly one question. This is ADR-068's own split
  applied to the constant it did not finish splitting; if the two ever become
  equal again, a test fails and says so.
- **A saved link that carried no scope now lands on a different view.** It
  lands on more of the data than it used to, at a comparable scale, and no
  link stops resolving — but the framing an old bookmark opens to is not the
  framing it opened to yesterday. That is the cost, and it is the point.
- The opening view now follows the drawn scope, so admitting reservoirs into
  a new drainage area moves it. That is the behaviour ADR-063 wanted and
  ADR-068 had to give up to protect a different contract; it is safe now
  because the two constants are no longer the same one.
