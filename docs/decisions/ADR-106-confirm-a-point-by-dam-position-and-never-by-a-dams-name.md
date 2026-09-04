# ADR-106: Confirm a published point by dam position, and never take a dam's name for the water's

## Status

Accepted.

## Date

2026-09-03

## Context

Forty-two published points reached the water-body review because no
hydrography source resolved them. `verify_water_body_points.py` asks five
independent publications — GNIS, NHDPlus HR Waterbody, NHDPlus HR Area, NHD
medium resolution and Esri's `USA_Detailed_Water_Bodies` — at the reviewer's
1 km threshold, and again at 4 km only when the first ask is silent.
`classify_water_body_points.py` turns those answers into a verdict.

Nine points survived all five sources. **Four of them had no water of any name
within four kilometres**, which is a different fault from the other five: for
those, 41 of 42 points had water within 4 km and the silence was the 100 m
tolerance. Four points with nothing at all are either standing somewhere other
than where they are published, or holding water too small for any national
polygon layer. No amount of re-asking the same five sources separates those
two cases, and issue #30 parked them for that reason.

Measured against the U.S. Army Corps public National Inventory of Dams service
on 2026-09-03 — the same service `audit_candidate_capacity.py` already reads as
the project's capacity authority (ADR-003):

| Reservoir | Nearest dam | Distance | NID id |
|---|---|---:|---|
| Long Hollow Reservoir | Long Hollow | **0.01 km** | CO03021 |
| Los Vaqueros Reservoir | Los Vaqueros | **0.19 km** | CA01396 |
| Seven Oaks Dam | Seven Oaks | **0.38 km** | CA01530 |
| Grantsville | Grantsville | **0.62 km** | UT00343 |
| Kolob Reservoir | Kolob Creek | 1.05 km | UT00164 |
| Frenchman Dam | Frenchman | 1.31 km | CA00032 |
| Lake Crowley | Long Valley | 1.87 km | CA00090 |
| Pleasant Valley Reservoir | Pleasant Valley | 5.28 km | CA00098 |
| Scofield | Scofield Dam | **6.02 km** | UT10133 |

The inventory answers where the five water publications do not, because it is a
register of **structures**. It carries impoundments too small to be mapped as
polygons, and it carries new ones — Los Vaqueros filled in 1998 and was
enlarged in 2012.

A second fault was found while measuring. The reviewer's `notes` column in
`nhd-review.csv` carries two different kinds of thing: a name for the water
("Bass Lake", "Seven Oaks Reservoir") and a remark about the point ("point is
slightly off", "incorrect lat long not on water"). The classifier read every
note as a name, excluding one hard-coded string. Six rows were therefore being
tested against water called "point is wrong" or "incorrect point" — **a claim
no source can ever match, so those rows could not be settled by any evidence at
all**, including the dam evidence above. Los Vaqueros was one of them.

## Decision

**1. The dam inventory is admitted as a sixth source in point review, asked
last.** `verify_dam_position.py` asks it about every row the five water
publications did not settle, and writes the answers into two columns of
`point-verification.csv`. It records the dam's name, its inventory identifier
and its distance — the evidence ADR-015 rule 7 requires for any decision made
from a dam — and it re-asks the rows it settled on an earlier run, so a second
run refreshes the evidence rather than preserving whatever it was told first.

**2. A dam carrying the claimed name inside the same 1 km threshold confirms
the point.** The verdict is `confirmed by dam position`. The threshold is the
reviewer's existing one, not a new number: a dam is where the stored water
leaves, which is the rule the drainage assignment (ADR-058) and the admission
screen (ADR-015) already use, so it is evidence about *this* point at the same
range the water sources are trusted at.

**3. A dam confirms a position and never a name.** `proposed_name` stays empty
on a dam confirmation. A dam's name is the structure's, not the water's — the
inventory calls Wolford Mountain's dam "Ritschard" (ADR-015) — and no water
publication has named this water at all. This follows ADR-078 and ADR-079,
which already decided that names are corrected at their reviewed sources and
that type is not published per record.

**4. A dam outside the threshold settles nothing, and is written down anyway.**
It goes to `dam_beyond_1km` and into the row's `why`. A named dam kilometres
from the point is precisely the evidence that tells a wrong coordinate from
unmapped water, and discarding it would leave the row saying only "no source
within 4 km" — which is the sentence that parked these four points for a week.

**5. A water publication outranks the dam inventory.** Where any of the five
names the claimed water within 1 km, the verdict and the proposed name are
theirs, unchanged. The dam is asked only where they are silent.

**6. A reviewer note is a claimed name only if it names water.** A note
carrying a water word (lake, reservoir, forebay, creek, …) is a claim; anything
else is a remark, and the row falls back to claiming its own roster name.
"water" is deliberately not one of those words, because "not on water" is a
remark. This replaces the single hard-coded "zero idea" exclusion, which the
rule now subsumes. Both rules are held by `tests/test_water_body_verdicts.py`.

## Consequences

Four rows moved from `human review` to `confirmed by dam position`: Los
Vaqueros Reservoir, Seven Oaks Dam, Long Hollow Reservoir and Grantsville. The
open review queue fell from nine rows to five. **No other verdict moved, and no
`proposed_name` changed** — the 31 confirmed rows and the 2 suspect rows are
byte-identical.

**Scofield stays open, and this record is why.** Its dam is 6.02 km from its
published point and no source of any kind names water within 4 km. Under rule 4
that is now stated in the row rather than hidden: a 73,600 acre-foot reservoir
whose dam is six kilometres away has a wrong coordinate, not unmapped water.
Which coordinate replaces it — the dam's, or the waterbody centroid — is a
publication decision that this record does not make. ADR-096 holds the
distinction it has to respect: the published reservoir coordinate is the
waterbody point, and the dam or outlet assignment point is not the same fact.

Nothing published moves. `point-verification.csv` is a review artifact; no
payload, roster, symbol or figure reads it.

The three tools now run in order — `verify_water_body_points.py`, then
`verify_dam_position.py`, then `classify_water_body_points.py` — because the
first rebuilds the file from scratch and would drop the dam columns. The order
is stated in each tool's docstring. The dam probe merges and asks only about
unsettled rows, so re-running it after the water probe is a handful of requests
to a public service this project does not pay for.

The `reviewer_note` column in `point-verification.csv` is now older than
`nhd-review.csv`, whose notes were revised after the file was last rebuilt.
Nothing reads that column; the claim is computed from `nhd-review.csv` on every
run. It corrects itself the next time the water probe runs.

## Alternatives considered

**Ask the five water sources at a wider radius.** Already done: 4 km, and all
five were silent for all four points. Widening further would start returning
water that belongs to something else, which is the reason the 1 km threshold
exists.

**Take the dam's name as the water body's name.** This would have named Los
Vaqueros' water "Los Vaqueros" and Kolob's "Kolob Creek" — one right by
accident, one a stream. ADR-015 measured that agencies name the same structure
differently, and ADR-079 already decided where a name is corrected. A register
of structures is not a naming authority for water.

**Move Scofield's point to its dam in this change.** The evidence supports that
the point is wrong; it does not decide what replaces it, and ADR-096 says the
published coordinate is a waterbody point rather than a dam point. Correcting a
published coordinate moves what a reader sees on the map and needs its own
justification.

**Fix the note-reading bug by adding "point is slightly off" to the excluded
strings.** That is the hard-coded exclusion that already existed, once. It
fails silently every time a reviewer writes a new remark, and it had already
failed for six rows before anyone noticed.

**Match the note to the reservoir's own name instead.** A remark shares no word
with the reservoir, so the rule looked equivalent — and it would have discarded
Crane Valley's genuine rename to "Bass Lake", which shares no word either.
