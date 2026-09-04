# ADR-099: Admit an operator-measured reservoir with no dam inventory record

- Status: Superseded by ADR-110
- Date: 2026-08-29

## Context

Every reservoir on the roster is admitted against a National Inventory of Dams
record. That record does two jobs: ADR-015 confirms the structure by position
before name, and ADR-003 takes the denominator from its conservation pool. The
shared screens run unmodified for every provider, and a candidate with no dam
match is held rather than published.

Montana's Department of Natural Resources and Conservation publishes total
storage through its Stream and Gage Explorer service. One sensor sits in the
accepted western drainage scope: East Fork Rock Creek Reservoir, on the
Clark Fork above Philipsburg. Nine further Montana sensors drain to the Gulf of
Mexico and are out of scope for reasons that have nothing to do with this
record.

The search for its dam returned nothing inside the shared match radius. The
reservoir is real, currently measured, and operated by the same department
that publishes the readings: it is a Montana State Water Project reservoir,
and the department publishes the structure's own location and its full level
of 16,040 acre-feet in the service's metadata layer.

So the screens refuse this reservoir for a reason that does not apply to it.
The dam inventory is evidence about a structure the project cannot inspect;
here the operator of the structure is the one publishing, and both facts the
inventory would have supplied are available from the party in the best
position to know them.

## Decision

Admit East Fork Rock Creek Reservoir on the operator's own location and full
level, with `capacity_basis` of `dnrc_stage_metadata` and `nid_id` of null.

The absence must be written down, not inferred from a blank field. The roster
entry carries `match_confirmed_by` of `dnrc_stage_location`, and the loader
refuses any Montana entry that does not; the withheld block states the finding
in words. The full level names the service layer it was read from, the same
citation ADR-070 requires of every operator-published denominator.

This narrows nothing for any other provider. A missing dam record remains a
hold for every candidate whose readings do not come from the reservoir's own
operator, and the shared screens are unchanged.

## Rejected alternatives

- Hold the reservoir until a dam record is found. This withholds a current,
  operator-measured observation on the strength of a gap in a third-party
  inventory, and there is no date by which the gap would close.
- Admit it with the dam fields simply left empty. A blank field is
  indistinguishable from a screen that never ran, which is exactly the
  confusion a roster of reviewed evidence exists to prevent.
- Generalise the rule to any provider that publishes a full level. The
  reasoning rests on the publisher being the operator of the structure, which
  is true of this department and not of a service that redistributes readings.

## Consequences

The roster carries one reservoir whose location and denominator rest on the
operator rather than the dam inventory, and says so in the file. Percentages
for it are measured against an operator-published full level, which the
details panel names the way it names every other operator's figure (ADR-070).

The count of reservoirs with no dam record is one, and stays visible: a second
would need this record extended or its own, because the loader's check names
this provider explicitly rather than describing a class.

This record extends ADR-003 and ADR-015 for a single admission and leaves both
in force everywhere else.
