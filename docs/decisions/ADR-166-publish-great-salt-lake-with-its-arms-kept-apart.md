# ADR-166: Publish Great Salt Lake with its arms kept apart

- Status: Accepted
- Date: 2026-11-11
- Extends: ADR-112 and ADR-118 (the arm-aware record and the elevation-only
  record both left for a later decision)
- Supersedes: ADR-119's navigation clause (reached from the methods and data
  pages, not from the bar); the rest of ADR-119 stands
- Relates to: ADR-106 (the waterbody probe), ADR-139 (the datum review),
  ADR-148 (the river-flow entry this one follows), ADR-056 (withdrawal);
  item 14 of `docs/PRODUCT-REVIEW-PLAN.md`

## Context

Brian chose on 2026-11-09 to add "Great Salt Lake with its arms kept apart".
ADR-112 held it out because the survey measures its arms separately and "one
point and one volume would collapse waters that the survey measures apart".
ADR-118 recorded that an elevation-only lake "needs the volume block to become
optional by a later decision". This is both decisions.

The evidence, read on 2026-11-11 from primary sources:

| | South arm | North arm |
|---|---|---|
| Station | USGS 10010000, Great Salt Lake at Saltair Boat Harbor | USGS 10010100, Great Salt Lake near Saline |
| Arm identity | The survey's Utah Water Science Center: 10010000 at the southern end of the lake; 10010100, northwest of Saline, monitors the north part since April 1966; "The Union Pacific Railroad causeway completed in 1959, essentially divides the lake into two parts" | same source |
| Daily series | Parameter 62614, "Elevation, lake/res, NGVD29", statistic 00003 (daily mean), feet, from 1847-10-18 | Same parameter and statistic, from 1966-04-15 |
| Volume | None: the station's time-series metadata lists 62614 alone | None |
| Site datum | NGVD29, altitude 4,186.8 ft | NGVD29, altitude 4,189.8 ft |
| Point | NAD83 decimal degrees, GPS, ±1 second | NAD83 decimal degrees, interpolated from a map, ±1 second |
| NHDPlus HR at 100 m | Exactly one: Great Salt Lake, 126780698, FType 390; Esri's water bodies agree | The same polygon; Esri agrees |
| Committed drainage | 160203 Great Salt Lake / 16020310 Great Salt Lake; the survey's unit 160203100200 agrees | same |

Sources: the arm text is
<https://www.usgs.gov/centers/utah-water-science-center/science/great-salt-lake-elevations-and-areal-extent>,
which also calls the lake "a terminal lake with no outlet to the sea"; the
rest is the survey's OGC API (`monitoring-locations` and
`time-series-metadata` for each station). The public daily collection
answered without a key.

Three facts shape the design. The national hydrography maps Great Salt Lake
as one polygon, so the arms cannot be told apart by waterbody, only by
station. The survey publishes no daily volume for either arm. And the
parameter itself names the datum: 62614 is defined as NGVD29, where Walker
Lake's 00062 states none.

## Decision

**The volume is optional.** A lake entry carries a `volume` block or a
`no_volume` reason in words, exactly one; the loader refuses neither or both.
A record publishes a volume exactly where its roster entry has one, and the
validators refuse a volume on an entry with none. No volume is computed here
from a published table: that would be this project's figure, not the
survey's.

**A lake measured apart is one roster entry per arm.** Each arm is keyed by
its own station and carries the whole evidence set (point, waterbody probe,
closed-basin assignment, elevation with datum), plus an `arm` block naming the
arm with its evidence, source and check date. The arms share the lake's name,
state and targets, and there are at least two of them; the loader refuses one
arm alone, an unnamed arm among named ones, two arms with one name and arms
that disagree on the lake's state or targets.

**The payload carries one lake with its `arms`.** `pipeline.lakes.group_arms`
summarises each station as before and then groups a lake's arms, in roster
order, into one record: the shared fields once, and an `arms` list of each
arm's name, station, point, freshness, level and drainage fields. The record
has no lake-wide station, point, level or volume, and both validators refuse
one. `lake_count` counts lakes, not arms.

**The lake is as current as its oldest arm**, as Walker Lake is as current as
its older measurement. A quiet arm is carried forward on its own, marked late,
and its lake is late. When an arm passes the withdrawal threshold the whole
lake is withdrawn to one notice: one arm published alone would read as the
lake. A lake missing an arm with nothing to carry is not published, so the
roster check keeps the last complete file.

**Great Salt Lake is admitted** as the south arm (10010000) and the north arm
(10010100), each publishing its NGVD29 daily mean level from 2015-01-01, the
project's shared start, with no volume and no targets.

**The datum is the series' own.** Each arm's roster entry records the
parameter definition and the site record's datum beside it. ADR-139's
worksheet is keyed to Reclamation reservoirs, whose feed carries no datum and
which the survey sometimes republishes; here the survey is the measuring
agency and states the datum in the parameter. No conversion is applied.

**`lakes.json` is structure version 2.**

**The lakes page shows each arm in its own section** under the lake's name:
an `h3` naming the arm that labels the section, its surface-level card, a
sentence saying the survey publishes no daily volume for it, its location and
its station rows. The lake's statement says the arms are measured at their own
stations and not combined. Walker Lake's part of the page is unchanged.

**The lakes page is in the bar and the page menu**, an eighth `PAGES` entry
after River flow, icon `absolute-elevation`, its icon alone up to 75rem like
River flow. ADR-119 left this for "when there is more than one lake"; there
now is, and the bar was measured clear at 1,024 and 1,280 pixels on the
storage map.

**Pyramid Lake stays withheld.** The optional volume removes the blocker its
finding named, but its station identity, datum, waterbody point and closed
basin have not been reviewed, and admitting it would be a new review rather
than this decision. Its finding now says so. Mono Lake is unchanged.

## Rejected alternatives

- **Each arm as its own lake** ("Great Salt Lake, south arm"). It counts two
  lakes where there is one, and a withdrawal notice, which carries a name and
  no station, could not say which arm it was.
- **One level for the lake**, the south arm's or a mean of both. It is the
  collapse ADR-112 refuses: the survey says the south part's surface "is
  usually higher than that of the north part", and either choice hides by how
  much.
- **A volume from the survey's elevation-area-volume tables.** A computed
  figure, on a relation this project has not reviewed, for an arm the survey
  does not publish one for.
- **Publish the arm that is current when the other is withdrawn.** Read on the
  page, it is the lake.
- **The page menu only, not the bar.** `PAGES` builds both from one table so
  that no page exists only above or only below 64rem.
- **Hold the datum for a `datum-review.csv` ruling.** The worksheet's rows
  are Reclamation storage items and its tests compare RISE with USGS; neither
  applies to a survey series whose parameter names its datum.

## Consequences

- `pipeline/roster.py`, `pipeline/lakes.py` and `refresh_lakes.py` learn
  optional volume and arms; `LAKE_SCHEMA_VERSION` is 2. `src/types.ts` splits
  `TerminalLake` into `GaugedLake` and `ArmedLake`; the runtime validator
  accepts version 2 only.
- Walker Lake's record is byte-identical to the version 1 record on the same
  inputs; only the envelope's version and count change.
- The data page documents `arms` and the arm fields; the methods glossary's
  terminal-lake entry says volume is shown where published and arms are kept
  apart.
- No target is published for Great Salt Lake. A restoration or management
  range, with its authority, arm, datum and date from a primary source, is a
  later roster change.
- `tests/smoke-modern.mjs --great-salt-lake` (`npm run verify:browser --
  --great-salt-lake`) checks the arms, the menu entry and the bar alone.
