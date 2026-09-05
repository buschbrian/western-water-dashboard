# ADR-115: State a reviewed hold where the reservoir used to be

- Status: Accepted
- Date: 2026-09-04
- Extends: ADR-056
- Qualifies: ADR-020

## Context

ADR-113 took Leroy Anderson off the roster. ADR-020 promises that every
published reservoir is reachable, and Anderson had been reachable for weeks at
`reservoir.html?name=LRA` -- a permanent link, the kind a person bookmarks or
sends. After ADR-113 that link landed on "No reservoir by that name", which is
false: there is a reservoir by that name, and this site chose not to publish
it. The review of the change found the gap.

ADR-056 already solves this for one kind of absence. A feed that stops is
withdrawn, and the payload states the withdrawal in a notice that is
deliberately not a record -- name, last reading date, age, publisher, reason,
and nothing a rollup could add up. That notice is derived from the data's age
on every run and reverses itself the morning the feed resumes.

A reviewed hold is a different fault and needs a different statement. The
feed is healthy; Anderson's readings arrive every day. The judgement is a
person's, recorded in the admission file, and it does not reverse on its own.
Reusing the withdrawal array would have told a reader that a feed had gone
quiet, which is not what happened, and `carry_withdrawals` would have dropped
the notice on the next partial refresh because no source ever re-derives it.

## Decision

**A reviewed hold is stated in the payload, beside the withdrawals and not
among them.**

The admission file carries `publication_holds`, keyed by station like
everything else in it (ADR-066). A hold is exactly four fields: the name, the
reason in a reader's words, an HTTPS source, and the review date. The loader
refuses a hold that names a station still in `reservoirs` or absent from
`withheld`, and refuses any fifth field. The refusal of extra fields is
ADR-056's rule for the same reason: a hold carrying a storage figure would be
publishing the figure in a quieter shape.

The refresh publishes them as `reviewed_holds`, each notice stamped with its
`source_key` and `source_station_id`. The runtime validator refuses a notice
with an extra field, a duplicate identity, a non-HTTPS source, or one naming
a reservoir that is also in `reservoirs`. `--rebuild-notices` rewrites the
array from the admission files without touching a reading, the way
`--rebuild-points` handles a coordinate (ADR-108), and refuses to run while a
held reservoir is still published -- the source refresh comes first.

**The one-reservoir page lands on the notice.** A link by station id or by
name resolves against the holds before the withdrawals, and the page says the
reservoir's name, that it is not in the current published data, the reason,
the review date, and a link to the source. It publishes no measurement.
Readiness reports `held`, the fifth state after found, withdrawn, unknown and
none, and the browser suite visits it.

**The reason is written for a reader** (ADR-006). The withheld text in the
admission file is the reviewer's evidence, with figures and citations, and
stays that way. The public notice is the same fact in plain sentences, and the
visible-language rules apply to it.

**The schema version does not move.** `reviewed_holds` is optional and
additive, as every field added to this payload has been. A bump is how a
consumer is told that something it already reads has changed shape.

## Consequences

Anderson's permanent link explains itself. The next reviewed hold under
ADR-113 is a roster edit and `--rebuild-notices`, not a second mechanism.

The review that found the gap also asked whether a healthy series with an
unresolved denominator should one day publish as a typed measurement-only
water, distinct from ADR-112's terminal lakes. That remains open; the notice
is the honest answer until it is decided.

## Rejected alternatives

- **Put the hold in ADR-056's `withdrawn` array.** Its notice carries a
  reading date and an age that a hold does not have, a reader could not tell
  the two faults apart, and a partial refresh would drop it.
- **Let the page say the name is unknown.** It is not unknown. A permanent
  link that lies about why it is empty is worse than one that is empty.
- **Keep publishing the reservoir's storage in acre-feet with no percentage.**
  ADR-113 rejected this because every surface here is built around a
  percentage and a reservoir that silently omits one reads as a fault.
- **Reuse the reviewer's withheld text as the public reason.** It names
  figures, and the whole point of withholding is that none of those figures
  is a full level this site stands behind. A reader should be told that the
  sources disagree, not handed the disagreement to adjudicate.
- **Bump the schema version.** Considered because a new top-level array is
  visible; rejected because it is optional and every consumer that ignores it
  reads the file exactly as before.
