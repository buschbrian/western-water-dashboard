# ADR-167: Enforce the soil percentage bound before averaging

- Status: Proposed
- Date: 2026-11-14
- Extends: ADR-142 (soil moisture change)

## Context

The daily payload on main at `37d7f602` contains a 105,340.1 percent soil
sensor reading at station 985:WA:SNTL. Its three-depth mean is 35,118.3
percent. The client already refuses soil percentages outside 0–100, so this
one producer fault makes the entire soil file unreadable and fails two unit
tests on unmodified main. The producer checks numeric values and sensor
units but does not enforce the client's physical bound.

## Decision

At the producer's SMS series boundary, accept only numeric percentages from
0 through 100, inclusive. An impossible value is missing, never clipped,
interpolated or replaced. Apply the check before rounding and before any
station mean, reporting-day selection, weekly difference or area mean.
Temperature readings keep their existing parsing rules.

The existing missing-reading, frozen-soil, reporting-day and coverage rules
then operate on those readings without modification. Preserve the strict
client validator. Regenerate the current payload with its writer; never
hand-edit the payload to pass the validator.

## Rejected alternatives

- Relax the client validator: the page could publish a physically impossible
  soil-water percentage and use it in a change.
- Clamp to 0 or 100: that invents a measurement and a weekly difference.
- Remove just this station or date: the same malformed input can recur at
  any sensor, and the percentage bound is already a general data contract.

## Consequences

Valid inputs, including zero and 100, retain their values and arithmetic.
Invalid inputs become gaps and may change coverage or the selected end day
under the existing rules. No estimator or normal changes; no method or
schema version changes. Archived daily summaries are not reconstructed.

Synthetic tests cover negative and over-100 values before station averaging,
including the observed 105,340.1 value, and both valid boundary values. A
ten-station fixture keeps the reporting day fixed while one site loses a
reading, so it also proves that no weekly difference is fabricated for it.
