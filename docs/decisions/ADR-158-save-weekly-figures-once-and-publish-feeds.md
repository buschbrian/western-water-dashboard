# ADR-158: Save weekly figures once and publish feeds

- Status: Accepted; implementation local, not released
- Date: 2026-11-11
- Extends: ADR-074, ADR-149, ADR-154

## Context

Item 8 of Brian's November product-review plan requests a frozen weekly
digest, Atom and JSON feeds, a picture and a caption. The storage charts
already compute the digest through `weeklySummary`, `weeklyScopeText` and
`describeWeek`. Recomputing an older post during each build would silently
replace evidence about one week with today's observations or wording.

## Decision

`data/weekly-digest.json` is an append-only ledger. A week starts Monday in
America/Denver. A capture saves the existing models' figures and sentences,
their scope, reading dates, late-data notes and sources, the publication
timestamp, a caption and picture-frame content. One entry per week, in order.
A rerun in the same week changes no bytes; a later provider revision or model
change does not rewrite a saved entry. Missing snow or drought is explicitly
unavailable, never zero. Storage always describes the whole published West
with Powell and Mead included, independent of a browser's saved place.

`scripts/build-weekly-digest.mjs` uses the installed Vite 8.3.5
`ssrLoadModule` API to run the TypeScript models. This was verified against
the shipped declarations and a real capture. Middleware mode has watching,
HMR and WebSocket serving disabled; the runner closes in `finally`. No new
dependency and no language model enter the data pipeline. The ledger is
written atomically and an unreadable existing ledger is refused.

A separate Monday Actions job installs the locked build tools, captures the
entry and commits only the ledger. It shares the refresh workflow's
concurrency group, has only contents-write permission, and rebases before
pushing. The Pages workflow explicitly chains off its successful completion,
as it already does for daily data commits made with `GITHUB_TOKEN`.

The build reads the frozen ledger and emits `feed.xml` (Atom), `feed.json`
(JSON Feed 1.1), `weekly.html` and a permanent
`share/weekly-YYYY-MM-DD.html` for each week. Feed item IDs are the permanent
page addresses and timestamps are the saved publication time. Feeds contain
the latest 52 entries; the ledger and older pages remain. Rendering does not
recompute historical figures. The feed formats follow
[RFC 4287](https://www.rfc-editor.org/rfc/rfc4287) and
[JSON Feed 1.1](https://www.jsonfeed.org/version/1.1/).

Each page supplies a labelled, selectable caption and picture download.
The picture uses the existing share-frame renderer and bounded capture pool,
with a figure-free fallback. Weekly captures are first in the pool, newest
first, so an older reservoir capture cannot consume their time budget.
Main data pages advertise both feeds; the data reference links the archive.
The site sends nothing to a social platform.

## Alternatives

- Rebuild older summaries from live data: rejected because both readings and
  wording can change, while a saved weekly entry must stay evidence.
- Add a TypeScript loader dependency: rejected because the installed build
  tool already executes the actual extensionless model imports correctly.
- Publish through an automated social account: outside Brian's selected
  scope. The feed, picture and caption are the deliverables.

## Consequences

The first entry is a manual capture in the current week; no missed earlier
weeks are fabricated. A source correction remains visible on the live site
and later digests, not as an unannounced edit to an earlier entry. Tests hold
the ledger's append-only behavior, Mountain Time week boundary, original
reading notes, feed identities, escaping and 52-entry window. Browser checks
parse both feeds, inspect the caption and picture, and run accessibility at
1280, 390, 360 and 320 pixels. This is a generated static surface; none of the
ledger is bundled into the application's JavaScript.
