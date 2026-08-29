# ADR-100: A sub-daily provider's day is its last reading

- Status: Accepted
- Date: 2026-08-29

## Context

Every provider admitted before 2026-08-29 published at most one storage value
a day, and several published one a month. The estimator behind every derived
figure -- the weekly comparison, the history rank, the changes over 7, 30 and
365 days -- reads one value per date, and until now no code had to choose
which value that was, because the provider had already chosen.

Two providers admitted the same day publish far more often. The Salt River
Project publishes every five minutes; Montana's Stream and Gage Explorer
publishes roughly every quarter hour. A day from either is 96 to 288
observations, and something has to reduce them to the one value per date the
estimator reads.

That choice was made in a docstring and never written down as a decision, and
the code did not implement what the docstring said. It sorted the readings by
their calendar day, which gives every reading in a day the same sort key, and
then kept the last row -- but the sort is not stable, so "last" was whichever
reading the sort happened to leave there. An 08:10 reading was published as a
day's storage. 4,348 of 4,388 committed daily values were affected, by up to
10,206 acre-feet, and one reservoir's history rank read 66.7 where the correct
series reads 100.0.

## Decision

**A sub-daily provider's value for a date is its last observation on that
date.** Not a mean, not a midnight reading, not the day's highest.

The reduction sorts on the observation timestamp, never on the calendar day
the timestamp falls in. Where two observations carry the same timestamp, the
order the provider sent them decides, so the reduction is a function of the
response and not of the sort implementation.

A daily provider is unaffected: it publishes one row per date, so the rule
returns what it already published, and nothing reduces it.

## Rejected alternatives

- **The day's mean.** A mean is a different statistic from an observation, and
  the series it would join is made of observations. Every figure downstream --
  a change over 30 days, a rank against prior years -- would then compare a
  derived number with a measured one and call both storage.
- **The reading nearest midnight.** It sounds like the same thing and is not:
  it selects across a gap, so a provider that stops publishing at 20:00 gets
  yesterday's late reading rather than today's last, and the day silently
  borrows a value from the day before.
- **The day's highest.** It answers a different question, and would make a
  reservoir look fuller than any daily provider's reservoir is allowed to.

## Consequences

The published day for these two providers is an observation a reader can go
and find in the provider's own record, with a timestamp, which is the same
thing every daily provider's value already is.

The committed daily history keeps one representative per date under this rule,
so the rule has to hold in two places: where readings are reduced, and where a
refetched day replaces a cached one. Both are sorted stably for that reason,
and the fetch wins on overlap so a provider's own revision can reach a reader.

This is not a method change and carries no `METHOD_VERSION` bump. The method
is what it always said it was; the code now does it. The corrected values are
recorded in the changelog because they are published numbers that moved.
