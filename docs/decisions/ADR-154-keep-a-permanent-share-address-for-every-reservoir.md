# ADR-154: Keep a permanent share address for every reservoir

- Status: Proposed; the storage frame (decisions 1 and 2) is implemented locally
- Date: 2026-11-09
- Would amend: ADR-141 (two share pages and a reviewed-level-only frame)
- Relates to: ADR-002 (runtime data), ADR-056 (withdrawal), ADR-066 (station
  identity), ADR-083 (monthly comparison window), ADR-135 (reviewed datum)

## Context

The November product review plan authorizes a share frame and a permanent
share page for every published reservoir. ADR-141 currently limits frames to
reviewed levels and keeps only two static share pages. Its objection to
generated pages remains valid: removing a reservoir must not delete its URL.

Most reservoirs already have the storage figures and twelve monthly points
needed for a useful frame. A new estimator or a new source is unnecessary.
The deploy cost of capturing every reservoir has not been measured.

## Proposed decision

1. A reservoir without a usable reviewed-level chart gets a storage frame at
   1200 by 630. It carries the name, dated storage, percent full with its
   basis, comparison with normal with its actual period and sample years,
   monthly trend, late-data note and provider. Missing months remain gaps.
   A missing normal is stated; an existing period substitution is named;
   a normal that draws on part of its period says so, as the page does.
2. Keep the reviewed-level frame for reservoirs that have it. A storage frame
   makes no claim about a surface level and requires no elevation-history
   request. The existing two share addresses continue to work.
3. A ledger keyed by `source_station_id` assigns a permanent share address
   once. The daily pipeline appends entries, and the generated-files registry
   names its writer. A rename changes the label, not the address.
4. The deploy generates a page for every ledger entry, including withdrawn
   reservoirs. A withdrawn page carries its withdrawal notice and no current
   figure. Its address is never silently reassigned to another station.
5. Capture failures keep valid fallbacks and never prevent daily data from
   being published. Measure the full roster's capture time before choosing
   concurrency and a run budget. Deterministic build-time drawing remains an
   alternative if a browser cannot meet that budget.

Whether static descriptions carry a dated figure, the ledger's file shape,
fallback generation and capture budget remain open before acceptance.

## Alternatives

- **Generate pages from only the current roster.** Rejected: a withdrawal
  deletes a shared address, the failure ADR-141 already identified.
- **Use reservoir names as identity.** Rejected: names change and can repeat
  across states; ADR-066 supplies the existing station identity.
- **Publish a surface level without a reviewed datum.** Rejected: storage
  already supports the frame, and ADR-135's datum gate still applies.
- **Change the daily storage payload for the card.** Rejected: the page's
  existing figures and monthly points are sufficient.

## Implementation status

The first local slice is `src/reservoir-storage-share-model.ts` and its
tests. It reuses the reservoir page's pure builders.

The second local slice draws the frame: the share view of a reservoir with
no level chart shows the storage frame and asks for no level history. The
readiness field `share` names the frame on the page. The capture script and
the deploy are unchanged, so the two published pictures and the two share
addresses are as ADR-141 left them. Decisions 3 to 5 are not started.
