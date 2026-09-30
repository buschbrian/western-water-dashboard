# ADR-120: Ask where to start before loading the map

## Status

Accepted

## Date

2026-09-29

## Context

The storage map asks a first-time reader where to start (ADR-086). It asks
only when the query string is empty, no place is stored and the question was
not dismissed before. The dialog needs only two payloads: `reference.json`
for the places it offers and `reservoirs.json` for the states that hold a
reservoir. Every answer except "not now" goes to a new URL.

Even so, the page opened the dialog last. Boot fetched the reservoir payload,
the map SDK and the place rosters together. It then built the map, drew the
drainage areas and wired the level control, and only after all that opened
the question. `./ui/map` and `./arcgis/basemaps` were static imports, so
`modern.html`'s static entry path held about 2 MiB of gzip, most of it
`@arcgis/core`. The browser downloaded and ran all of it before the dialog
could open.

A mobile Lighthouse run against production measured the cost. The largest
paint was the dialog heading `h2#splash-heading` at 15.1 s, of which 95% was
render delay. Total blocking time was 7.8 s and the page made 625 requests.
Most of that work was a map the reader's answer then left behind.

## Decision

**When the first-visit question will be asked, ask it before the map SDK is
fetched. Start the map only when the dialog closes without a choice.**

- Whether to ask is decided at the start of boot, from the same inputs as
  before: `resolveOpeningPlace` (address bar, then stored place), the
  dismissal key and the raw query string, through `shouldAskWhere`. The rule
  for *when* the question appears is unchanged (ADR-086, `scopes.md`).
- When the question is asked, boot loads the reservoir payload and the place
  rosters, then builds and opens the chooser. It waits on the dialog's
  `close` event and then starts the map. A choice navigates away, and no map
  is built for the page being left.
- When the question is not asked (a link, a stored place, a previous
  dismissal), data, map and rosters load together as before.
- `./ui/map` and `./arcgis/basemaps` are dynamic imports behind one
  `startMap()`. It installs the anonymous-credential policy (ADR-004)
  immediately before `loadMap`, which is still before any SDK request.
- The chooser is built once. The later boot step skips it when the
  first-visit path already built it and wired the header actions.

The wait on the dialog has no deadline, on purpose. It is the reader's
answer, not a network request, and the modal dialog is the only usable
control while it is open. `#map-host` stays `aria-busy` through the wait,
which is true because the map has not started. `loadMap` clears it on every
exit, as before.

## Alternatives considered

**Keep loading the map behind the dialog.** This was the previous behaviour.
A reader who closes the dialog finds the map further along, and the SDK is
already in the HTTP cache for the page a choice navigates to. Rejected: every
first visit pays seconds of main-thread work before it can see the question,
most readers answer it and leave the page, and the question's whole design
(ADR-086, the counts deferred in `opening-splash.ts`) is that it must not
arrive late.

**Open the dialog early but keep loading the map in the background.** This
would open the dialog early but keep the blocking time. The SDK's
evaluation competes with the dialog for the main thread on the phones this
measured. Rejected for the same reason as above.

**Merge the SDK's many small chunks instead.** About 585 of the storage map's
requests are chunks of about 1 KB each. Rolldown `codeSplitting` groups were
measured with `entriesAware`, `minSize` and one group per SDK directory. Each
either pulled `@arcgis/core` and the charts into the static entry path (from
180 KiB to between 2.2 and 4.2 MiB of gzip) or grew the map import from
958 KiB to 4.4 MiB. A group cannot tell static modules from lazily loaded
ones, and this decision depends on that difference. Rejected for now; this is
a bundling question, not an opening one.

**Open the dialog on `reference.json` alone, as the other pages do.** This
would open about 280 KB of gzip earlier. Rejected here because the storage
map's state list includes states from the reservoir payload, and dropping
them changes which places are offered. That is its own decision.

## Consequences

- On a fresh profile at the bare URL, the storage map does not report
  `window.__dashboardReady` until the question is closed. A readiness field
  still reports one fact (ADR-090): the map drew what it drew. It is just not
  written while there is no map.
- Every harness that opens the bare URL in a fresh profile and waits for
  readiness now pre-marks the question as dismissed. It does this the same
  way `smoke-modern.mjs`'s `newPageContext` already did:
  - six further contexts in `tests/smoke-modern.mjs` (first basemap refused,
    all basemaps refused, the shared-link case, data refused or never
    answering, the level cases, and Simplified Technical English)
  - `tests/hosted-outage.mjs`
  - `tools/audit-transfer.mjs`
  - `tools/profile-symbols.mjs`

  A harness written later that forgets this waits forever on a dialog nobody
  answers.
- A smoke case proves that no `arcgis-map` element or definition exists while
  the question is open. It also proves that Escape reaches full readiness,
  with one chooser and a cleared `aria-busy`.
- The static entry path of `modern.html` falls from about 2 MiB to 0.18 MiB
  of gzip, with no `@arcgis/core`. The SDK budget in
  `scripts/check-sdk-bundle.mjs` still measures it.
- A reader who closes the question waits for the map from that moment. A
  returning reader, a link or a stored place sees no change in order.
- With the question open, the storage map's preconnect hints to the ArcGIS
  hosts sit idle. They are there for every other visit.

## Related

- Extends ADR-086. The first-visit rule and the chooser are unchanged; only
  what loads before and behind it changes.
- Keeps ADR-004: the credential policy still precedes every SDK request.
- Keeps ADR-068's four scope questions separate. No scope, URL parameter or
  stored-place rule moves.
