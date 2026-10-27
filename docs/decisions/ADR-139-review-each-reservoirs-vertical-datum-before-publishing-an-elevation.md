# ADR-139: Review each reservoir's vertical datum before publishing an elevation

- Status: Accepted
- Date: 2026-10-27
- Extends: ADR-118's NGVD29 label for Walker Lake and ADR-116's rule that a person decides where a number cannot be repaired; precedes the elevation publication of ADR-135, which reads this worksheet
- Supersedes: none

## Context

A reservoir elevation is a number in a datum, and the Bureau of Reclamation
feed does not carry the datum with the value. In the interior West the
difference between NGVD29 and NAVD88 is about three feet (2.90 at Glen Canyon
Dam, 2.31 at Hoover Dam by NOAA's NCAT service), and a Reclamation project
datum can differ from both: Lake Mead's Hoover Dam powerhouse datum sits 0.55
feet below NGVD29, and the Lake Mohave and Lake Havasu reports tabulate
the same lake in NAVD88, NGVD29 and a project datum (RPVD, Davis and Parker)
that is NAVD88 minus 3.39 and 2.72 feet. An elevation published with the wrong
datum is wrong by feet and reads as precise. Brian approved a deterministic
worksheet so that every reservoir's elevation can carry a datum label with the
evidence beside it, and ruled that his ruling is the gate: no elevation is
published for a reservoir until he has ruled on its row.

The sources that can name a datum disagree in reliability. A Reclamation
sedimentation or area-capacity report states its datum in prose. The RISE
location carries a `verticalDatum` field, filled for some locations (Mead:
"Power House Datum, add 0.55 foot to convert to NGVD 1929") and unhelpful for
others (Lake Powell: "EGM96"). The U.S. Geological Survey publishes lake
elevation as parameter 62614 (NGVD29), 62615 (NAVD88) and 00062 (datum not
stated) at some reservoirs, but it republishes Reclamation values and has
mislabelled at least one reservoir, so agreement with it is a check and not a
statement.

## Decision

`tools/build_datum_review.py` writes `datum-review.csv`, one row per published
Bureau of Reclamation reservoir (every `source_key: rise` entry of
`reservoirs.json`, keyed by its storage item id; Lake Powell and Lake Mead are
in the set and serve as controls). The tool gathers evidence; it never rules.

Per row it records:

1. **The shift S** (NAVD88 minus NGVD29, feet) at the dam point from NOAA NCAT
   (GEOID18), and the same shift from up to five NGS marks, of the eight
   nearest within one kilometre, whose datasheets carry both heights.
2. **Statements.** The RISE location's `verticalDatum`, and sentences naming
   a datum in Reclamation reports found through the RISE catalog (a
   sedimentation or area-capacity record at the reservoir's location, or whose
   title holds the reservoir's whole name), extracted with `pdftotext`. A
   sentence naming a project datum is a project-datum statement even when it
   also names NGVD29; a sentence naming both national datums and no project
   datum is a conversion and states nothing. `report_datum` lists every datum
   the report states; a report that lists more than one gives no label alone,
   and beside the RISE location it must name the location's datum or the two
   statements disagree. Each quote is stored with its URL.
   Without `pdftotext` the report columns stay empty and `report_status` says
   why. No Python dependency is added.
3. **Series agreement**, read from the USGS OGC API daily collection (the
   legacy waterservices endpoints are being decommissioned; `X-Api-Key` is sent
   only when `USGS_API_KEY` is set and the request falls back to keyless on 403). The RISE elevation item (catalog parameter
   "Lake/Reservoir Elevation", daily first) against USGS 62614, 62615 and
   00062 at monitoring locations within 0.05 degrees, over 90 days: medians,
   the median of the paired difference, and a classification. A 62614
   difference within 0.2 feet says NGVD29. A 62615 difference within 0.2 feet
   says NAVD88; within 0.2 feet of minus S says NGVD29. A difference that fits
   neither is a project-datum flag. A difference whose 10th-to-90th percentile spread
   exceeds 0.5 feet across the window gives no label, because the median of a moving difference
   says nothing about a datum. 00062 never gives a label.
4. **The crest.** The elevation RISE publishes on the location, beside the
   highest elevation in the window. Evidence for the reviewer only.

`suggested_datum` is `NGVD29`, `NAVD88`, `project datum` or `unverified`, with
`suggestion_reason`. A label is suggested only when a Reclamation statement
(the RISE location or a report) names exactly one datum, or when USGS checks
at two different monitoring locations agree on one label within 0.2 feet.
Disagreeing statements, a USGS series that contradicts the statement, one USGS
location, a drifting series, or no evidence give `unverified`. The columns `reviewer_ruling` and `reviewer_notes` are
Brian's; `checked_on` records the run. Every run merges, so `--only`,
`--missing` and a re-run keep every ruling and every row not asked about.

Publishing an elevation, in the work that follows this record, reads
`reviewer_ruling` and nothing else. A reservoir with no ruling publishes no
elevation. The suggestion never reaches a payload.

## Rejected

- **Publish with a single dashboard-wide datum note.** The feeds differ by
  reservoir, and a sentence that is true of Powell is false of Mead.
- **Trust the USGS pair (62614/62615) as a source of truth.** USGS republishes
  Reclamation values and has mislabelled Lake Mohave; two series from one
  gauge are one check. Two monitoring locations are required.
- **Apply NCAT's shift to convert everything to one datum.** The shift is
  valid between the two national datums only; a project datum needs its own
  published offset, and a converted number would read as measured.
- **Let a language model read the reports.** The extraction is a regular
  expression over `pdftotext` output with the quote kept beside the label, so
  a person can check every suggestion against the page it came from.
- **Check in the report PDFs.** The worksheet stores the URL and the quote;
  the PDFs are Reclamation's to host.

## Consequences

- `datum-review.csv` is a reviewed-by-hand worksheet at the repository root,
  like `names-worksheet.csv`: the tool owns the evidence columns and Brian owns
  the ruling columns.
- The tool is network-bound and not part of any build or CI target. Its tests
  use synthetic inputs and no network.
- Known limits, recorded in the worksheet rather than hidden: a report whose
  PDF has no text layer yields no statements; a reservoir with no co-located
  USGS elevation series has no series check (51 of 55 have none); NGS marks
  with both heights were found within one kilometre for 26 of 55, and agree
  with NCAT within 0.2 feet except at Billy Clapp Lake (5.25 against 3.83).
- First run, 2026-10-27, 55 reservoirs: 21 `NAVD88`, 1 `project datum`, 33
  `unverified`, none `NGVD29`. Every label came from the RISE location's own
  `verticalDatum`. 28 locations (mostly Utah) carry `EGM96`, a geoid and not
  a statement of the series' datum, and 3 carry "Other". The location field is
  a Reclamation statement but not always a reliable one: Hyrum's says NGVD29
  where its survey report says the relation to the project datum was
  uncertain, and Rifle Gap's says NAVD88 where the USGS 62614 series at
  09091900 matches the RISE values within 0.1 foot (both left `unverified`).
  The reviewer reads each quote before ruling.
- Control, Lake Mead: `project datum` (RISE location "Power House Datum, add
  0.55 foot to convert to NGVD 1929"; the 2001 survey report also names the
  powerhouse datum and the NGVD29 conversion). No USGS elevation series is
  near the Hoover Dam point. Control, Lake Powell: `unverified`. The RISE
  location says `EGM96` and its one report (1986) states no vertical datum.
  At USGS 09379900 the 62614 series differs from the RISE values by a median
  of 0.21 feet (just over the 0.2 tolerance, so a project-datum flag) and the
  62615 series fits NGVD29 (within 0.17 feet of minus S, S being 2.90 feet),
  one monitoring location, so the tool does not suggest a label. The expected
  NGVD29 rests on Brian's ruling.
