# ADR-116: Exclude a reviewed reading, and never repair one

- Status: Accepted
- Date: 2026-09-04
- Extends: ADR-056 and ADR-072's no-repair rule
- Qualifies: ADR-065's spike screen

## Context

`discrepancies` in `admission.py` holds a candidate out of the roster when its
series carries a reading the rest of the series cannot explain, and the comment
above `SPIKE_RATIO` says what the screen is not: *it is deliberately not a
correction. The reading is not replaced by a calmer one and the candidate is
not admitted on the strength of it.* Every repair available is a guess about
which source is wrong, so the screen reports and a person decides. That rule
has held since the California audit was written and it is right.

It has a cost, and four California reservoirs are paying it. Each has a healthy
feed, a confirmed identity and, in three of the four cases, a full level two
independent publishers agree about. What holds each of them out is one reading
— or, for Lake Havasu, two — and the readings are not close calls.

| station | stamp the service writes | value | next highest month | independent figure |
|---|---|---:|---:|---|
| `HVS` Lake Havasu | `2025-5-1 00:00` | 5,913,000 | 601,300 | 646,200 acre-feet, Bureau of Reclamation, Parker Dam |
| `HVS` Lake Havasu | `2024-11-1 00:00` | 5,775,421 | 601,300 | as above |
| `ONF` O'Neill Forebay | `2017-5-1 00:00` | 443,348 | 55,049 | 56,400 acre-feet, Bureau of Reclamation, O'Neill Dam and Forebay |
| `RLC` Railroad Canyon | `2026-2-1 00:00` | 58,508 | 16,626 | nearly 12,000 acre-feet, Elsinore Valley Municipal Water District |
| `GNT` Grant Lake | `2023-3-1 00:00` | 82,410 | 49,380 | 47,575 acre-feet, Los Angeles Department of Water and Power, against the dam inventory's 47,525 |

Havasu's two readings are about nine times a full lake. The forebay's is about
eight times a facility Reclamation describes separately from the reservoir
above it. Railroad Canyon's is almost five times what its operator says Canyon
Lake holds. Grant Lake's is 1.7 times a capacity two publishers agree on to
within fifty acre-feet. None of them is a wrong dam — a wrong dam is wrong in
every reading — and none is a flood a reservoir survived unremarked.

Each was written up and sent to the provider:
[#44](https://github.com/buschbrian/western-water-dashboard/issues/44),
[#45](https://github.com/buschbrian/western-water-dashboard/issues/45),
[#46](https://github.com/buschbrian/western-water-dashboard/issues/46) and
[#47](https://github.com/buschbrian/western-water-dashboard/issues/47). Each
issue says it may be closed when the service corrects or explains the record
**or** when this repository adopts a reviewed exclusion that keeps the raw
value and the reason. This record is that mechanism.

The distinction the no-repair rule is protecting is between two different acts.
A correction invents a number: it says the May 2017 forebay reading should have
been 44,335, or 54,335, or whatever a rule guesses from its neighbours, and
that number then divides, ranks and sums as though a gauge had produced it. An
exclusion invents nothing. It says one named reading cannot be true, states why
and against what, and leaves the series one reading shorter. The second is a
judgement a reviewer can check line by line; the first is arithmetic nobody can
audit after the fact.

## Decision

**A reviewed exclusion names one reading and removes it. Nothing is ever
repaired.**

An exclusion is committed in the provider's own admission file, keyed by
station like everything else in it (ADR-066), and it is exactly seven fields:
the provider's `sensor`, the reading's `stamp` as the provider writes it, the
raw `value` it carried, a `reason` in plain words, an HTTPS `source_url` for
the independent figure that makes the reading implausible, the `reviewed_on`
date, and the `issue_url` the provider is being asked on. `load_excluded_readings`
refuses an exclusion for a station the file does not know, a missing or extra
field, a sensor that is not the caller's, a non-HTTPS URL, a value that is not
a number, and a date that is not an ISO calendar date. **An exclusion that
carries a replacement value is refused**, which is ADR-056's refusal of a
measurement inside a withdrawal notice, made for the same reason: a figure that
does not belong in a shape is not made harmless by the shape being quiet.

**The raw value is part of the reading's identity.** An exclusion matches on
provider, station, sensor, day and value together. A reading the service later
corrects therefore carries a different value at the same stamp, no longer
matches, and flows through untouched — which is the outcome every one of the
four issues asks for, reached without anyone editing this repository on the
morning it happens.

**It is applied where readings are read, and nowhere else.**
`fetch_cdec_series` is the one place a value of this service is read
(`CDEC_MISSING_VALUE` is there for the same reason), so `excluded_reading` is
consulted in that loop. The refresh's console names every reading it dropped,
with its stamp, its value and its issue. A series filtered in two places has
two definitions of what it is.

**The audit screens the series the pipeline would publish.**
`tools/audit_cdec_stations.py` applies the same exclusions through the same
matcher, so `--json` shows the post-exclusion verdict — and it prints every
excluded reading and carries them into each candidate's evidence row, because a
verdict reached without a reading is only reviewable beside the reading it was
reached without.

**An exclusion is not an admission.** All four stations stay withheld. Removing
the reading answers the spike screen and nothing else; whether a reservoir joins
the roster is still a separate reviewed decision with its own evidence, taken
by a person after seeing what the screens say next.

**The issues stay open.** The exclusion records what this project decided to do
in the meantime; it does not answer the question put to the provider, and
closing the issue would say that it had.

**No method version moves.** `METHOD_VERSION` names the seasonal estimator, and
the estimator is unchanged: it computes exactly what it computed before, over a
series that no longer contains a reading this project can show is not a
measurement. Nothing published moves either, because all four stations are
withheld and none of their readings has ever been published.

## Consequences

The four issues can be closed by the provider on their merits rather than on
this project's need for them. Until then, the anomalies are documented in three
places that agree — the admission file, the issue and this record — and the raw
values survive in all of them.

`admitted_cdec_reservoirs.json` gains an `excluded_readings` block and its four
`withheld` notes gain a sentence saying which reading is excluded and what
still holds the station. The block is committed reviewed evidence like the
rosters around it, not generated, and the loader is what keeps it honest.

A future provider with its own confirmed anomaly reuses `load_excluded_readings`
by naming its own sensor. The other adapters are untouched, because none of
them has a reviewed case yet and a mechanism with no case is a rule nobody has
tested.

This is a mechanism that can be misused, and the guard against that is that
every exclusion is a committed diff carrying a reason, a citation, a date and
an open issue. A screen removed quietly is a screen turned off; an exclusion
that cannot be read by the next reviewer would be the same thing with more
steps.

## Rejected alternatives

- **Remove spikes automatically.** A rule that drops any reading above
  `SPIKE_RATIO` times its neighbours would have handled all five readings
  without anyone writing them down — and would also drop the first reading of
  a genuine flood, an operator's real correction upward, and the day a
  reservoir behind a rebuilt dam first fills. It decides that the series is
  wrong on the strength of the series, which is the reasoning ADR-065 refused
  when it declined to check a capacity figure against the observed maximum.
- **Repair the reading to a plausible value.** Interpolating, or dividing
  Havasu's figure by nine, produces a number no gauge measured and no source
  publishes, which then sums and ranks like a measurement. This is the exact
  act the no-repair rule exists to refuse, and the four issues were written on
  the promise that it would not happen.
- **Publish the spike.** Admit the four with the readings intact and let the
  history rank and the record maximum carry them. Havasu would report a highest
  recorded storage nine times its lake, and every percentage against the record
  would be measured from a number that is not one. A reader cannot tell a
  published anomaly from a published measurement.
- **Wait for the provider.** The issues have been open since the audit and may
  stay open indefinitely; a service is under no obligation to answer. Waiting
  is what this project has been doing, and the cost of continuing is four
  reservoirs held out over readings this project has independent evidence
  against, with no date by which that ends.
- **Exclude by stamp alone, ignoring the value.** Simpler to write and it
  quietly outlives its own reason: the day the service corrects the record, the
  exclusion goes on dropping the corrected reading and nobody finds out.
- **Put the exclusions in a file of their own.** A separate list would drift
  from the roster it describes and would need its own answer to "is this a
  station we know". They belong beside the withheld note that cites them.
- **Apply the exclusion downstream, where the series is summarized.** It would
  reach every provider at once. It would also mean the adapter and the
  summarizer disagree about what the series is, and the audit — which is not
  the pipeline — would go on screening the unfiltered one.
