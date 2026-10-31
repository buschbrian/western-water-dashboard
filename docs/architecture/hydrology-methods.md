# Hydrology and measurement methods

Every rule here is a property of a published number. Changing one changes what
the site claims, so it is a decision-record change, not an implementation
detail: follow
[`.claude/skills/science-method-change/SKILL.md`](../../.claude/skills/science-method-change/SKILL.md).

## The seasonal comparison

**A calendar date is one position in every year.** `canonical_day` maps a date
into a 365-day year where 29 February shares 28 February's place;
`seasonal_window`, the climate-normal table and its lookup all match on it.
Never reach for `dayofyear` again: it makes 19 August day 231 in an ordinary
year and 232 in a leap year, so a window centred on 19 August was centred on 18
August for every leap year in the record, and the normals table was built over
a leap year while being read by ordinary-year numbers. The wrap at the year end
is a flat 365 for every year.

**Every year gets one vote.** A seasonal normal is the median of one
representative value per year (`annual_seasonal_values`), never a median over
the pooled readings: a reservoir reported daily brings about 450 readings to a
thirty-year window and one reported at month end brings about 15, so pooling
made the statistic a fact about reporting density. The history rank ranks the
same annual values, and the details panel leads with the ordinal — "3rd-lowest
of 12" carries its own sample size and a percentile does not.

**A vote is one window instance, not one calendar year** (review of
2026-08-20). Away from 1 January the two are the same thing. At the year end
the window wraps, and grouping the wrapped readings by their own calendar year
put a year's early-January readings — the winter before — and its
late-December ones — the winter after — in a single vote describing neither,
about 360 days apart. Each reading votes with the instance whose reference date
it is days from, and `prior_annual_seasonal_values` cuts on the **vote's**
year: cutting on the reading's admitted the current winter's December as
"prior" evidence and split a finished winter across two votes. The seam is also
why fourteen days of `normals.json` count 31 years against a thirty-year period
and that is the honest count — a winter spans two calendar years, so a period
bounded by them cuts its first and last winters in half, and both halves really
did vote.

**A tie is not below** (review of 2026-08-20). `seasonal_rank` counts the years
strictly below the current reading, so `seasonal_percentile` must too: the two
are one comparison printed in one row, and counting ties as at-or-below on one
side only published "1st-lowest of 12" beside a percentile of 9.1 for four
reservoirs in a committed payload. Lowest ever, tied or not, reads 0, and 100
arrives exactly when the rank reads highest.

**A normal names the years it came from** (ADR-041). Two comparison periods are
published per reservoir and the reader picks; `normals.json` holds the standard
1991-2020 one and is rebuilt by `tools/build_normal_baselines.py`, not by the
daily refresh — a median over a period that has ended cannot change. Two rules
have tests behind them: a comparison never answers with a period it was not
asked for without saying so, and a median never appears without the number of
years behind it. A baseline thinner than the payload's own `minimum_years`
counts as unavailable, because a three-year median labelled "1991 through 2020"
is true in every word and wrong as a whole.

## The denominator

**Percent full divides by a figure the water has not been seen above**
(ADR-072). The preference is ADR-003's, unchanged — the conservation pool,
then the maximum pool, then the inventory's headline figure — and for 216 of
the 365 published reservoirs the conservation pool is what a percentage
divides by, because it is what an operator means by full and it describes the
water: Strawberry's pool is 1,105,910 acre-feet against 1,106,560 ever
observed. `denominator_for` in `admission.py` adds one condition on the first
choice, answered from the same inventory record: it offers each figure in turn
and takes the first the observed record fits inside, with `SURCHARGE_ALLOWANCE`
for real operation above a pool. A reservoir a percent or two over its
conservation pool keeps it and publishes just above 100, which is what a
surcharge is. Thirteen reservoirs move — the Corps flood-control projects whose
series report gross storage against a summer pool, which is how Detroit came
to be published at 223.7% full.

**Where the provider publishes its own full level, that figure wins over all
three** (ADR-070), and the rule above is never reached. `capacity_basis` names
which source every published denominator came from, per reservoir.

NID is the default evidence, not a completeness gate. Where it has no
corresponding structure, a reviewed government water report or owner-operated
record may provide identity and full level when it defines the reported series
on the same storage basis (ADR-110). The evidence records the unsuccessful NID
search as well as the replacement authority.

**A reading a reviewer has shown cannot be true is excluded from the series,
and never repaired** (ADR-116). The exclusion names one reading -- the
provider's sensor, the stamp as the provider writes it, the raw value, the
reason, an independent figure, the review date and the open issue -- and the
adapter drops exactly that reading where readings are read. The raw value is
part of the identity, so a corrected figure at the same stamp flows through
untouched. Nothing is substituted: no interpolation, no scaled value, no
automatic spike removal, and the loader refuses an exclusion carrying a
replacement. Five readings across four withheld California stations are
excluded today and none of them has ever been published; the seasonal
estimator is unchanged, so no method version moves.

Where no figure survives those rules, the reservoir is withheld and the
disagreement is stated rather than settled (ADR-113). Leroy Anderson is the
case. The inventory and the operator agree on a physical capacity near 89,000
acre-feet, but a dam-safety order in force since 2017 has held the reservoir
to a level that moved -- about 52,553 acre-feet, then deadpool from 2020, then
3,485 from April 2024 -- and the level held between 2020 and 2024 is published
as a word, never as a figure. The operator's own current document gives two
current levels. This project records that the sources do not assemble into a
dated history; it does not choose the number that would make them.

An active operating restriction is the reservoir's current full level
(ADR-111). Physical capacity remains a separate fact. Full levels are dated:
current figures and rollups use the version effective on the observation date,
and a historical observation uses the version that was effective then. This
keeps the start or end of a restriction, and a physical enlargement such as
Success Lake's, from rewriting earlier percentages.

## How a water is run

A reservoir carries an `operating_character` when it is not ordinary
target-filled storage (ADR-114): `restricted` where a dam safety order holds it
below its full level, `run_of_river` where an operator keeps it at a steady
level all year, `flood_space` where it keeps room empty to catch floods.
Ordinary storage carries no value, and the roster's own `reviewed` date is what
makes that absence mean reviewed rather than unexamined.

The character labels and does not calculate. Every published figure is what it
was, and whether a steady-level pool belongs in a drainage area's combined full
level is a separate decision with its own measurement. It matters because two
published areas are almost entirely such pools -- Lower Snake at 97.6% of its
combined full level and Middle Columbia at 94.9% -- so a combined percentage
for either is close to a constant and reads as a drought signal.

## Elevation datum

A reservoir elevation carries a vertical datum the feed does not state. The
datum is a reviewed fact, one per reservoir (ADR-139): NGVD29, NAVD88, or a
project datum with its stated offset (Lake Mead's Hoover Dam powerhouse datum
is 0.55 feet below NGVD29). The worksheet `datum-review.csv` holds the
evidence; a suggestion needs a Reclamation statement or two agreeing U.S.
Geological Survey locations, and the reviewer's ruling is the only thing a
published elevation reads. NAVD88 minus NGVD29 is a shift of about three feet
in the interior West and is never applied to move a project datum.

## Natural terminal lakes

A natural terminal lake is a separate water type (ADR-112). It may publish
elevation, volume, change and same-date seasonal rank where those measurements
are traceable. It has no dam point, capacity or percent full and is excluded
from every reservoir rollup. A restoration level is labelled as a target with
its authority and date rather than represented as capacity.

Walker Lake is the first lake (ADR-118). Its elevation is published in feet
above NGVD29 and its volume in acre-feet on the Lopes and Smith (2007)
relation the Geological Survey has applied since 1 October 2014; the published
record starts on 2015-01-01, inside that relation, so no volume is on an
earlier table. Each measurement carries its dated record extremes, its dated
7-, 30- and 365-day changes, and a same-date seasonal rank from the reservoir
estimator unchanged — one vote per prior year in the same window, counted from
the lowest, under the same `METHOD_VERSION`. A level has no percentage change:
a share of a height above an arbitrary datum has no hydrologic meaning. The
volume's twelve-month history carries the period-of-record monthly normal
(`normal_af`, with `normal_years`) that a reservoir's does; no 1991–2020
climate normal is published for a lake until the normals builder learns the
type. The payload is `lakes.json`; no page shows it yet, so the glossary's
statement that every published water is a reservoir still holds for readers.
Great Salt Lake requires an arm-aware representation; one point and one total
would collapse separately measured waters.

## Reservoir surface level

A reservoir publishes its surface level only from a reviewed entry in
`admitted_reservoir_elevations.json` that names the vertical datum with
evidence (ADR-135). Lake Powell is the first: Reclamation's daily level
(RISE item 508) is in feet above NGVD 1929, established by measurement because
Reclamation names no datum -- over 91 days to 2026-10-26 it read a median
0.14 ft from the Geological Survey's NGVD 1929 series at 09379900 (parameter
62614) and 2.76 ft below its NAVD 1988 series (62615). The two Survey series
differ by a median 2.9 ft (range 2.9 to 3.0), measured 2026-10-27, and that
offset is published with its date.

**Never assume a provider's datum.** RISE labels no datum on its elevation
items and is not uniformly NGVD 1929: Taylor Park (item 796) matches the
Survey's NAVD 1988 series. Every entry carries its own evidence. An
operator's own project datum (Hoover Dam's powerhouse datum; Reclamation's
project datums at Davis and Parker) is admitted as `project`, by its name and
with its stated relation to a national datum -- the feet to add, the
operator's words and a source -- and is never called by the national datum.
Lake Mead is the first: Reclamation's 2001 sedimentation survey ties its
elevations to the Hoover Dam powerhouse datum ("Add 0.55 feet to convert to
NGVD29"). That RISE item 6123 is on it is an inference from that report, not a
measurement, because no second series exists at Mead. Its NAVD 1988
difference, about 2.9 ft, is calculated from two National Geodetic Survey
benchmarks on the dam (NAVD 88 minus NGVD 29 = 2.35 ft) plus the 0.55 ft, and
is published as `derived_offset`, never as a measured `datum_offset`.

The level block is the terminal lake's level summary, built by the same
function (`pipeline.measurement.summarize_measurement`): dated record
readings, dated 7-, 30- and 365-day changes in feet, and the same-date history
rank from the unchanged reservoir estimator. Its record starts at the
roster's `record_starts`, the published end of first filling, with its
source: Powell 1980-06-22 (Reclamation: "completed filling on June 22,
1980"), Mead 1941-08-06 (Reclamation's 2001 survey: the first time the lake
reached its spillway). Readings while a lake first fills describe the filling
and are left out of the record readings and the rank; the daily history and
the chart keep them. A start with no published source is refused. No percentage of a level is published,
and a reference level is a named elevation with its authority, never a
denominator. A daily level from Reclamation is one end-of-day reading; the
Survey publishes every fifteen minutes, so the two also differ while the
water moves quickly, by up to about a foot when Powell rose 1 to 1.8 ft a day
in October 2026.

## River flow

A gauge publishes the survey's daily mean flow (parameter 00060, statistic
00003) in cubic feet per second, as reported (ADR-136). Nothing is estimated:
a reported day with no value stays empty, an approval status and qualifiers
travel with each day, and the 7-day change is the difference from the value
exactly seven days earlier, null when that day has none. Every published
gauge is `shaped` (dams upstream store and release water), so no flow is
compared with normal or ranked, and no flow normal exists yet. Gauges are
never added together and no gauge is a reservoir's inflow (ADR-124). A daily
mean cannot show a peak inside the day.

**Never subtract two shares with different denominators** (ADR-046) — see the
drought section below for the case this exists for.

## Method version

**A method version is not a schema version.** A field can keep its name, type
and units while the estimator under it changes, and `schema_version` cannot see
that. `METHOD_VERSION` can, and three places refuse to mix:

1. `tools/build_normal_baselines.py` stops a partial run against a file built
   by another estimator;
2. `load_normals` warns when the payload and the committed normals disagree;
3. `merge_history` refuses a drought week measured by another method exactly as
   it already refused one at another level.

An interrupted full normals build is the single exception — it keeps its
fetches and drops the rest, because it has already paid for them.

**`METHOD_VERSION` names the seasonal estimator, not every published number.**
All three refusals above guard normals, and a normal is a median of readings in
acre-feet. A change to which figure a percentage *divides by* invalidates no
normal and must not move it: bumping it would force a full network rebuild that
changed nothing and would claim the estimator had changed when it had not
(ADR-072). The test is whether a committed normal built under the old version
is still a correct answer. If it is, the version stays and the change carries
its own record instead.

**Every normals run is a merge, a completed full one included.** A full run
keeps the records of reservoirs absent from today's payload — the ADR-056
withdrawal the merge exists to protect — so after a method change it would
otherwise write old-estimator records under a header stamped with the new
version. That is worse than a plain mix: `load_normals` reads the header, so a
file claiming one method could never warn. A full run therefore drops those
records, names them, and leaves `--missing` to rebuild each one when its feed
returns. Every published drought coverage file states its `method.version` too,
and a test holds both levels to it — the HUC-4 file is written with
`--no-history` and so never passes `merge_history`'s gate.

## The basin percentage for snow

**Summed water over summed normals, once** (ADR-081). A drainage area's
percent of normal is the sites' snow water added together, divided by the
normals added together over the same site-days — the rule NRCS uses for a
basin figure, and the same rule `storageByArea` states for reservoir storage:
"a sum of acre-feet in both cases, not an average of percentages." The mean
of each site's own ratio, which is what the rollups did before, let a site
with a 0.1-inch median outvote a site with a 40-inch one: 19.8% of published
basin-days differed from the ratio of sums by more than ten points. A
site-day contributes when it has both a reading and a median; a site with
real snow where none is normal belongs in the numerator. The per-site
percentage stays a per-site statistic and keeps its own zero-normal guard.

**A ratio needs a denominator worth dividing by, and October does not have
one.** Where the summed normal behind a day's mean is under an inch
(`MEANINGFUL_NORMAL_INCHES`), the percentage still computes and still
publishes — it is honest raw data — but `curveForDrawing` refuses it a place
on the drawn curve, because a point that never appears as text acts only by
rescaling the axis. Before this floor reached the curve, one autumn day set
the Yakima axis to 1,400% over a winter that peaked at 68.9%. Headlines hold
a stricter floor still: at least half the area's sites reporting.

The floor is one predicate, `normalIsComparable`, and the map reads it too
(ADR-121): an area whose mean normal that day is under an inch, or a site
whose own normal is, takes no class and is drawn as "too little normal snow
to compare". **The season's peak** is the deepest day of the region's depth
curve among the days that clear both floors — half the sites reporting and a
comparable mean normal (`seasonPeak`). Before any day does, there is no peak
and the map opens on the newest day that met the reporting floor. The words
"season high point" belong to a finished season; a running one has "most
snow so far".

The payload's `method.version` names the estimator behind these figures; two
files written under different versions are not one series.

## Recent precipitation by drainage area

**An area's figure is the mean of its stations with a total** (ADR-131), by
ADR-129's rule: a station needs a reading on both days, and a falling gauge
total is left out, never counted as dry. An area needs as many such stations
as its snow reporting floor (`minimum_reporting_sites`), or it has no figure.
The map's breaks are amounts in inches, the same for 1, 3 and 7 days.

## The week's change in soil moisture

**The published figure is a change at the same sensors, never a level**
(ADR-142). A percent of the soil's volume is not comparable between two
soils, so `soil_moisture.json` carries each station's seven-day change in
percentage points and no median.

- **Station value:** the mean of the 2 in (or 4 in where there is no 2 in
  sensor), 8 in and 20 in readings for the day. All three or no value. A
  station without the three sensors is listed in `other_depth_sites` and
  not used.
- **Frozen soil:** a depth's reading is dropped on a day its soil
  temperature (`STO`) is at or below 32 °F, or has no temperature. The day's
  indices are in the station's `frozen_days`. No month is hidden: soil
  temperature is at nearly every station.
- **The week:** one end day for every station, the newest day on which nine
  in ten on-time stations have all three depths (ADR-129's set-day share);
  the start is seven days before. The change is the end value minus the
  start value, both rounded to a tenth first. No value on either day means
  no change and a `no_change_reason`.
- **Area value:** the mean of the stations with a change, held to the snow
  reporting floor (`MIN_ROLLUP_SITES`). The page regroups from the place's
  own stations (ADR-064); over every station that equals the file's
  `rollups`, summed in the file's order with half-up rounding on both sides.
- **Classes:** drier by 5 or more, 2 to 5, within 2, wetter by 2 to 5, 5 to
  10, 10 or more (`src/viz/soil-classes.ts`).

Not a claim to match the Natural Resources Conservation Service's own
basin percent-of-median maps, whose method is unpublished. Percent of median
over each station's own record is a later phase with its own record.

## Precipitation against its own history

**One fixed set of stations, and every number a mean over it** (ADR-125).
The precipitation page's card compares this water year with every
water year from 1991 through the last finished one, at the stations whose
gauge record covers all of them. A place's set is its stations in that
history that are not reporting late; the line, the bands, the median, the
history rank, the share of a median year and the snow water line are all
means over that one set. A station with no full history is counted in a
sentence and used nowhere. A day draws only when every station in the set
has a value on it.

**The history is weekly.** `tools/build_precipitation_history.py` stores 53
calendar days a year, 1 October and every seventh day to 30 September, so a
leap year compares 1 March with 1 March. A step with no reading may take the
latest reading from the three days before it, and the file counts how often
that happened; a step with nothing inside that window takes the station out
of the set. Nothing is repaired: a falling accumulation is kept as
published, and a borrowed reading never comes from before 1 October. Between
steps each year is read on a straight line, which moves a comparison by less
than one week's precipitation, and every day's band is taken from those
readings -- never by joining weekly quantiles, which gives a different number
for the same day.

**Band edges use one quantile rule**, linear between neighbours in the
sorted years (type 7): highest and lowest, 10th to 90th ("8 of 10 years"),
25th to 75th ("middle half"), and the median. A history rank is one plus
the years strictly above this one, compared to a tenth of an inch, so equal
years share a rank.

**Snow water is a split, not a line.** The headline's day is the newest on
which both precipitation and snow water are complete for the set, at most
two days back; that day's snow water splits the precipitation into what the
snow holds and what it does not. Snow water above the precipitation is stated
as gauge undercatch, never drawn as a negative.

**Inches lead.** Percent of median is printed only once the median for the
date reaches `MEANINGFUL_NORMAL_INCHES`, the snow curve's own floor; before
that the card gives inches, the difference from the median, and the share
of a median year's total.

**Storm totals are differences** (ADR-129). The card's 1-, 3- and 7-day
totals are each station's accumulation on the set day minus its value N days
earlier, meaned over every station in the place with both readings, not only
the fixed set. A falling difference leaves the station out and is never
clipped to zero; a window that starts before 1 October is not available yet;
totals are rounded to the gauge's tenth of an inch.

**The window is not the snow normal.** Snow compares with 1991–2020;
precipitation with 1991 through the last finished year, rebuilt each
October. A history is not a normal, and each card names its own years.

## The monthly normal window

**One chart, one baseline** (ADR-083). The recent monthly normal on the
twelve-month line is computed over calendar years strictly before the
*window's* earliest month, not before each month's own year. Cutting per
month let the window's later calendar year borrow one extra, recent year and
drew two baselines joined at 1 January. Each row publishes `normal_years`,
the count behind its median — every row of a chart names the same number,
because they share one population. The committed 1991–2020 normals are
untouched: they were built over a closed period by
`tools/build_normal_baselines.py` and have no seam to remove.

## Change intervals

**A change names the reading it is a change from.** "30-day change" is the date
the pipeline asks for; the reading it gets is the nearest one inside a
tolerance of ten days for a daily feed and forty-five for a month-end one, so
"change in 1 year" has covered 320 days to 410. `change_*_reference_date` and
`change_*_elapsed_days` publish the interval, and the details panel prints the
measured one whenever it differs from the name.

## Dates and calendars

**A monthly stamp names the month; the water was measured at its end.**
California's service dates a monthly storage value on the **first** day of the
month it describes, and the value is that month's **last** reading — verified
against the same station's daily series, where Oroville's monthly `2026-6-1` of
3,082,292 acre-feet is its 30 June reading and 1 June was 3,327,054.
`fetch_cdec_series` moves the date to the month's end, because every date this
pipeline publishes means when the water was measured: `days_stale` is computed
from it and ADR-056 withdraws 60 days past it. Left alone, all 33 monthly
California stations read 50 days late on the morning they were admitted and
would have been withdrawn as quiet feeds inside a fortnight, while reporting
normally. The Conservation Service's month-end feed already stamps the last
day, so there is one convention rather than two. **The calendar is corrected,
never the reading.**

**A day from a sub-daily provider is its last reading** (ADR-100). Three
providers publish far more often than daily -- the Salt River Project every
five minutes, Montana's Stream and Gage Explorer roughly every quarter hour,
the Army Corps of Engineers hourly on most of its Columbia Basin series
(ADR-102) -- and the estimator reads one value per date. That value is the day's final
observation: not a mean, which would put a derived statistic in a series of
measured ones, and not the reading nearest midnight, which selects across a
gap and lets a day borrow the day before's value.

The reduction sorts on the observation time. Sorting on the calendar day gives
every reading in a day the same key, and an unstable sort then returns an
arbitrary one: that defect published an 08:10 reading as a day's storage for
four reservoirs, across 4,348 of 4,388 committed days, and moved one history
rank from 66.7 to 100.0. The same rule governs the committed daily history,
where a refetched day must replace the cached one so a provider's own revision
can reach a reader.

## What may not be done to these numbers

**These reservoirs are not one population.** No fitted normal curve, no
standard deviation as an interpretive frame: they differ by size, purpose,
hydrology, operating rules and flood-control duty, so a flood-control reservoir
held deliberately low in spring sits in the same histogram bins as a supply
reservoir kept full. `distributionStats` publishes the mean, the median and the
middle half. The SDK's histogram offers no quantile overlay, so the key states
the middle half rather than drawing it.

**Never subtract two shares with different denominators** (ADR-046). A share of
land minus a share of reservoir capacity is not a quantity. Such a difference
may rank rows and may set the length of a line; it may not be printed as a
number or given a baseline.

## Area measurement

**`cos(lat)` is the sphere's exact area element, not a rough projection**
(ADR-055). The drought engine measures equal area already, so "move it to
Albers" is not an accuracy fix — measured, the area model is worth 0.004
points, against a rounding boundary of 0.05. Albers and geodesic agree on these
polygons to 0.1 ppm. **Geodesic is the measure of record for any area this
project states**, and it lives in `tests/test_area_model.py` as an oracle:
`geographiclib` is in `requirements-test.txt` and must never reach
`requirements-pipeline.txt`, which stays at numpy, pandas and requests. If the
published precision ever tightens past 0.1 of a point, reach for a finer step
first and exact clipping second — never for a projection.

**The sampling step is the term that mattered, and it has moved.** At 0.01
degrees, 59 of the 844 shares the drought engine publishes would round to a
different tenth than a fine reference gives. `DEFAULT_STEP` is 0.002, where
that falls to 5 — the engine's own floor, since those five sit on a rounding
boundary and no step settles them. It costs about 70 seconds a morning in a job
that otherwise waits on other people's services.
`tools/measure_drought_convergence.py` measures it again and writes nothing;
run it before moving the step. Passing `--output` to
`compute_drought_coverage.py` implies `--no-history`, because a trial run
redirected away from the committed coverage file used to rewrite the committed
archive anyway.

**The convergence study measures the sampler, not the inputs.** Both error
terms above were measured over the same polygons, so they say nothing about
the geometry itself. For the monitor's classes that term has now been measured
and removed: the feature layer's 0.001° simplification moved unrounded shares
by at most 0.038 points against the archive's full-resolution map, enough to
flip 47 of 5,955 published tenths, so `drought-coverage-3` reads the classes
from the archive map (ADR-122). The land mask is still fetched at roughly
100 m against a grid step of about 185 m of latitude, and no measurement here
bounds that part. ADR-037 put the drainage boundaries at about 56 m, below the
grid. Until the mask's tolerance is measured too, a step finer than 0.002°
buys nothing.
