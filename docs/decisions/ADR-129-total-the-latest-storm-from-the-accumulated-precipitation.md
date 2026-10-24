# ADR-129: Total the latest storm from the accumulated precipitation

## Status

Accepted

## Date

2026-10-24

## Relates to

ADR-125 (precipitation at the snow stations against a fixed history; its
set-day rule and its refusal to lead with a percent), ADR-116 (a reading is
excluded, never repaired), ADR-006 (visible language), ADR-008 (colour comes
from the approved tables), ADR-090 (readiness fields).

## Context

After a storm, readers ask how much fell. The precipitation card answers a
different question: how much since 1 October, against history.
`precipitation.json` (schema version 1) already holds every station's daily
accumulation since 1 October, so the precipitation of the last few days is
the difference of two values in that file. No pipeline change is needed.

Three properties of the accumulation decide the method:

1. **It can fall.** A gauge is reset, a value is corrected, or a storage gauge
   loses water to evaporation. On 2026-10-24, 114 of 632 stations had at least
   one falling step since 1 October. For Utah on that day, 9 of 140 stations
   fell between 22 and 23 October.
2. **It restarts on 1 October.** A window that reaches back before the first
   date in the file has no start value.
3. **It is measured in tenths of an inch.** A total of 0.1 inch is one step
   of the gauge.

## Decision

**The card leads with the precipitation of the last 1, 3 and 7 days, each a
mean over the stations in the chosen place, followed by a short ranked list
of the stations with the most precipitation.**

1. **A station's total is a difference.** For a window of N days ending on
   day E, the total is the accumulation on E minus the accumulation on
   E − N days. Both readings must exist. A station without either one is
   left out of that window and counted.
2. **One end day.** E is ADR-125's set day, taken over the place's stations
   that report on time: the newest day on which at least `SET_SHARE` of them
   have a reading. Every window ends on E, and the card names the date.
   Stations whose newest reading is older than E have no value on E and are
   left out.
3. **A fall is not a measurement.** A negative difference leaves the station
   out of that window, and the card counts it with a sentence that says why.
   It is never clipped to zero, which would count a broken reading as a dry
   station and lower the mean.
4. **No window starts before 1 October.** If E − N days is before the first
   date in the file, the window is not available yet. The card says so and
   gives the first date it will be available. It never gives a shorter
   window under the longer name.
5. **Tenths of an inch.** Each station's total and the mean are rounded to
   0.1 inch. A mean above zero that rounds to zero is shown as "Less than
   0.1 in", and the card states that 0.1 inch is the smallest step a gauge
   measures.
6. **The headline is a mean, with its count.** Each window's figure is the
   mean of its contributing stations' totals, labelled "Mean of N stations".
   The count can differ between windows because a station can be left out
   of one window and not another.
7. **Every station in the place counts, not only the fixed set.** ADR-125
   uses a fixed set so that every past year is the same stations. A storm
   total compares nothing with the past, so that reason does not apply here.
   Every station in the chosen place with both readings counts, whether or
   not it has a full history. A place with no station in the fixed set still
   gets storm totals.
8. **No percent.** A storm total has no median to divide by, and ADR-125's
   reason for not leading with a percent applies here as well.
9. **The ranked list is short.** The eight stations with the most
   precipitation in the chosen window (1, 3 or 7 days; 3 by default), with
   the drainage area and inches. Stations with a total of zero are not
   listed. Each name selects the site in the same way as the site table.
   No bars.

## Rejected alternatives

- **Clip a fall to zero.** It keeps the station count steady, but it
  publishes a value the gauge did not measure.
- **Treat 1 October as zero and shorten an early window.** The accumulation
  does start at zero then, but a "last 7 days" that is really four days is
  a different figure with the same name.
- **Each station's own latest date as its end.** The windows would then
  cover different days at different stations, and the mean would mix them.
- **Limit the totals to ADR-125's fixed set.** This would drop about half
  the stations for a figure that makes no comparison with the past.
- **A sum across stations.** A sum grows with the number of stations in
  the place. A mean is a figure one station could have measured.
- **Show storm totals on the map.** This would need a new colour ramp and a
  new map mode. Colour comes only from the approved tables (ADR-008), and
  a new symbology needs its own decision. That is left for later.

## Consequences

- The card's readiness field `precipitation` gains `storm`: `window`,
  `endDate`, `available`, `stations`, `leftOut` and `rows`. No field is
  removed.
- The computation is `src/precip-storm-model.ts`, tested with synthetic
  payloads read through the real validator. ADR-125's set-day rule moved
  into one shared function, `newestSetDay`, which both use. Its result is
  unchanged.
- The storm totals end on their own set day. This is the same rule over a
  larger set of stations, so it is normally the same day as the season
  figures below. If the two days are different, each figure states its own
  date.
- On 2026-10-24, for Utah: 0.2 inch in the last day (mean of 130 stations,
  9 left out with a fall), 1.4 inches in the last 3 and 7 days (mean of
  139 stations), ending 23 October.
