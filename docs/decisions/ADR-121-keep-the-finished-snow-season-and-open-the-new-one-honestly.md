# ADR-121: Keep the finished snow season, and open the new one honestly

## Status

Accepted

## Date

2026-10-18

## Context

`snowpack.json` holds one water year. On 1 October the refresh started water
year 2027 and wrote over 2025–26. Nothing else held it: the whole season,
including the peak ADR-040 opened the map on, was no longer published
anywhere on the site.

The new season also showed a fault in ADR-040 that a finished season could
not. ADR-040 opens the map on the deepest day that half the sites reported,
and falls back to the newest such day only when no day qualifies. In October
every day qualifies. On 2026-10-18 the payload held seventeen days, and the
deepest was 2026-10-16: a mean of 0.16 inches of snow water, against a mean
normal of 0.04 inches. The map opened there, the reading beside the slider
called it the season high point, and fourteen of the sixteen basins with a
figure were drawn "above 110% of normal". Every one of the sixteen stood on a
mean normal under a quarter of an inch.

That is the effect ADR-040 itself rejected for peak percent of normal:
"arithmetically the region's best day and hydrologically close to
meaningless". The rest of the page already refused it. The newest-value card
said there was too little normal snow to compare against, the best-against-
normal card said too few sites had values yet, and the season curve drew no
line. The map was the one surface without the denominator floor
(`MEANINGFUL_NORMAL_INCHES`, one inch), because the floor was written into the
curve and the headlines and never into the map.

## Decision

**One denominator rule, read everywhere.** `normalIsComparable` is the single
test of whether a mean normal can be divided by: at least one inch. The
headlines, the drawn curve, the map and the peak all call it.

**The map classes nothing below the floor.** An area is classed only when the
mean normal over the site-days its percentage summed is at least an inch; a
site only when its own normal is. Below that, the area or site is drawn as a
distinct state — a grey hatch for areas, a filled grey dot for sites, its own
key entry "Too little normal snow to compare" and its own segment in the
spread bar — and its hover card says why and keeps the depth. It is not the
no-value grey: something was measured, and the reader can see that it was.

**A season has a peak only by a stated rule.** `seasonPeak` is the deepest day
among the days that clear both floors: at least half the sites reporting, and
a comparable mean normal over them. Until a day does, there is no peak, and
the map opens on the newest day that met the reporting floor — ADR-040's own
fallback, now reached when it was meant to be. On the finished 2025–26 season
the rule changes nothing: the peak is 2026-03-13 at 9.9 inches on a mean
normal of 17.0. (ADR-040 named 2026-03-07; that was the 217-site record of
the time. The western network's 638 sites peak six days later.)

**"Season high point" means a finished season.** The reading beside the
slider says "season high point" only on the peak of a season published as of
30 September, and "most snow so far this season" on the peak of one still
running. In January the deepest day is often yesterday, and it may not stay
the deepest.

**The finished season is kept, byte for byte.** Before the first run of a new
water year writes `snowpack.json`, `refresh_snowpack.py` copies the published
file as it stands to `data/snow/snowpack-wy<YEAR>.json`. The bytes, not a
re-serialisation: the archive is the season as readers were served it on its
last morning. It is write-once — a repeat does nothing, an existing archive
is never replaced, and a payload that cannot be read stops the rollover
rather than being overwritten unkept. 2025–26 was written by the same function
from `2998844:snowpack.json`, and its hash is pinned in a test.

`data/generated-files.json` owns `data/snow` as one directory entry, class
`generated-archive`, staged by the refresh. A season ending next year is then
classified and committed with no edit to the table; a file per year would
need a person to add next year's row before October, and a season the refresh
archives and does not commit is lost the next morning, when the checkout
starts from the new season.

**The reader can choose the season, and sees last season beside this one.**
`?season=2025-26` shows a finished season instead of the current one, written
only when the reader chooses and named by its two years so a link keeps
meaning the same winter. The season chart draws the season before the shown
one, on the same dates, as a thinner grey line, across the whole water year;
in October it is most of the chart, and the chart says so. The month table
gains that season's column. Early in a season, under the map, one link goes
to the last finished season, which opens on its own peak.

**Which seasons exist is a constant, not a request.** The page offers every
water year from `FIRST_ARCHIVED_WATER_YEAR` (2026) to the season before the
current payload's; a test holds `data/snow/` to exactly that list.

## What was rejected

**Recompute a client-side peak from percent of normal with the floor.** The
map would open on a December day again, which is ADR-040's measured reason
for using depth.

**Hide the basins below the floor, or grey them as "no value".** Hiding
breaks ADR-050's rule that a drawn area is one with something to say; the
plain grey says nothing was measured, which in October is false.

**Open the map on last season's peak in October.** A map that opens on a
different year from every card above it is a worse inconsistency than the
one being fixed. The current season stays on screen, honestly grey, with the
other season one link away.

**Load last season on first paint.** It is 4.7 MB raw and 365 KB gzipped,
eight times this October's payload. It is fetched only when the reader asks
for that season, or when the season chart comes within 600 pixels of the
screen, with the page's own deadline.

**A derived summary file for the comparison line.** The line has to follow
the page's narrowing — state, level, area, upstream set — and only the sites
can be narrowed. A summary would be a second, smaller copy of the rule.

**An index file listing the archives, or a field in `snowpack.json`.** Either
adds a moving part to say what one constant and one test already hold. The
current payload is loaded on the archive view anyway: it is how the page
knows which seasons have finished.

## Consequences

- The payload is unchanged and `SNOW_METHOD_VERSION` does not move: the floor
  decides what the page draws, not what the pipeline publishes.
- In-season the map changes little. On the 2025–26 peak no area is below the
  floor and 9 of 538 sites are; on 2025-12-06, 3 of 48 areas and 44 of 539
  sites.
- The legend grows by one entry, and the browser suite's chip count with it.
- `tests/fixtures/snowpack-wy2027-october.json` freezes the October 2026
  payload so the season-turn tests cannot drift with the daily file.
- The site table's "Of normal" column and a site's own "season high point"
  line do not yet follow the floor or the "so far" wording. Both are
  per-site statistics with the depth and normal beside them; they are left
  for their own change.

## Amends

ADR-040: its peak now has a denominator floor, its fallback is the newest day
meeting the reporting floor, and "season high point" is reserved for a
finished season. ADR-040's choice of depth over percent of normal stands.
