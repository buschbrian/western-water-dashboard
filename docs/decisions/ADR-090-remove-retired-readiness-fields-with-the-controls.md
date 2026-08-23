# ADR-090: Remove retired readiness fields with their controls

## Status

Accepted

## Date

2026-08-23

## Context

ADR-087 removed the Utah reservoir-scope control and URL state, but retained
the browser-test readiness field `geography` as a constant `connected` value.
That field is not part of the public data or URL contract. It exists only for
this repository's browser tests, and after the control disappeared it reported
no state that could change or fail independently.

Keeping a constant compatibility signal would preserve dead client code and
make a later test appear to verify a control that no longer exists.

## Decision

Remove the `geography` readiness field together with the retired control.
Browser tests assert that the control is absent and verify the remaining place
and dominant-reservoir choices through their own live signals.

Readiness fields are internal verification seams, not append-only public API.
A field whose product behavior is removed may be removed with it.

## Alternatives considered

**Keep reporting `connected`.** Rejected because a constant cannot detect a
regression and is dead client state.

**Move the field to test-only code.** Rejected because it would still pretend
there is a geography dimension to observe.

## Consequences

The runtime, type declaration, and browser suite lose one obsolete field. This
does not change payloads, URLs, or any reader-visible behavior.

## Related

- Supersedes only ADR-087's browser-readiness compatibility clause.
