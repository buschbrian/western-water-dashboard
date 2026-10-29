# ADR-142: Show the week's change in mountain soil moisture

- Status: Accepted
- Date: 2026-10-27
- Relates to: ADR-117 and ADR-125 (a new measured element needs its own
  record), ADR-008 (one colour table per measure), ADR-064 (an area's figure
  is regrouped from the place's own stations), ADR-081 (the snow reporting
  floor), ADR-129 (the set day), ADR-131 (the precipitation map), ADR-059
  (not measured is not unchanged)

## Context

The snow stations that measure snow water and precipitation also carry soil
moisture sensors. Readers asked how wet the ground is going into winter: a
storm that soaks dry soil makes less runoff in spring than one that falls on
wet soil. The Natural Resources Conservation Service publishes the readings
through the same keyless service the snow refresh reads.

What the service offers, probed 2026-10-26 and re-checked 2026-10-27:

- Element `SMS`, percent of the soil's volume, daily, at sensor depths
  below the ground. No median is returned.
- Of the 639 inventory stations, 393 list active daily soil sensors; 382 of
  those have the standard set (2 in or 4 in, 8 in, 20 in). Most carry
  2/8/20 in; Montana and some Pacific stations carry 4 in with no 2 in, and
  a few carry odd depths (11, 14, 16, 18, 24, 27, 32 in).
- On 2026-10-27, 369 of the 382 sent readings in the last fifteen days, and
  319 had all three depths. The 13 silent stations list sensors as active
  that have sent nothing for more than a year.
- Soil temperature (`STO`, degrees Fahrenheit) is listed at the same depths
  at 392 of the 393 stations, and was missing on 6 of 1,894 depth-days.

A volumetric percent is not comparable between two soils: 28% in a sand and
28% in a clay are different wetness. A change at the same sensor is
comparable.

## Decision

**The precipitation map gains a "Rain | Soil moisture" switch. In soil
mode it fills each drainage area by the mean seven-day change in soil
moisture of its stations, in percentage points, brown drier and blue
wetter.**

1. **Station value (decision R4).** The mean of the shallow (2 in, or 4 in
   where the station has no 2 in sensor), 8 in and 20 in readings for a day.
   A station without all three on a day has no value that day; a station
   without all three sensors is not used at all and is listed in the file
   with its depths.
2. **Frozen soil.** Frozen soil reads falsely dry. A depth's reading is not
   used on a day its soil temperature is at or below 32 °F, and not on a day
   it has no temperature. Soil temperature is at nearly every station, so
   the map is shown in every month and frozen stations drop out: in winter
   more areas are grey, and the page says how many stations were frozen.
3. **The change.** End-day value minus the value seven days before, in
   percentage points to a tenth. One end day for every station: the newest
   day on which nine in ten of the on-time stations have all three depths,
   ADR-129's set-day share. A station without a value on both days has no
   change and the file says why (a missing reading, frozen soil, or no
   temperature).
4. **Area value (decision R5).** The mean of the stations with a change,
   held to the area's snow reporting floor (`MIN_ROLLUP_SITES`, 2). The
   refresh publishes whole-area figures; the page regroups from the stations
   in the place it shows (ADR-064) and a test holds the two equal over every
   station.
5. **Classes (decision R6).** Drier by 5 or more, drier by 2 to 5, within 2
   (steady), wetter by 2 to 5, 5 to 10, 10 or more. A new table,
   `src/viz/soil-classes.ts`, whose two ends are the snow table's two ends
   and whose four middle colours were measured for lightness order,
   colour-vision separation of neighbours, translucent-fill visibility and
   distance from the storage, drought and drought-change colours.
6. **One map (decision R7).** The switch sits above the day buttons on the
   precipitation map. Soil mode has its own key, a "most change" list of
   eight stations, a sentence counting the place's stations by direction,
   and a values table; the day buttons and the rain list hide. The same map,
   areas and points are reused, so a phone loads one map SDK and one set of
   areas. The soil file is fetched the first time a reader turns the switch.
7. **Pipeline.** `refresh_soil_moisture.py` writes `soil_moisture.json`,
   fifteen days, as step 5c of the daily refresh, after the terminal lakes.
   A failure keeps the last complete file. It refuses the day when more than
   a tenth of the stations with the standard sensors send nothing; the snow
   refresh's two percent would refuse every day while the long-silent
   stations stay listed as active.

## Rejected

- **Percent of median now.** A level needs a history build over each
  station's own record (about twenty years; these sensors do not cover
  1991-2020) and a choice of depth weights. That is phase 2, with its own
  record. NRCS's own basin percent-of-median method is not documented in
  anything found; this map does not claim to match theirs.
- **Publishing the level.** 28% means different wetness in different soils,
  so a map of levels would colour soil texture as much as water.
- **A depth-weighted mean.** No published weights were found; an equal mean
  of three standard depths is the simple rule a reader can check.
- **Folding soil into the snow request.** A soil failure would then cost the
  snow payload.
- **A season gate.** The plan allowed for showing the map only in autumn and
  spring if soil temperature were missing at most stations. It is present at
  392 of 393, so dropping frozen readings day by day is the honest rule and
  no month is hidden.
- **A second map.** Two map SDK views and two boundary sets on a phone, for
  one place.

## Consequences

- A new daily file, 161 KB raw and 26.8 KB gzipped on its first run, fetched
  only by a reader who turns the switch.
- On the first run 303 of 369 stations had a change, 6 were frozen, and 35
  of the 51 drainage areas with snow stations had a soil figure: 6 have no
  soil station with the standard sensors and 10 have fewer than two with a
  change.
- The switch is not in the link. A shared link opens on rain.
- Phase 2 (percent of median for the date over each station's record, a
  history builder rebuilt each October) needs its own record.
