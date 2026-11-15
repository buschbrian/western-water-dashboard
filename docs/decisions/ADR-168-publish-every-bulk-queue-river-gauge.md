# ADR-168: Publish every bulk-queue river gauge

- Status: Proposed
- Date: 2026-11-14
- Extends: ADR-136 (the roster and the page), ADR-137 (the tier rule),
  ADR-138 (the bulk queue), ADR-144 and ADR-145 (the natural comparison)
- Relates to: ADR-124 (the bounded pilot), ADR-148 (river flow in the bar)

## Context

Eight gauges were published, all in Utah. The four gauge worksheets hold 773
screened gauges in Utah, Colorado, New Mexico and Arizona, and
`reviewer_ruling` is blank on every row but the eight. On 2026-11-14 Brian
directed that all the river gauges be added.

ADR-138 recorded Brian's ruling that both ADR-137 outcomes may be agreed in
bulk, and its `bulk` queue holds a row only when nothing else is in doubt: a
traced basin that matches its published area, a record covering 1991-2020, no
dam within 1 km, no diversion finding and no water added upstream. That
queue is the set that can be published without a person reading each row.
The other 630 rows are in `review` or `check` because something in their
evidence needs a person.

## Decision

**Add the bulk queue's `reservoir` and `natural` rows to the roster.**
`tools/admit_bulk_river_gauges.py` reads the four worksheets and writes an
entry for each such row, published as `shaped` or `natural`, directed
2026-11-14 and `pending_formal_ruling` like ADR-136's four. A natural entry's
`tier_ruled_on` is 2026-10-27, the day of the bulk ruling. The worksheets are
not written; `reviewer_ruling` stays blank until the review page's export is
imported.

**What the tool still holds back**, each printed with its reason:

- `exclude` rows (tunnels, drains, canals): ADR-138's "not shown".
- A name that calls the gauge's own water a wasteway, canal, ditch, drain,
  tunnel, lateral, conduit, flume or outlet. ADR-138's rule misses "wasteway";
  a person decides.
- A natural row whose GAGES-II class is not `reference`. Every published
  natural gauge is a reference gauge, and a non-reference natural row is in
  `review` anyway.
- A display name with an open `name_check`, or one already in use.
- A gauge for which the survey does not list exactly one primary daily mean
  flow series in ft^3/s.

**Measured on 2026-11-14:** 133 rows to add (126 shaped, 7 natural) and 10
held: eight `exclude` rows, Bruce Church Wasteway near Yuma, and North Fork
Weber River near Hooper (GAGES-II not listed, 4 years of flow).

**Measured again on 2026-11-15, after the review page's rulings were
imported:** the roster holds 142 gauges, 8 before and 134 added. Of the 134,
120 are bulk-queue rows and 14 are rows Brian ruled in the review page (7
shaped, 7 natural). By state and tier: Utah 60 shaped and 11 natural,
Colorado 47 shaped, New Mexico 5 shaped, Arizona 19 shaped. Sixteen rows are
held: six `exclude` rows by suggestion and two by ruling (Fairview Tunnel,
Goggin Drain); Bruce Church Wasteway (the name); North Fork Weber River near
Hooper (4 years of flow); Ashley Creek near Remember the Maine Park (ruled
shaped, but no published reservoir upstream and 2.1% storage, under ADR-137's
10%); and Cave Creek below Cottonwood Creek and Agua Fria River near Mayer and
near Rock Springs, ruled natural but without the storage evidence ADR-137
needs, because the dam screen (`--evidence`) has not run for Colorado, New
Mexico or Arizona. McElmo Creek near Bluff and Clear Creek near Winslow
were admitted and then held on 2026-11-15: every day of their series in the
refresh's 90-day window carries no value (qualifier `RATINGDEV`, a rating
under development), so the first refresh had no record for them and refused
the whole river payload. The tool now holds a series with no reported value.
The worksheets hold 773 rows, one per station: 150 `bulk`,
75 `check` and 548 `review`.

**Natural percentiles.** `tools/build_river_normals.py --only` adds the new
natural gauges to `river_normals.json`, unchanged in method.

## Rejected alternatives

- **Every screened gauge.** `review` and `check` rows carry a finding a
  person must weigh (a diversion name, water added upstream, a basin that does
  not match). Publishing them would publish the worksheet's guess as a ruling.
- **A `short` or `diversion` tier.** Neither has a publication method yet
  (ADR-136's loader refuses them). Each needs its own record.
- **Wait for every formal ruling.** ADR-136 set the precedent of publishing at
  Brian's direction pending the ruling, and the bulk ruling already covers
  these rows.

## Consequences

- The rivers page lists about 141 gauges in four states in one summary table.
  Its layout was built for eight; grouping or filtering by state is a later
  reader-surface decision.
- `rivers.json` grows from about 4 KB to roughly 70 KB gzipped, and
  `river_history.json` grows in proportion. The daily refresh makes two
  keyed requests per gauge with a half-second pause, about three minutes.
- Display names are the worksheet's proposals (ADR-137 rules), not yet
  accepted by a person. Names that keep a structure ("above Red Fleet
  Reservoir", "below Winsor Dam") are as proposed; ADR-145 shortened two such
  names on request.
- No gauge is a reservoir's inflow, and none is added to another.
