# ADR-114: Publish a water type and an operating character

- Status: Accepted
- Date: 2026-09-04
- Extends: ADR-112
- Qualifies: ADR-072 and ADR-111

## Context

ADR-078 refused a per-record type field, and its reason was sound at the time:
"a field that is the same on all 375 records is not information." Every water on
the roster held back a dam, reported storage and had a reviewed full level, so
the type was a property of membership and lived in one glossary sentence.

That premise has expired. ADR-112 admitted a second water type, and the roster
has since grown into operations the original Utah scoping never met.

**Two published drainage areas are almost entirely navigation pool.**

| Area | Share of the area's full level held at a steady level |
|---|---:|
| Lower Snake | **97.6%** (2,003,700 of 2,052,957 acre-feet) |
| Middle Columbia | **94.9%** (2,210,000 of 2,329,891) |

Those pools behave exactly as their operation implies. Nine of the eleven sit
between 89% and 98% full with annual changes inside ±1.6% — Lake Wallula at
97.2% and +0.5%, Lower Granite at 97.1% and −1.0%. The site publishes "Lower
Snake is 96% full" beside "Sevier is 40% full" as though they were the same
kind of claim. One is a drought signal; the other is a level an operator holds
for barges. Every individual number is correct and the comparison is not.

**And the same reading has several causes that nothing can tell apart.** Three
published reservoirs never reach a third full: Martis Creek at 12.8%, Seven
Oaks at 13.2%, Morena at 28.4%. The first two keep that space empty to catch
floods. The third is held below its full level by a dam safety order. One
signal, three causes.

**The code has asked for this field twice already.** ADR-072 discovers that a
reservoir reports gross storage against a summer pool by offering each figure
in turn and taking the first the record fits inside — it infers the class from
the data because it has nowhere to read it from. And `NEVER_FILLED_SHARE` in
`admission.py` says so outright: "Two different faults land here and neither
can be told from the other without a person: a denominator that belongs to
something else, and a flood-control dam operated empty on purpose, which is a
real reservoir whose percentage is true and useless."

## Decision

**Two fields, on two axes.**

`water_type` is ADR-112's and is unchanged: what the water *is*, `reservoir` or
`natural_terminal_lake`.

`operating_character` is new: how the water is *run*. Its values are
`restricted`, `run_of_river` and `flood_space`. Ordinary target-filled storage
carries no value at all.

One field cannot hold both. Lake Wallula is an ordinary reservoir run as a
navigation pool; Walker Lake is a different kind of water. Collapsing those into
one enum forces a choice between two questions for waters that need both
answered.

**Only exceptions carry a value, and the file says it was swept.** A roster's
existing top-level `reviewed` date is what makes absence mean *found ordinary*
rather than *not looked at* — the distinction ADR-110 drew when it ruled that a
blank `nid_id` is not evidence a search ran. Reviewing 405 reservoirs to write
`target_filled` 390 times would be ADR-078's objection returning in a new field.

**A character is reviewed evidence and names its source.** A `restricted`
reservoir carries the authority that set the level and the date the order took
effect, the same evidence ADR-111 requires of a restricted full level.

**The type labels; it does not yet calculate.** Every published figure stays
exactly what it is today. Whether a navigation pool belongs in a drainage area's
combined full level, and whether flood space should be totalled separately, are
real questions that move published numbers — and each gets its own decision with
its own measurement, as ADR-070 and ADR-072 each did before landing.

**A character reaches the map without touching colour.** A reservoir held below
its full level gets a distinct outline, the way a late reservoir already gets a
dashed ring. Colour still comes only from `ReservoirViz.CLASSES` (ADR-008), so
the frozen table stays the colour authority. `run_of_river` and `flood_space`
are panel and data only: neither is held down by anyone, and one visual
treatment for all three would claim they are the same condition.

**The words are the deliverable, so the words are decided here** (ADR-006). The
vocabulary table is `.claude/rules/visible-language.md`; the sentences are:

| Character | What a reader sees |
|---|---|
| `restricted` | A dam safety order holds this reservoir below its full level. The order started on May 27, 2015. |
| `run_of_river` | The operator keeps this reservoir at a steady level all year. Its percent full changes very little. |
| `flood_space` | This reservoir keeps space empty to catch floods. It is not expected to fill. |

"Restricted" is refused as a visible word twice over: it is the manager's term
of art, and in everyday use it means restricted *access*, which is wrong for a
reservoir people fish in.

## Consequences

The twelve reservoirs known to be held below their full level by an order, but
whose allowed acre-foot level no operator publishes, are labelled rather than
withheld or researched. Their denominators do not move, because nothing
contradicts the inventory figure they divide by; the reader is told why the
figure reads low. That is ADR-104's stated-finding precedent applied to a class.

Leroy Anderson is not among them. Its case is ADR-113's, where every candidate
figure was disqualified rather than merely unquantified.

`admission.py` gains a field it can read. `NEVER_FILLED_SHARE` can stop
referring a flood-space reservoir to a person, and refer only the identity
failures it cannot explain.

## Rejected alternatives

- **Read NID's dam purposes.** Authoritative, already in the layer the capacity
  builder reads, and free. Rejected as the field itself: purposes are
  multi-valued — Detroit is flood control and hydroelectric and recreation —
  and they describe what a dam was built for rather than how it is run. A dam
  built for flood control may be operated for supply. It remains useful as
  evidence *toward* a reviewed character.
- **Extend ADR-112's water type with the operating values.** One vocabulary and
  one place to look. Rejected because it mixes two axes, making a navigation
  pool and a terminal lake the same kind of distinction when they are not.
- **One field for what the denominator promises.** Closest to the numbers and
  simplest to reason about, and it collapses ADR-112's water-type decision into
  an operating question, which would mean reopening a record accepted the same
  day.
- **Assign the character from the observed series.** A flat line at 95% is the
  signature of a navigation pool and the temptation is to read the type off it.
  This is exactly what ADR-070 refused when it declined to prefer a denominator
  "only where the water exceeded the inventory's", because it makes the answer
  depend on how wet the last decade was. The signature is evidence that a
  reviewed character is right, never its source.
- **Look the type up in a hydrographic classification.** ADR-078 already
  measured this: NHD's `FType` typed twenty-five of twenty-six waters as
  LakePond, Courtright and Ice House among them, both dammed impoundments with
  reviewed capacities.
- **Let the type change the arithmetic immediately.** It is the eventual point
  and it moves published figures for two drainage areas substantially. Rejected
  as one step: a vocabulary that has never been reviewed against the roster is
  the wrong thing to hang a method change on.
- **Give every character the same map treatment.** Rejected for the reason the
  characters exist: they are different conditions, and one ring for all three
  would say they are one.
