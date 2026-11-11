# ADR-160: Publish storage history apart from the summary

- Status: Accepted; implementation local, not released
- Date: 2026-11-11
- Extends: ADR-002, ADR-066, ADR-117, ADR-146, ADR-154

## Context

Brian requested completion of the November product-review plan, starting with
wave three. Item 10 asks for each reservoir's available daily storage record,
a water-year chart and the whole record as CSV. The summary refresh already
reads storage since 2015 and discards the series. Fetching older observations
again every morning would make publication depend on hundreds of long queries.

On 2026-11-11, a backfill through the existing adapters measured 330 indexed
stations of the 409 published, in 323 files: 42,674,229 bytes raw and
8,049,307 bytes gzipped separately. The largest file was 116,805 bytes gzip;
the current-year file 36,722 bytes and index 16,017 bytes. The Powell and Mead
sample alone held about 56,000 observations from 1963 and 1937 respectively,
at 146,557 bytes gzip across its files. The remaining backfill is a publication
check, not a claim that these 330 are the entire roster.

## Decision

Publish `data/storage-history/index.json`, `current.json` and a finished-year
file per station, named by the SHA-256 of the station identifier. The index
maps the public station identity to its archive; names never choose paths.
Each series carries its source and reporting interval, a start and end, and
one storage value in acre-feet per calendar day. Missing days are null.
Monthly observations remain monthly points with empty days between them.

`pipeline/storage_history.py` merges the series the daily refresh already
fetched. It retains unrequested and withdrawn stations, rolls finished years
out of the shared current file even for an unfetched station, and changes an
archive only when observations change or a year ends. Provider corrections
replace reported dates; omitted dates stay stored. An unreadable existing
file is an error, not permission to start an empty history. There is no
second estimator, rounding rule or exclusion screen: existing provider
adapters and reviewed reading exclusions remain authoritative, including
finite source readings below zero. A new reviewed exclusion belongs in the
existing exclusion process. A provider-owned cache helper also removes an
exact newly excluded day/value from retained history, with CDEC month-end
dates corrected the same way; a corrected value at that date stays.

`tools/build_storage_history.py` backfills earlier observations on demand,
through the same adapters, with at most three workers. SRP and CAP start with
their retained cache because their services do not offer an earlier complete
record. A failed backfill keeps the existing history and is reported. The
data reference says that an absent index entry has no published history yet.
No file is fabricated to fill an unavailable record.

The new `generated-history` ownership class distinguishes these revisable
observations from a frozen `generated-archive` such as a finished snow season.
The refresh stages the directory, and the build copies it as runtime data.
The index, current file and station archives have version 1. Storage summary
fields, full levels, normals and method versions do not change.

The reservoir page fetches history when its chart comes within 600 pixels
of the screen. It draws the reading's water year and up to five earlier
years, retains gaps, aligns leap and non-leap calendar dates, and supplies a
table and a full-record CSV. Failed loading clears busy state and leaves the
monthly chart available. Storage share frames use the water-year chart when
available, with the monthly chart as fallback; the reviewed-level share
frame retains its own level chart and datum contract.

## Alternatives

- A write-once file for every individual water year would multiply requests
  and freeze provider corrections. One archive per station avoids both.
- Rewriting the entire shared historical record daily would turn one new
  reading into tens of megabytes of changed text. Only the current year is
  shared.
- R2 remains available under ADR-124. The measured size does not require a
  new storage service, credentials or public host. Reconsider it when the
  compressed directory reaches the enforced 64 MB budget.

## Consequences

The initial commit gains historical data. Finished-year corrections can still
change an archive, so “written once a year” is the usual rollover behavior,
not an assertion that a provisional observation is immutable. There are no
new runtime dependencies. The per-file gzip ceiling is 512 KB, the directory
64 MB, and the index 64 KB. Completion requires a reported backfill result,
pipeline and frontend checks, and browser checks of charts, downloads,
deep links and the failed-history fallback.
