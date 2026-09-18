# ADR-117: Close the scope at version 1.0.0

- Status: Accepted
- Date: 2026-09-18
- Relates to: ADR-001 (the build step), ADR-002 (the data commit is the deploy)

## Context

The repository has run in production for weeks with no version number on it.
There is no tag, `package.json` has said `0.1.0` since the build step landed
under ADR-001, and `CHANGELOG.md` is a single `[Unreleased]` section holding
the entire history of the modernization. Nothing published anywhere names a
version, so there is no way for a reader, a link, an issue or a future record
to say *which* dashboard it means.

That is not the same problem as "is it finished". The work listed as remaining
in [`docs/README.md`](../README.md) and in the project README is real, and one
item on it — the human visual review of every page and viewport — is the only
one anybody has ever called a release blocker. The ArcGIS canvas is blank in
headless Chromium, so colour balance, terrain, density and visual hierarchy
have no automated evidence at all, and a person has to look. Every other open
item is a source question, a vendor re-check or a deferred decision, and none
of them changes what the site is.

The absence of a version has a second cost that is easy to miss. Without one,
every conversation about the project has to be about what to add next, because
there is no statement of what it already is. The roster is 404 reservoirs
across 11 states from nine providers, with mountain snow, weekly drought,
upstream sets, four area sizes, an accessibility gate and a documented public
data API. Measured against anything else published in the West, that is not an
unfinished product waiting on its next feature.

## Decision

**This is version 1.0.0, and the geographic scope is closed at it.**

Three parts, and they are separable.

**A version number names the application and its published contracts.** It
covers the pages, the URL state a saved link carries, and the shape of the
payloads at `/api/`. It does *not* cover the daily numbers — those change every
morning without a version moving, which is ADR-002 — and it does not cover the
two version fields that already exist and answer narrower questions:
`schema_version` on each payload, and `METHOD_VERSION` on the seasonal
estimator. Three numbers that move for three different reasons stay three
numbers. Semantic Versioning applies to the first one only.

**`CHANGELOG.md`'s accumulated `[Unreleased]` section becomes `[1.0.0]`,
dated, and is not rewritten.** It is the record of what shipped, written on the
days it shipped. Regrouping it into a tidier release narrative would be editing
history to look like a plan, which is the same thing ADR bodies are protected
from.

**The scope is closed: further work on this project is content and
maintenance, not new geographic analysis.** Concretely, the following are out
of scope at this version, and each needs its own record to come back in:
a new measured domain (streamflow, groundwater, evapotranspiration — see
[`STREAMFLOW-SCOPING.md`](../STREAMFLOW-SCOPING.md), which recommends nothing
be built), a new rollup axis, a new page that computes something, and a broad
roster expansion pursued for its own sake. What remains in scope is the
maintenance the site already does — the daily refresh, a provider that breaks,
a reviewed source question, a vendor accessibility re-check — and **context**:
words and photographs that say what the measurements mean on the ground.

Closing the scope is not a claim that the remaining list is empty. The items in
`docs/README.md` stay exactly where they are, worked when they are worth
working. What closes is the assumption that the next thing this project needs
is another analytical surface.

**The tag is cut by a person, not by a job.** A release tag asserts that
someone looked at the site, and the one blocker is a visual review no machine
can perform. Automating the tag would make the assertion false on the first run.

## Consequences

`package.json` and the lockfile carry `1.0.0`. Nothing in the application
displays a version, and this record does not add one: a version in the
navigation would be a fourth number in front of readers who have no use for it,
and the site already tells them the thing they do need, which is the date each
measurement was taken.

The `[Unreleased]` heading is now empty and is where the next entry goes. A
change to the published pages or the payload contract moves the minor or major
number; a morning's data does not move anything.

Post-1.0 work has a shape it can be checked against. "Is this content or is it
scope?" is a question with an answer, and a proposal that fails it is not
refused — it is asked for a record.

## Rejected alternatives

- **Tag `0.1.0` or `0.9.0` and keep the pre-1.0 posture.** A leading zero says
  the contracts may break without warning. These contracts have not broken in
  months: retired routes still resolve, `?reservoir=` still resolves, and
  ADR-044 makes the view envelope a promise to saved links. Publishing a
  documented public API (`data.html`) and then labelling it unstable would be
  the dishonest half of both options.
- **Wait for the visual review, then tag.** This is the position the project has
  held since 2026-08-29, and the review has not happened in the weeks since.
  The review is worth doing and it is not a change to the code; holding the
  version number hostage to it has produced no review and no version. If the
  review finds work, that work is 1.0.1 or 1.1.0, which is what those numbers
  are for.
- **Close the changelog into several dated releases reconstructed from git.**
  The dates are recoverable and the groupings are not. Every reconstruction
  would be a judgement made now about what belonged together then, presented as
  a record written at the time.
- **Leave the scope open and just tag.** The tag alone answers "which
  dashboard" and leaves "what is this project for now" open, which is the
  question that has actually been costing time. A version with no scope
  statement would be re-litigated at the next good idea.
- **Declare the project finished.** It is not, and saying so would misdescribe
  a site that rewrites its own payload every morning and maintains issues when
  a feed goes quiet. Closed scope is not closed repository.
