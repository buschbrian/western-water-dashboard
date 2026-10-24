# ADR-127: State what is above a reservoir as stored water

## Status

Accepted

## Date

2026-10-24

## Relates to

ADR-077 (an upstream set is published per reservoir), ADR-097 (snow filtered
by that set), ADR-117 (a new rollup axis needs its own record), ADR-008 (the
storage colours).

## Context

A reservoir's page listed every published reservoir upstream of it as a
chip, a link with its name. Lake Powell has sixty-seven. The list said what
was above the reservoir and nothing about how much water: a reader could not
tell from it whether the reservoirs feeding Powell were full, or which parts
of the basin held the water. The owner asked for "link analysis" in place of
the chips.

The site already has one rule for a total over any set of reservoirs:
`rollupOfScoped` sums current storage and sums each reservoir's full level
(its capacity, or its highest recorded storage where it has none), the rule
the storage map uses for a drainage area. The upstream set is already
committed per reservoir (ADR-077). What was missing was applying the one to
the other.

## Decision

**The reservoir page states the upstream set as stored water.**

1. One sentence gives the set's combined storage and percent of what it can
   hold, computed by `rollupOfScoped` over the set, with the same caveat the
   storage map gives: the readings are not all from the same day.
2. Fewer than eight upstream reservoirs are listed as rows. Eight or more are
   grouped by the drainage area each sits in (`huc6`), most stored water
   first, each group with its own total and its reservoirs by size. The first
   two groups open; the rest are closed but listed.
3. Each row is the reservoir's name (its page link), a small fill bar in the
   storage colours (ADR-008), its percent full and its acre-feet.
4. A station the trace names that today's roster does not publish is
   counted in the sentence, never dropped silently.

No new estimator is introduced. The totals are `rollupOfScoped`, unchanged,
over a set that already exists. That is why this is recorded as applying an
existing rule to an existing axis rather than as a new rollup axis.

## Rejected alternatives

- **Keep the chips.** They answered "which" and not "how much", which is
  the question the page exists for.
- **A network diagram of direct links.** Direct upstream links can be derived
  from the sets, but Powell's tree is shallow and wide (43 of its 67 link to
  it directly), and ADR-077 warns that transbasin diversions mean the water
  does not always go where the river points. A drawn network would imply flow
  paths the trace does not establish.
- **Average the reservoirs' percentages.** A mean of percentages lets a
  500-acre-foot reservoir outvote Flaming Gorge; the site's rule is a sum of
  acre-feet over a sum of full levels.

## Consequences

- The reservoir page gains a figure: combined upstream storage. It moves
  every morning with the payload and needs no new data.
- Lake Powell and Lake Mead are inside the upstream sets that hold them; the
  widest scope includes both, so Powell counts toward what is above Mead.
- A reader can open a basin group to see its reservoirs, or follow a row to
  that reservoir's own page.
