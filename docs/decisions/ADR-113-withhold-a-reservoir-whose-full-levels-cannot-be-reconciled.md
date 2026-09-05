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
- Santa Clara Valley Water District publishes three capacity figures of its
  own. Its reservoir page gives **89,073 acre-feet**, the same as the
  inventory. Its seismic retrofit project page gives **90,373 acre-feet** as
  the full operating capacity the retrofit is meant to restore. The capacity
  column of its January 2026 plan packet gives **89,278 acre-feet**. None of
  the three differs from the inventory by more than a few hundred acre-feet,
  and none of them is a level the reservoir is operated to.
- The restriction's own level moved, and only part of that series is
  established. The Division of Safety of Dams restriction is effective
  **2017-05-08**. The district's early restriction was about 55 feet below the
  dam crest, about **52,553 acre-feet**. FERC directed a drawdown to deadpool
  from **2020-10-01**. A FERC amendment of **2024-04-04** permits the district
  to hold storage two feet above deadpool, **3,485 acre-feet**, and that is
  the level in force today.
- The operator's current document gives two different current levels. The
  January 2026 packet's summary table row reads `Anderson  1950  89,278
  3,159 /4%`, and the packet's text reads: "Per the FERC Order, reservoir
  storage at Anderson Reservoir was restricted to the deadpool storage as of
  October 1, 2020. An amendment to the Order was issued by FERC on April 4,
  2024, that permitted Valley Water to maintain Anderson Reservoir storage at
  2 feet above deadpool (3,485 AF)." The 3,159 in the table is deadpool; the
  3,485 in the text is what the reservoir may hold.

The reservoir sits at its permitted level. Today's reading of
**3,497 acre-feet** is **100.3%** of the permitted 3,485, inside ADR-065's
surcharge allowance, so ADR-072 — which refuses a denominator the water has
been seen above — has no objection to the level in force. The obstacle is the
history. The series begins on 2021-08-29 and holds **48,547 acre-feet** in its
first winter, inside the drawdown period: a reservoir under a drawdown order
taking more inflow through a wet winter than its low-level outlet could pass.
ADR-111's dated versions are what a record like that needs, and they cannot be
written. The level in force between 2020-10-01 and 2024-04-04 is published as
"deadpool" and never as an acre-foot figure; the plan's 3,159 is labelled
current in a 2026 document rather than dated to that period; and the same
document's text gives a different current figure. ADR-070 prefers the
operator's own figure, and each of the operator's three is a pre-restriction
pool. Every reading this project holds falls inside a period whose denominator
is not published.

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
district confirms the dated series of levels it was held to — including the
acre-foot figure that applied between 2020-10-01 and 2024-04-04 — or when the
retrofit restores a single published full level.

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
- **Publish against the current restricted level.** The level in force is
  3,485 acre-feet and the reservoir is sitting at it, so nothing about today's
  reading refuses that figure. It would still divide readings from 2021 to
  2024 by a level that was not in force then and whose replacement is
  unpublished, which is what ADR-111 exists to refuse. And "the current level"
  is itself two numbers: the operator's January 2026 document gives 3,159 in
  its table and 3,485 in its text.
- **Choose the operator's 90,373 over the inventory's 89,073.** ADR-070 would
  support it and it does not help. The operator publishes three capacity
  figures — 89,073 on its reservoir page, 90,373 on the retrofit project page
  as the level the retrofit is meant to restore, and 89,278 in its January
  2026 plan table — and they sit within a few hundred acre-feet of each other.
  The spread between them is not what makes Anderson unpublishable, and none of
  them describes what the reservoir is currently operated to.
- **Publish the reservoir with no percentage at all.** Storage in acre-feet is
  real and could stand alone. Rejected for now because every surface here is
  built around a percentage and a reservoir that silently omits one reads as a
  fault; ADR-112's typed waters are where a measurement without a denominator
  gets a proper home.
- **Withdraw it through ADR-056's freshness mechanism.** That mechanism is
  automatic, reverses itself when a feed recovers, and would state a reason
  about data age that is not true here.
