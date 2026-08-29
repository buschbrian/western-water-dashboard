# ADR-101: Bound the basemap chain, and draw the data without it

- Status: Accepted
- Date: 2026-08-29

## Context

The storage map resolves its background through a chain of candidates, each
tried in turn until one loads and verifies (ADR-033 chose the first of them).
Every candidate has a deadline: ten seconds to load, ten more to verify. The
chain had none.

The chain is what a reader waits on. `loadMap` opens with
`await resolveBasemap(...)`, and the page's first paint sits behind
`Promise.all([loadData(), loadMap(), ...])`. So the wait a reader actually
serves is the sum of the chain, not one candidate's share of it: four
candidates for a light theme and five for a dark one, at up to twenty seconds
each, is eighty to a hundred seconds of "Loading reservoir data" — with that
reservoir data already fetched, validated and waiting behind a background
image it does not need.

This is why the failure reads as intermittent and as somebody else's fault. A
second visit finds the tiles cached and paints immediately, so the reader
learns that reloading fixes it. A cold cache, a slow connection, or a browser
where those endpoints answer less quickly is simply a longer wait, and the
reader stops waiting first.

## Decision

Give the chain a budget of fifteen seconds, spent across every candidate it
tries. A candidate may never be allowed more than its own deadline or more
than the chain has left, whichever is smaller, and a candidate whose load
overran the budget is not verified and not returned.

When the budget is spent, resolve with `resource: null` — the outcome this
module already had words for, which `loadMap` already handles and the browser
suite already exercises as "kept local data when every basemap was refused".
The map draws the reservoirs on a plain background, and the reader can pick a
background from the map's own gallery.

Per-candidate deadlines are unchanged.

## Rejected alternatives

- **Leave it.** The page is not slow; it is absent. A reader who reloads is
  telling us the first load failed, whatever the second one does.
- **Shorten each candidate's deadline instead.** It punishes a slow but
  working first candidate on a poor connection, which is the case most likely
  to want the fallback, and the deadlines still sum.
- **Drop candidates from the chain.** Each was added because a reader reached
  it; the length of the chain is not the defect, the absence of a ceiling is.
- **Do not gate the first paint on the background at all** — create the map,
  draw the data, and swap the background in when it resolves. This is the
  better end state and is not rejected on its merits. It changes when
  `basemap` and `basemapDegraded` become true, and the browser suite reads
  both at first paint, so it is a larger change than the one the defect
  requires. Deferred, not refused.

## Consequences

The longest a reader can wait for a background before seeing reservoirs is
fifteen seconds rather than a hundred. A reader on a bad connection may now
get no background where they would previously have got one after a minute of
blank page; that is the trade this record makes, and the gallery is the way
back.

Nothing changes on a healthy load, where the first candidate answers in well
under the budget and the chain never reaches its ceiling.

This pairs with the boot's new error boundary. Together they cover the two
ways the first load could end with a reader looking at a spinner: one where
the boot threw and said nothing, and one where nothing had gone wrong except
that the wait had no end.
