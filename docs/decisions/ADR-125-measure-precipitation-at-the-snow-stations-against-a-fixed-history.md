# ADR-125: Measure precipitation at the snow stations against a fixed history

## Status

Accepted

## Date

2026-10-24

## Relates to

ADR-117 (the scope is closed at 1.0.0; a new measured domain needs its own
record), ADR-021 (snow telemetry has a view of its own), ADR-052 (the snow
calendar is written once), ADR-081 (snow's summed ratio and the denominator
floor), ADR-097 (snow filtered by the upstream set).

## Context

The chart shared most widely about western water each autumn is the
Conservation Service's precipitation accumulation chart: the water year's
precipitation, added up from 1 October, over bands for the highest, lowest
and median years. It is useful, and it has four faults a reader cannot see:

1. **The years are different networks.** Each past year is drawn from the
   stations that reported that year. The chart that prompted this record
   listed 93 sites for 2003 and 115 for 2026. A band edge can move because a
   station joined, not because it rained.
2. **The percentage leads in October.** "295% of median" on 24 October
   divides about four inches by about one and a half. The snow page already
   refuses that ratio a place on its curve (ADR-081's floor); the shared chart
   puts it in the headline.
3. **It cannot tell rain from snow.** Precipitation is what the gauge caught.
   A warm October storm can bring a station to four times its median with
   almost no snow on the ground: one station measured while scoping this held
   12.0 inches of precipitation and 0.5 inches of snow water.
4. **Its basins are fixed.** It answers for the Conservation Service's named
   basins, not for the places this site already lets a reader choose.

The stations are the ones this site already reads. Every station in
`snow_sites.json` is a SNOTEL site, and the same service that serves their
snow water (`WTEQ`) serves their gauge precipitation (`PREC`).

Measured on 2026-10-24: a sample of 30 stations had a complete daily `PREC`
record for every water year 1991 to 2026 wherever the record began before
October 1990; two of the 30 needed one weekly step each read from a day
earlier. The full build is reported under Consequences.

ADR-117 closed the scope at 1.0.0 and names "a new measured domain" as work
that needs its own record. This is that record.

## Decision

**Precipitation joins the snow page as a card of its own, measured at the
snow stations, compared only with the same stations' own history.**

1. **A fixed set of stations.** A station enters the history only if its
   record covers every water year in the window, 1991 through the last
   finished year. A place's figures are a mean over its stations in that
   set, so every year in the bands is the same stations and a band is a
   statement about weather.
2. **One set answers everything on the card.** The line, the bands, the
   median, the history rank, the share of a median year and the snow water
   are all means over the same stations: the place's stations with a full
   history and no late data. A station with no history, or reporting late,
   is counted in a sentence and left out of every figure.
3. **Inches lead; the percentage follows the floor.** The headline is inches
   since 1 October against the median for the date. Percent of median is
   printed only once the median for the date reaches
   `MEANINGFUL_NORMAL_INCHES`, the snow page's own floor.
4. **Snow water is stated beside the headline, not drawn on the chart.** The
   same stations' mean snow water on the headline's day, from
   `snowpack.json`, splits this year's precipitation into one bar: the part
   held as snow water now, and the part that is not (rain, or snow that
   melted). The headline's day is the newest on which both measurements are
   complete for the set, stepping back at most two days. A first version drew
   snow water as a second line on the precipitation axis; two measurements on
   one axis read as two kinds of precipitation, and it was taken off.
5. **The chart opens on the season so far.** It shows 1 October to four weeks
   past the newest reading (at least eight weeks), with the vertical scale
   fitted to that window; a reader can switch to the whole water year. On a
   whole-year scale the first weeks of a season are a flat line at the
   bottom of the chart, which is where an autumn reader is looking.
6. **History is weekly, stored, and rebuilt in October.**
   `tools/build_precipitation_history.py` keeps each station's accumulation
   on 53 calendar days a year (1 October, then every seven days to 30
   September), in tenths of an inch as step changes, and the browser sums
   any place from it by the same rule as the daily line. Between steps each
   year is read on a straight line, and the bands for every day are taken
   from those readings, so the chart, its readout, the table and the
   headline give one number for one day. The methods page says so. A missing
   step may borrow from the three days before it, never from before 1
   October.
7. **The daily file is separate.** `refresh_station_readings.py` writes
   `precipitation.json` from the same inventory and the same request shape
   as the snow refresh, importing its fetch and missing-station tolerance. A
   failure costs this file and never `snowpack.json`.
8. **One quantile rule.** Band edges and the median are read from the sorted
   years on a straight line between neighbours (the common "type 7" rule).
   A history rank counts the years strictly above this one; years with the
   same value, to a tenth of an inch, share a rank.

## Rejected alternatives

- **Copy the Conservation Service chart.** It would bring all four faults
  above, and the site would be repeating a figure it can see is
  misleading.
- **Use the Conservation Service's daily median.** The service returns a
  median per station per day, which would avoid the history file. It is a
  median over each station's own years, so a place's summed median mixes
  stations of different ages; and it gives no bands and no rank. One
  population for every number is the point of the card.
- **Keep the window at 1991–2020, the snow page's normal.** It would match
  the snow normals and drop the six most recent years, including 2023, from
  the bands a reader most wants to compare against. A precipitation history
  is not a normal and is labelled by its own window.
- **Compute bands per named area in the pipeline.** Smaller, but the snow
  page lets a reader choose a state, any of four area sizes and an upstream
  set; precomputed bands would cover some of those and not others, and a
  second implementation of the rule would drift from the first.
- **Let each year use whichever stations reported.** This is the fault the
  record exists to remove.
- **A precipitation page of its own.** ADR-117 names a new computing page as
  out of scope, and precipitation read away from the snow it becomes is the
  misreading this card is built to prevent.

## Consequences

- The first full build, 2026-10-24, for water years 1991–2026: **368 of 639
  stations** cover every year. 270 do not, 59 of them stations whose record
  began before October 1990 but has one gap past the three-day rule, most of
  those gaps since 2021; one station has no gauge. 21 stations took 23 steps
  from a day or two earlier, and 56 steps fall rather than rise and are kept
  as published. Every region and state has stations in the set; one basin
  of 51 has none.
- Two new files are published: `precipitation.json` daily (9 KB gzipped)
  and `precipitation_history.json`, rebuilt each October (1,639 KB raw,
  **488 KB gzipped**, the largest file the snow page can load). The card
  fetches both only when it nears the screen, so a reader who opens the page
  for the map does not pay for the history. Neither file has an `/api/`
  alias yet; adding one is a change to the public contract and is left for
  its own decision.
- The gap rule is the setting most worth revisiting: allowing a station one
  missing week would bring back most of the 59, at the cost of a year in
  which that station's step is not measured.
- The daily refresh gains step 5a. Its failure keeps yesterday's file.
- The history window grows by one year each October, and the fixed set can
  only shrink when it does: a station that stops reporting leaves the set,
  and the file names it with its reason.
- A place where no station has a full record says so and draws nothing,
  rather than drawing a short history.
- The snow page's readiness object carries a `precipitation` field for the
  card's own load and the range it shows.
- The record was first drafted as ADR-122 and renumbered before merge, when
  `feat/drought-decade` was found to hold ADR-122 and ADR-123.
