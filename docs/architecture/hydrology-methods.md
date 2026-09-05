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

## Natural terminal lakes

A natural terminal lake is a separate water type (ADR-112). It may publish
elevation, volume, change and same-date seasonal rank where those measurements
are traceable. It has no dam point, capacity or percent full and is excluded
from every reservoir rollup. A restoration level is labelled as a target with
its authority and date rather than represented as capacity.

The first lake has not yet been added. Walker Lake is the implementation
candidate because USGS publishes both elevation and volume and documents the
stage-capacity relation. Great Salt Lake requires an arm-aware representation;
one point and one total would collapse separately measured waters.

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

The payload's `method.version` names the estimator behind these figures; two
files written under different versions are not one series.

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
terms above were measured over the same simplified polygons, so they say
nothing about the geometry on the other side: the Drought Monitor classes and
the land mask are fetched at roughly 100 m against a grid step of about 185 m
of latitude — the same order — and no measurement here bounds that term. ADR-037
put the drainage boundaries at about 56 m, below the grid; the monitor's classes
and the mask are not at that resolution. Until the geometry tolerance is
measured too, a step finer than 0.002° buys nothing worth its seventy seconds.
