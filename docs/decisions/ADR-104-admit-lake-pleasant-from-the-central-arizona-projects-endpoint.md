# ADR-104: Admit Lake Pleasant from the Central Arizona Project's endpoint

- Status: Accepted
- Date: 2026-08-29

## Context

Lake Pleasant, behind New Waddell Dam, is the Central Arizona Project's
storage reservoir and the largest reservoir in Arizona with no feed on this
site: about 812,000 acre-feet of normal storage, operated by CAP rather than
Reclamation, and absent from every provider surveyed. With the Salt River
chain, the Verde pair and Lake Mead already published, it was the state's one
remaining gap of consequence.

CAP's public Lake Pleasant page fills its graphic from a JSON endpoint,
`…/api/opslakepleasant`, which answers a bare unauthenticated GET with the
present elevation, volume in acre-feet, surface area, percent of the
1,702-foot maximum and a record time in Arizona's clock. Read live on
2026-08-29: 421,560 acre-feet at 21:16.

Three properties of that endpoint are unlike any provider on the roster:

1. **It holds no history.** No route addresses a record by date or id;
   every query returns the current record. The Salt River Project, the
   nearest precedent (ADR-100), offered three years.
2. **It has no station identifier.** ADR-066 keys every reservoir by the
   provider's own id; here there is one reservoir and one URL, and the
   `RecordID` field is a row counter.
3. **Its full level is a percentage, not a figure.** `LP_PercentFull` is
   measured against the 1,702-foot maximum pool, which back-computes to
   about 891,840 acre-feet; the dam inventory records 811,784 normal and
   1,063,163 maximum for New Waddell Dam (AZ82929). CAP publishes the
   percentage and never the acre-foot figure.

## Decision

**Admit Lake Pleasant as the ninth provider**, `SourceKey` `cap`, visible
name "Central Arizona Project".

**The series begins on the day of admission and grows in the dense-history
cache.** Each morning's reading is merged into `data/reservoir-source-history.json`
under `cap:opslakepleasant`, the mechanism ADR-100 gave the Salt River
Project, without a history request because there is none to make. The
seasonal rank and the standard-period normal will read "not available" until
the cache holds the years they need; a reader gets today's storage and
percent of full, which is what the operator publishes.

**The roster is keyed by the endpoint path** and pins the URL beside it; the
loader refuses a URL not named for its key, and the adapter refuses a record
missing any of the four pinned fields, so a changed service fails loudly
rather than publishing a different number under the same name.

**The denominator is the dam inventory's normal storage** (ADR-003,
ADR-072). ADR-070 prefers an operator's own full level *where it publishes
one in acre-feet*; a percentage of an elevation is not that figure, and
inventing the acre-foot number from it would be this project stating a full
level the operator did not. The roster entry records the 891,840 figure as a
reviewed finding, so a reader comparing this site's percent of full with
CAP's knows why they differ.

## Rejected alternatives

- **Wait for a history route.** None is documented and none was found;
  every day waited is a day the series does not hold.
- **Divide by CAP's implied 891,840.** It is a derivation, not a published
  figure, and it exceeds the inventory's normal storage; ADR-072's rule
  against dividing by a figure the water has been seen above cannot be
  checked against a series one day long.
- **Read the figure from the page instead of the endpoint.** The page is
  an iframe that reads the same endpoint; the endpoint is the source.

## Consequences

- Arizona's roster gains its largest missing reservoir, at a percent of full
  the inventory's normal storage defines, with a finding beside it.
- `data/reservoir-source-history.json` gains one series that only ever
  grows by one reading a day.
- Terms of use for the endpoint are not published; the pipeline makes one
  request a day to a service the operator's own public page makes one
  request per visitor to. A refusal from the service withdraws the record
  through the ordinary freshness path (ADR-056).
- ADR-066 is narrowed for this one provider: the endpoint is the identity
  because the operator offers no other.
