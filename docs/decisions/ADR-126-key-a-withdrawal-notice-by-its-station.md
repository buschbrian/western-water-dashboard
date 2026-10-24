# ADR-126: Key a withdrawal notice by its station

- Status: Accepted
- Date: 2026-10-24
- Extends: ADR-056 and ADR-066

## Context

ADR-056 made a withdrawal a stated fact: a reservoir past the publication
window is absent from `reservoirs` and named in `withdrawn`, in a notice with
a name, a date, an age, a source label and a reason. ADR-066 then keyed every
roster file by station, because a name is not an identity.

The notice was left behind. `carry_withdrawals` decides whether a previous
notice still needs stating, and the orchestrator hands it `answered`, the
names this run published or withdrew, and `roster`, the committed names. Both
are names.

The roster holds two "Lost Creek" (14335040:OR:BOR from AWDB, and 544 from
RISE) and two "Clear Lake" (11470001:CA:BOR and 14097310:OR:BOR, both AWDB).
Oregon's Lost Creek is withdrawn. A `--source rise` run publishes Utah's Lost
Creek, "Lost Creek" lands in `answered`, and Oregon's notice is dropped. The
reservoir is still on the roster and still without a reading, and the payload
no longer says so. That is the silence ADR-056 exists to prevent, produced by
the key ADR-066 retired.

## Decision

**A withdrawal notice carries `source_station_id`.** It is the same string the
roster and the reservoir records already use. A station id names a reservoir
and is not a measurement, so ADR-056's rule stands: the notice has no storage,
percentage or baseline, and the validator still rejects one that does. The
fixed field list becomes name, station, date, age, source label and reason.

**`carry_withdrawals` matches by station.** `answered` and `roster` are sets
of station ids. A reservoir answers for its own notice and no other, whatever
its name or feed.

**A notice from an older payload has no station id, and is not dropped for
lacking one.** For that notice only, the function falls back to the previous
rule: its name against `answered_names` and `roster_names`. The fallback ends
by itself. The first full run after this change writes a station id on every
notice it states, so the next payload carries none without one. The fallback
code can then be removed.

**The reservoir page resolves a withdrawn link by station first, then name.**
A name that matches more than one notice is ambiguous and the page says it
does not know the reservoir, as it already does for holds (ADR-115).

**The schema version does not move.** `source_station_id` is an optional
addition to an entry of an optional array. The runtime validator accepts a
notice with or without it, and a consumer that ignores the field reads the
file as before. ADR-115 made the same choice for `reviewed_holds`. A bump is
how a consumer is told that something it already reads has changed shape, and
nothing has.

**The lake payload is not changed.** `withdrawal_notice` adds the station only
when the reservoir payload asks. A lake notice keeps the field list ADR-118
fixed, and its validator still refuses an extra field. Lakes are carried by
station already, and their names are unique.

## Rejected alternatives

- **Name plus source label.** It separates Utah's Lost Creek (RISE) from
  Oregon's (AWDB). It does not separate the two Clear Lakes, which are both
  AWDB, and the next collision inside one feed is silent again.
- **Qualify the names.** ADR-066 rejected this for the same reason: the name
  would still be doing the job of identity.
- **Drop a notice that has no station id.** It is the cheapest transition and
  the exact silence ADR-056 forbids, on the first run after the change.
- **Bump the schema version.** The field is optional, the validator accepts
  both shapes, and no existing reader changes meaning.
- **Add the station to lake notices as well.** Nothing there is ambiguous
  today, and it would reopen a contract ADR-118 fixed.

## Consequences

- A withdrawal survives a partial refresh when a same-named reservoir from
  another source, or the same one, publishes.
- Until the next daily refresh writes the field, the committed
  `reservoirs.json` holds notices without it. The pipeline and the validator
  both handle that.
- During the transition a legacy notice can still be answered by a same-named
  reservoir. That is the old behaviour and lasts one run.
- `data.html` documents the station in the `withdrawn` entry.
