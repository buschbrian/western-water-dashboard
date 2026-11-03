# ADR-151: Keep reader context with the current figures

- Status: Accepted
- Date: 2026-11-02
- Amends: ADR-135's reference-level presentation and ADR-142's list of eight
- Extends: ADR-094 (snow place controls), ADR-141 (share pictures), ADR-149 (weekly filters)

## Context

The November 2 outside-reader review found that the snow page's opening place
sentence survived later drainage-area changes. The weekly card's snow and
drought sections remained regional beside filtered storage figures. Shared
reservoir pictures traveled without a source line or a clear key. Earlier
owner display rulings also called for named reference levels, leading level
and percent-full tiles, and separate wetter and drier station lists.

## Decision

The snow place sentence is rebuilt from the current area whenever its figures
update. Clearing the area clears that part of the sentence; the selected state
remains. A coarser opening area remains named while it still bounds the loaded
stations. Clearing that coarser area navigates to load the wider station set.
The explanation for a linked site that widened the place is retained.
URL meanings, stored-place precedence and the station calculations do not change.

Weekly snow and drought headings say "whole region" beside their counts.
Storage continues to follow the same filtered rows as the table, under ADR-149.

For a reservoir with a reviewed elevation, the lead shows its level and datum
beside percent full and its basis. Reference levels sharing a label share one
source; the key names that label once, and the lines show their heights. This
supersedes ADR-135's presentation of repeated labels, not its datum rules.

Share pictures carry the reading source and a key for the current year,
previous year, earlier years and reference lines. The soil list shows up to
four increases and four decreases of at least two points, stating when one
side has none. This supersedes ADR-142's single list of eight absolute changes.
The soil switch names its end date, with the reporting rule explained below it.

The public data reference documents both precipitation files at their existing
paths, including sparse daily indexes, tenths-of-an-inch history encoding and
the fixed comparison set. The reporter guide is published as a static page and
linked from Methods, Data and relevant reading-page footers.

## Rejected alternatives

- Keep an opening-place label after the selection changes: it describes a
  different set of stations from the current figures.
- Rely only on the weekly card's footnote: the section headings are what a
  reader scanning the page sees first.
- Rewrite accepted decision bodies: the earlier decisions remain history,
  with status references to this successor.
- Change methods or add new API aliases: the repairs concern context and
  documentation, and preserve the existing measurements and paths.

## Consequences

No estimator or schema version changes. Model tests cover the place sentence
and weekly headings. The browser suite clears a linked snow area and checks
that its old sentence disappears. Data-reference tests compare the documented
fields against the emitted precipitation files. Browser checks still cover
navigation, widths, accessibility, source text and the share frames.
