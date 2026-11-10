# ADR-154: Keep a permanent share address for every reservoir

- Status: Accepted
- Date: 2026-11-10
- Supersedes: ADR-141's two-page limit and capture policy; retains its reviewed-level frame
- Relates to: ADR-002 (runtime data), ADR-056 (withdrawal), ADR-066 (station
  identity), ADR-083 (monthly comparison window), ADR-135 (reviewed datum)

## Context

The November product review plan authorizes a share frame and permanent
share page for every published reservoir, plus state, region and West cards.
ADR-141 limited frames to reviewed levels and kept two static share pages.
Its objection to generating pages from the current roster remains valid:
removing a reservoir must not delete its shared URL.

Most reservoirs already have the storage figures and twelve monthly points
needed for a useful frame. No new estimator or source is needed. On system
Chrome on 2026-11-10, four capture workers saved all 425 active frames from
428 addresses in 136.8 seconds, without a failed capture. Three addresses
represented withdrawal or hold notices and needed no measured picture.

## Decision

1. A reservoir without a usable reviewed-level chart gets a storage frame at
   1200 by 630. It carries the name, dated storage, percent full with its
   basis, comparison with normal with its actual period and sample years,
   monthly trend, late-data note and provider. Missing months remain gaps.
   A missing normal is stated; an existing period substitution is named;
   a normal that draws on part of its period says so, as the page does.
2. Keep the reviewed-level frame for reservoirs that have it. Storage makes
   no claim about a surface level. The readiness field `share` identifies
   `level`, `storage` or `none`; storage never reports elevation as drawn.
3. `data/share-ledger.json` is an append-only list of station identifier,
   first name and permanent slug. `tools/build_share_ledger.py` appends after
   each daily refresh; the generated-files registry stages it with the data.
   Entries are never renamed or removed. New slugs combine the first name
   with a station hash; Powell and Mead retain their existing slugs. Names
   are labels, never identity. Invalid or duplicate entries are refused.
4. The build generates a static preview page and fallback picture for every
   ledger entry. Current pages use today's label and redirect to
   `reservoir.html?name=STATION`. An absent station keeps its static notice,
   without a redirect or current figure. Static descriptions carry no water
   measurement. Its picture is a generic, figure-free fallback, never an old
   captured measurement. No address is reassigned.
5. The same generator creates eleven state, five region and West storage
   cards using the charts page's membership and combined-storage model.
   They include Powell and Mead where they belong, and state reading dates,
   late counts, the normal period and comparison coverage, differing full
   levels and the source. Scope cards link to that view on the charts page.
6. The build writes a capture list and a compact public address ledger beside
   the pages. Reservoir Copy link and native Share prepare their preview URL
   without delaying figures. They use the current page if it is unavailable;
   native Share keeps the browser's click activation.
7. Capture uses four workers against installed Chrome, with a five-minute
   pool budget that closes the browser and stops scheduling. No browser is
   downloaded. A capture replaces a fallback only after the frame fits and
   the result is a valid 1200 by 630 PNG. Failed captures keep the generic
   fallback and never block the daily data deploy. A missing or malformed
   final image still fails. The report separates notice pages from failed
   captures. Pictures are build output, never daily binary commits.

## Alternatives

- **Generate from only the current roster.** Rejected: withdrawal deletes a
  shared address, the failure ADR-141 already identified.
- **Use a reservoir name as identity.** Rejected: names change and repeat.
- **Commit hundreds of named fallback pictures.** Rejected: one generic,
  figure-free picture works for every address without binary history growth.
- **Draw all measured cards separately at build time.** Not needed: measured
  browser capture fits the budget and reuses the reservoir page's own chart.
- **Publish a surface level without a reviewed datum, or change the storage
  payload for a card.** Rejected: existing figures suffice and ADR-135 holds.

## Consequences

Every ledger address survives a rename, withdrawal or removal. A failed
ledger update preserves the previous ledger; a newly added station waits for
its permanent entry before receiving a preview. Static descriptions stay
correct when capture fails. Social platforms may retain an older cached
picture; its reading date remains visible. The daily capture adds roughly
2.3 minutes on the measured Mac; CI timing is not yet measured.

The implementation is local pending Brian's code review and publication.
The full-roster capture is evidence about the measured build, not a promise
that every future capture succeeds.
