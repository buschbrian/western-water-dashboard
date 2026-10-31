# ADR-130: Merge saved gauge reviews with explicit replacement

## Status

Accepted

## Date

2026-10-24

## Relates to

ADR-124 (bounded Utah recent-conditions pilot and human-reviewed admission).
No existing decision is superseded.

## Context

The private review stores rulings separately from `gauge-review.csv`. Its CSV
export can include saved records, unsaved drafts, notes-only records and
explicitly cleared reviews. A blind spreadsheet join could lose leading
zeroes, overwrite newer worksheet notes, or turn a failed save into a ruling.
The worksheet has no review timestamps with which to settle conflicting edits.

Brian selected daily river response and drainage review as the next work.
A deterministic, reviewable transfer of his rulings is the first dependency;
it must preserve the evidence and cannot itself admit a gauge.

## Decision

Use an offline importer that previews the full before/after review diff by
USGS site number and writes only when explicitly invoked with `--apply`.
Only `reviewer_ruling` and `notes` can change. All evidence columns and every
row absent from the export remain intact.

Accept only the saved export schema, known unique textual site numbers,
the five existing tiers (or an explicit blank), and time-zone-bearing review
timestamps. A changed ruling differing from its suggestion needs notes.
Reject the entire import before writing if any record is invalid or unsaved.

Changing or clearing an existing ruling or notes requires `--replace SITE`
for each site. Do not infer precedence from timestamps or provide a global
force flag. Preserve multiline notes. Repeated identical imports write
nothing. Commit a changed worksheet atomically after validating the whole
batch and checking that the worksheet has not changed since it was read.

## Rejected alternatives

- Join directly in a spreadsheet: risks identifier coercion and unreviewed
  overwrites, without an all-or-nothing validation step.
- Choose the newest timestamp: the worksheet has no comparable timestamp.
- Import unsaved drafts as rulings: their server save has not succeeded.
- Copy suggested tiers automatically: suggestions are evidence for review,
  not Brian's decisions.

## Consequences

Review transfer needs no network service, new dependency or daily job.
Exports remain private local inputs. Tests use synthetic records to exercise
round-trip preservation, conflicts, explicit clears, malformed batches and
idempotence. One editor at a time remains required; the importer is not a
multi-user transaction service. Record completeness, corrected boundaries,
gauge admission, flow normals and publication still require their own review.
