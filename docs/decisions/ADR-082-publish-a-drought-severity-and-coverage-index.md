# ADR-082: Publish a Drought Severity and Coverage Index over measured land

- Status: Accepted
- Date: 2026-08-22

## Context

The drought page answers "how dry" with class ladders — a worst-class tile, a
severity histogram, an "extreme or worse" count. What it never had was the
Drought Monitor's own continuous summary statistic, the DSCI: the sum of the
cumulative D0–D4 shares, running 0 to 500, one number that respects extent
and is comparable across areas and across weeks. Two areas both worsted at
severe drought tie on every ladder the page offers; their indices can differ
by 200 points.

Everything the index needs is already published per area:
`percent_of_area_at_least.d0 + d1 + d2 + d3 + d4`. No pipeline change.

Two adjacent findings from the same review shaped the decision:

**Partly measured areas were read as whole ones.** ADR-059 built the
`measured` block so a basin crossing a border cannot publish phantom
drought-free land; nineteen of seventy-five areas carry one. But the card a
reader saw handled only the binary case: Rio De La Concepción's card stated
"100.0% of the land is in a drought class or abnormally dry" on the strength
of 1.3% of its area, and no surface said *measured*. The word appeared
nowhere on the rendered page.

**The binary predicate gated the analysis too.** `isMeasured` let a thinly
measured area into the scatter, the ranked gap list and the "areas in extreme
drought or worse" tile on equal footing with a fully measured one.

## Decision

**`droughtSeverityIndex(unit)` in `src/drought-model.ts`** returns the sum of
the cumulative shares, one decimal, null for an unmeasured area. It is
surfaced as a figure on each drainage-area card ("Drought severity index N.N
of 500") and offered as an ordering (`?sort=index`) beside the worst-class
ordering it can separate ties for. The scatter's point colour stays the USDM
class ramp (ADR-008, ADR-032); the index is not given a colour ramp anywhere.

**The index is derived client-side and carries no version.** It computes from
published shares at read time, exactly like every other figure on the page;
there is no estimator of its own to version, and `method.version` on the
coverage file already governs the shares it reads.

**`isWellMeasured(unit)` marks; it never excludes.** A named threshold
(`WELL_MEASURED_PERCENT`, 90) with a comment stating its marking-only rule.
Used to draw thinly measured areas differently — a hollow point in the
scatter, an asterisk after the name in the ranked list — and to add one
qualifying sentence under the "extreme or worse" tile when any area in scope
is thin. Excluding such areas from counts would change published behaviour
and needs its own decision record.

**The coverage disclosure reaches everything derived from measured land.**
Card segment titles say "of the measured land" for partly measured areas,
each card states what share of the area its figures cover, and the scatter
and ranked-list tooltips name both the worst class (so colour is never the
only cue) and the measured share.

## Alternatives rejected

**Recolouring the scatter by a severity ramp.** The monitor's yellows and
reds are the page's colour language, and readers who know the national map
recognise them. A prettier ramp is a bad trade.

**Excluding thinly measured areas from counts and rankings.** The shares are
well-defined over measured land; dropping areas would change published counts
and hide the very areas whose figures most need weighing.

**Publishing the index from the pipeline.** It is one addition over fields
the payload already ships; computing it twice would be two chances to drift.

## Consequences

The tile's count, the ordering and every card now state their denominator
where it is partial, and a reader can weigh "100% in drought" against "of
1.3% of the area".

**Open question left for the maintainer:** whether an area measured over
1.3% of its land belongs in a severity headline at all — in the tile count,
the histogram or a severity ordering. That is a change to published numbers
and needs its own record; until then the rule is mark, never drop.

Ordering by the index sorts unmeasured areas last, consistent with how the
storage ordering treats a missing reading.

## Related

- Follows [ADR-059](ADR-059-not-measured-is-not-no-drought.md): not measured
  is not no drought, and partly measured is not wholly measured either.
- Bound by [ADR-008](ADR-008-one-class-break-table.md) and
  [ADR-032](ADR-032-one-colour-language-per-map-across-pages.md): the class
  colours keep their meaning; the index takes no colour.
- Extends [ADR-074](ADR-074-compare-the-week-with-the-one-before-it.md)'s
  principle that one shared computation feeds every surface.
