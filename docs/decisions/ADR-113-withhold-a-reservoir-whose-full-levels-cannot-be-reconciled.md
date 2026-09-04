# ADR-113: Withhold a reservoir whose full levels cannot be reconciled

- Status: Accepted
- Date: 2026-09-04
- Qualifies: ADR-070, ADR-072 and ADR-111

## Context

ADR-070 settled which of two sources answers "what is full" when both publish a
figure: the operator's own, where it publishes one. ADR-111 added the case
where the answer changes over time. Both assume that once the rule has run,
one figure stands.

Leroy Anderson is the reservoir where none does.

- The National Inventory of Dams publishes **89,073 acre-feet** as its normal
  storage, its maximum storage and its headline figure alike.
- Santa Clara Valley Water District publishes **90,373 acre-feet** as the full
  operating capacity its seismic retrofit is meant to restore.
- The reservoir has been restricted since **2017-05-08**, and the restriction's
  own level moved: about **52,553 acre-feet** at roughly 55 feet below the
  crest, then a FERC-directed drawdown to elevation 488 feet from
  **2020-10-01**, and **3,159 acre-feet** in the district's January 2026 plan.

The series refuses every one of them. It begins in 2021, inside the restricted
period, and holds **48,547 acre-feet** there — fifteen times the current limit.
Today's reading is **110.7%** of that limit and has stood above it every month
for a year. ADR-072's rule, that a denominator is a figure the water has not
been seen above, disqualifies the restriction. ADR-070's rule prefers the
operator's figure, and the operator publishes two of them for different
purposes. ADR-111's dated versions would express the history if the history
were known, and the dated acre-foot levels for the intermediate stages are not
published anywhere this project has found.

The site currently publishes Anderson at 3.9% full. That figure is arithmetically
true against 89,073 and tells a reader the opposite of what is happening: the
reservoir is not short of water, it is deliberately empty for construction and
is at the level it is allowed to hold.

## Decision

**A reservoir whose full level cannot be established from its sources is
withheld from the roster, and the disagreement is stated.**

The roster entry names each figure, its publisher and the date it was checked,
and says plainly that no one of them is the level the water is measured
against. Withholding is a reviewed decision recorded in the admission file. It
is not ADR-056's withdrawal, which is automatic, derived from data age, and
reverses itself when a feed recovers — Anderson's feed is healthy and its
readings are plausible. What fails here is the denominator, not the
measurement.

**This project does not adjudicate between government sources.** Where two
agencies publish incompatible facts about the same structure, this site records
the conflict and declines to publish a number that depends on resolving it.
Determining which agency is right about a physical pool is a dam-safety
question, and the reader is better served by a reservoir's absence and a stated
reason than by a percentage whose denominator this project chose.

**A withheld reservoir names what would settle it.** Anderson returns when the
retrofit restores a single published full level, or when the district publishes
the dated series of levels it was held to.

## Consequences

Leroy Anderson leaves the published roster and the refresh drops it from the
payload. Its entries in `counties.json` and `normals.json` become unread rather
than wrong, and neither is rebuilt for it: the county file is checked for
covering the roster rather than for matching it exactly, and a normal is in
acre-feet and does not depend on a denominator. Both are regenerated on their
own schedules and will shed the entry then.

`reference.json` is rebuilt, because the published capacity catalog is the
roster and would otherwise still offer Anderson's full level to a reader.

Calero and Coyote stay. Their operator limits also cannot divide their records
— they are at 124% and 205% of the January 2026 figures — but the inventory
figure they publish against is not itself contradicted, so nothing about them
is unresolvable. Only the restricted denominator is unavailable, and ADR-111
already says such a denominator does not move without evidence.

This rule will remove reservoirs that a wider restriction audit reaches. That
is the intended direction: the alternative is a roster whose percentages are
sometimes a measurement and sometimes this project's arbitration.

## Rejected alternatives

- **Publish against the inventory's 89,073 and say nothing.** This is what the
  site does today. The number is defensible in isolation and misleads in
  context, and the misleading part is the part a reader takes away.
- **Publish against the current 3,159 limit.** The water has stood above it
  every month for a year, which is what ADR-072 exists to refuse, and it would
  divide 2021 readings by a 2026 figure, which is what ADR-111 exists to
  refuse.
- **Choose the operator's 90,373 over the inventory's 89,073.** ADR-070 would
  support it and it does not help: the 1.5% difference between them is not what
  makes Anderson unpublishable, and neither figure describes what the reservoir
  is currently operated to.
- **Publish the reservoir with no percentage at all.** Storage in acre-feet is
  real and could stand alone. Rejected for now because every surface here is
  built around a percentage and a reservoir that silently omits one reads as a
  fault; ADR-112's typed waters are where a measurement without a denominator
  gets a proper home.
- **Withdraw it through ADR-056's freshness mechanism.** That mechanism is
  automatic, reverses itself when a feed recovers, and would state a reason
  about data age that is not true here.
