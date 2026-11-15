# ADR-172: Publish Pyramid Lake from its monthly field readings

- Status: Accepted (Brian Busch, 2026-11-15)
- Date: 2026-11-15
- Extends: ADR-112 and ADR-118 (terminal lakes), ADR-159 (a level without a volume)
- Relates to: ADR-056 (freshness)

## Context

ADR-159 made a lake's volume optional, which removed the reason Pyramid Lake
was first held. It stayed held for its update schedule: the terminal-lake
roster required a daily series, and the U.S. Geological Survey publishes
Pyramid Lake's level (USGS-10336500, PYRAMID LAKE NR NIXON, NV, parameter
00062, feet above NGVD29) only as field readings about once a month. Rechecked
on 2026-11-15: 81 readings in the v1 `field-measurements` collection from
2016-11-01 to 2026-11-02, 22 in the last 24 months, a median of 31 days apart
and at most 89 (2025-09-03 to 2025-12-01). The daily collection has none. The
Natural Resources Conservation Service lists the same readings, so it is not a
second source. No daily series was found from any other operator.

## Decision

**Publish Pyramid Lake as a monthly level.** Brian Busch chose this on
2026-11-15 over keeping it held.

- The roster accepts `cadence: "monthly"` for a lake read at one site, with
  its level alone and `elevation.collection: "field-measurements"`. The loader
  refuses a monthly lake with a volume or arms, and a daily lake that names
  that collection.
- `refresh_lakes.py` reads the readings through
  `fetch_usgs_field_measurements`, screened as the daily adapter screens.
- The record carries `data_frequency: "monthly"` and is late after 45 days,
  the limit the month-end reservoir feeds already use; it is withdrawn after
  60 like every other record (ADR-056).
- The level's summary is the existing one. With readings a month apart there
  is no 7-day change; the 30-day and 365-day changes are published with their
  reference dates when a reading falls inside the tolerance, and the same-date
  rank counts the earlier years that have a reading near the date.
- The page says how often the lake is read and when a reading is late.

## Rejected alternatives

- **Keep it held.** The level is measured and current to the month; a stated
  schedule is better than a missing lake.
- **A daily late threshold.** It would mark the lake late almost every day.
- **Interpolate between readings.** That would publish values nobody measured.

## Consequences

- A gap as long as last autumn's 89 days withdraws the lake to a notice until
  the next reading, as for any record past 60 days.
- The record of this site starts in 2016, so extremes and the rank rest on ten
  years.
- `lakes.json` gains the lake at the first refresh after merge.
