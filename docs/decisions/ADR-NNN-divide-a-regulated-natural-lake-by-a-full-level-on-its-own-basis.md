# ADR-NNN: Divide a regulated natural lake by a full level on its series' own basis

- Status: **Proposed** (for Brian Busch's approval; no number claimed until it lands)
- Date: 2026-11-11
- Applies: ADR-078 (a natural lake raised by a control structure is a reservoir; no third type)
- Relates to: ADR-070 (the operator's own full level), ADR-072 (a figure the water has not been seen above), ADR-110 (a reviewed non-inventory capacity), ADR-065 (the ceiling), ADR-112 (terminal lakes stay separate)

## Context

ADR-078 settled what these waters are: a natural lake raised by a dam or outlet structure is a reservoir, and "regulated lake" was refused as a third type. It did not settle what such a reservoir is divided by, and the roster now answers that question two ways.

**Published, with a full level on the series' basis:**

| Reservoir | Provider | Full level (af) | Basis | Record high (af) |
| --- | --- | ---: | --- | ---: |
| Flathead Lake | NRCS | 1,791,000 | normal storage | 1,818,720 |
| Bear Lake | NRCS | 1,302,000 | NRCS reservoir metadata | 1,207,089 |
| Utah Lake | NRCS | 870,900 | NRCS reservoir metadata | 934,777 |
| Upper Klamath Lake | NRCS | 735,000 | normal storage | 632,061 |
| Lake Tahoe | NRCS | 732,000 | normal storage | 732,300 |

**Held, because the dam match found a figure on a different basis:**

| Water | Record | Finding |
| --- | --- | --- |
| Lake Pend Oreille | Corps `ALF`, NRCS 12392500 | 1,557,900 af observed (total lake) against Albeni Falls' 1,153,000 |
| Coeur d'Alene Lake | Corps `COEI`, NRCS 12415500 | No dam within the radius; Post Falls regulates it 20 km downstream |
| Priest Lake | NRCS 12393000 | 153,616 af observed against the outlet dam's 76,100; monthly values run 38,675 to 168,010, basis unexplained |
| Henrys Lake | NRCS 13039000, RISE 130840 | 93,471 af observed against the dam's figure; reporting again since 2026-11-08 |
| Mud Lake | NRCS 13115000 | No dam close enough to confirm |

The screens are right to refuse these as matched. A series that reports the whole lake, divided by a dam's figure for its top few feet, publishes a percent above 100 every wet spring. The fault is the denominator's basis, not the water.

## Decision (proposed)

1. **A regulated natural lake is published against a full level on the same basis as its storage series**, chosen in this order:
   1. the operator's or regulator's stated full level on that basis (ADR-070);
   2. a reviewed survey or water report on that basis (ADR-110);
   3. never the dam's inventory figure when the series measures more than the dam controls.
2. **The basis is stated.** The capacity block names whether the series and the full level are the total lake volume, or the active range above a stated datum, and cites the source for both. Lacking either, the lake stays held with that finding.
3. **The refusal is waived only by that evidence.** A reviewed admission waives "holds more water than the dam can contain" and names the same-basis source. ADR-065's ceiling still applies to the chosen figure.
4. **No new type and no new word.** The record stays a reservoir (ADR-078), and its name keeps its local form. Where ADR-114 characters apply (a lake held at a steady level, for instance), they are ruled separately.
5. **Existing records are checked against the rule, not changed by it.** The five published lakes are reviewed for a stated basis. Any whose basis can't be shown is recorded as a finding, not withdrawn.

## Consequences

- Pend Oreille and Coeur d'Alene become admissible from the Corps or NRCS once a total-lake full level at full pool is cited, from the operator or the Idaho Department of Water Resources.
- Henrys Lake and Mud Lake need the same. Priest Lake needs NRCS or IDWR to state what its series measures from, before anything else.
- The NRCS candidate screen keeps refusing these automatically. The rule changes what a reviewer may accept, not what the screen reports.

## Rejected alternatives

- **A `regulated_natural_lake` type.** ADR-078 refused it, and the arithmetic problem is the denominator, which a type would not fix.
- **Divide by the dam's figure and cap the percent at 100.** It hides a real record and repairs a number, which ADR-072 and ADR-116 refuse.
- **Publish total lake volume with no percent, like a terminal lake.** These lakes have a regulated full pool, unlike a terminal lake, and readers compare them with reservoirs.
