# ADR-173: Keep a month-end record on time when its fetch fails

- Status: Proposed
- Date: 2026-11-17
- Extends: ADR-056 (freshness and withdrawal)

## Context

`carry_forward` marked every carried record late (`is_stale: true`) whatever
its age. On 2026-11-16 the Natural Resources Conservation Service data service
answered every request with 502 Bad Gateway. All 168 of its reservoirs were
carried forward, so the 79 month-end reservoirs showed as late although their
October reading (2026-10-31, 16 days old) was on time against their own
45-day limit. A successful fetch that morning would have returned the same
reading and called it on time. Snow, precipitation and soil moisture kept
their last files the same morning; no code change caused the failure.

## Decision

A carried record whose `data_frequency` is `monthly` is late only when
`days_stale > stale_after_days`, the rule a successful fetch applies.
`fetch_ok: false` and `fetch_error` still record the failure, and the
stale-feed issue still opens on it. A daily record that is carried forward is
late at once, as before.

## Rejected

- **The age rule for every carried record.** A daily feed's failed request is
  a lost reading: today's figure exists and was not read. Keeping it on time
  for two days would hide the failure from the map.
- **Changing nothing.** The map would mark a correct reading late on any
  morning the service is down, which is what a reader saw on 2026-11-17.

## Consequences

Month-end reservoirs and the monthly terminal lake stay on time through a
short outage of their source. No figure, threshold or schema field changes,
so neither `METHOD_VERSION` nor `schema_version` moves.
