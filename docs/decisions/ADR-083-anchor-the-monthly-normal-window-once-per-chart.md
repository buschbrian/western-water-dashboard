# ADR-083: Anchor the monthly normal window once per chart

- Status: Accepted
- Date: 2026-08-22

## Context

`monthly_history` computed each month's recent `normal_af` as the median of
that calendar month's mean across years **strictly earlier than the month's
own year**. On a chart spanning September 2025 to August 2026, the 2025
months drew on 2015–2024 and the 2026 months on 2015–2025 — one extra year,
recent, and in a drought record probably dry. Each cut was defensible per
point; drawn as the continuous line the twelve-month chart draws, it was two
baselines joined invisibly at 1 January.

The rule broken alongside was this repository's own: *a median never appears
without the number of years behind it*. The monthly rows published a median
and no count.

## Decision

**The window is anchored once.** The anchor year is the earliest month in the
returned window, and every month's normal is computed over calendar years
strictly before it. A September-to-August window reads one population for all
twelve months. When the whole window falls inside a single calendar year the
anchor equals that year and the behaviour is unchanged.

**Each row publishes `normal_years`**, the count of years behind its median.
Additive: payloads written before it are read unchanged by the validator, and
the details panel states the count beside what it counts — once per chart,
because all twelve months now share one population.

**`METHOD_VERSION` does not move.** The test the architecture doc gives is
whether a committed normal built under the old version is still a correct
answer. `normals.json` holds the closed 1991–2020 period, built by
`tools/build_normal_baselines.py`, which this function never touches; the
change reaches only the recent monthly normal computed live from the series.
No committed figure is invalidated, so bumping the version would force a full
network rebuild that changed nothing and would claim an estimator had changed
when it had not — exactly the case ADR-072 established the rule for. The
change carries this record instead.

## Alternatives rejected

**Cutting at the chart's newest month instead of its earliest.** Same defect,
mirrored: the earlier months would lose their most recent prior year rather
than the later months gaining one. Any per-month rule produces a seam;
only a shared anchor removes it.

## Consequences

Published monthly normals for any window spanning a year end move, by up to
the effect of one year entering or leaving each median's population. The size
of the step could not be isolated from the payload alone — it is confounded
with real December-to-January seasonality — so no magnitude is asserted
anywhere; tests assert the structure instead: every row reports the same year
count, and the counts name the years actually cut.

`reservoirs.json` gains the field on its next scheduled refresh; until then
the validator and the documentation treat it as optional, and the panel falls
back to its previous wording.

## Related

- Narrows [ADR-041](ADR-041-let-the-reader-choose-the-comparison-period.md)'s
  per-month comparison rule for the live twelve-month line only; the
  reader-selected baselines are untouched.
- Follows [ADR-072](ADR-072-divide-by-a-figure-the-water-has-not-been-seen-above.md):
  a version bump is for a change that invalidates committed figures, not for
  a presentation-window repair.
- Method rule recorded in
  [`docs/architecture/hydrology-methods.md`](../architecture/hydrology-methods.md).
