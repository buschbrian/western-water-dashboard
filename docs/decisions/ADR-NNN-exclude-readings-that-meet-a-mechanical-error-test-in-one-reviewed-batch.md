# ADR-NNN: Exclude readings that meet a mechanical-error test in one reviewed batch

- Status: **Proposed** (for Brian Busch's approval; no number claimed until it lands)
- Date: 2026-11-11
- Extends: ADR-152 (close a provider issue whose every reading is a mechanical error), ADR-116 (exclude a reviewed reading and never repair one), ADR-150 (the record-figure screen)

## Context

ADR-152 defined four mechanical-error tests: a zero between non-zero neighbours, a power-of-ten shift, one digit dropped or added, and a same-day exchange with another station. It used them only to decide when a provider issue may close. Every exclusion is still reviewed and written one reading at a time.

The record-figure screen now reports 63 published reservoirs for review. A deterministic check (`code/day18_record_checks.py` in the Day 18 review) ran the series window, the ADR-152 tests, CDEC monthly against daily, second providers within 3 km, rain at nearby GHCN stations and upstream flow on every one. Of the flags still open:
- 18 meet an ADR-152 test: 13 zeros, 4 power-of-ten shifts (Huntington, Hetch Hetchy, Mountain Meadows, Pit 7) and 1 dropped digit (Pit Six);
- 5 are single-day spikes that no ADR-152 test names;
- 2 disagree with a second series;
- 28 are unresolved;
- 5 are likely real.

Writing 18 exclusions, each with its own evidence and issue, repeats one judgment 18 times. The judgment is already written down in ADR-152.

## Decision (proposed)

1. **A reading may be excluded in a reviewed batch when it meets an ADR-152 test exactly as that record defines it**, re-checked unchanged at the provider on the batch date, and it is not part of a run. A run is three or more consecutive readings at the same value, because a run may be a real drawdown.
2. **A tool writes the batch.** It writes every reading's ADR-116 record (sensor, stamp, raw value, reason, source URL, reviewed date, issue URL) and names the test each one meets and its neighbours. The reviewer approves the batch as one diff. The reason is generated from the test, never written freehand.
3. **One issue per provider per batch.** The issue lists each reading, its neighbours and the test, so it can be checked line by line. Under ADR-152 it may close at once, because every reading in it is mechanical.
4. **Everything else stays individual.** These are reviewed one at a time under ADR-116, as now:
   - single-day spikes the tests don't name;
   - series disagreements;
   - runs;
   - any reading whose rain or upstream flow suggests a real event.
5. **Nothing is repaired.** As in ADR-116, the batch removes readings and supplies no replacement.

## Consequences

- The 18 current candidates become one CDEC batch and one NRCS batch, after re-checking. Utica's 15-day zero run, Salt Springs' 7 days and Chesbro's 3 are runs, so they stay individual.
- Published record lows and highs change for those reservoirs. The release notes list them.
- The check tool's verdict is evidence for the batch, never the source. Only the ADR-152 tests admit a reading to it.

## Rejected alternatives

- **Exclude automatically in the daily refresh.** It would make a test a silent repair path and remove the person ADR-116 requires.
- **Batch the single-day spikes too.** No written test covers them, and a lone spike can be real, such as a surge, a gate test or a gauge reset.
- **Keep writing each exclusion by hand.** It is accurate and slow, and the slowness is why 58 flags have sat in the refresh log.
