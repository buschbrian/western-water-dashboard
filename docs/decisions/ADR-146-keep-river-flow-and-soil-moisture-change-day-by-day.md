# ADR-146: Keep river flow and the soil-moisture change day by day

- Status: Accepted
- Date: 2026-10-31
- Extends: ADR-136 (daily river flow), ADR-142 (the week's soil-moisture change)
- Relates to: ADR-135 (`elevation_history.json`, the layout reused), ADR-144
  (the river classes)

## Context

`rivers.json` holds 30 days at each gauge and `soil_moisture.json` holds 15 days
of readings and one week's change. Each refresh overwrites the last. A later
chart or analysis cannot look back further than those windows, and the soil
figure published on a past day exists nowhere once the next refresh runs.
`elevation_history.json` already solves this for reservoir levels. Brian ruled
on 2026-10-31 (desk card D1) to keep a daily history for both and to document
the files in the data reference.

## Decision

**Two new generated files, written by the same scripts that write their
payloads, in the layout of `elevation_history.json`.** Each keeps a `start`
date and dense columns: position n is the date n days after `start`, and null
is a day with no value. They are compact JSON, published under `data/` and
`api/`, and fetched by no page yet. `pipeline/daily_history.py` holds the
decode, merge, encode and atomic write. `pipeline/river_history.py` and
`pipeline/soil_history.py` hold each file's shape and validator. Each refresh
script calls one function after its payload is written. `rivers.json` and
`soil_moisture.json` do not change.

**`river_history.json`.** One entry per gauge: the daily mean flow, the review
status and the qualifiers of each day, and for a natural gauge the flow class
of each day. The class is kept because `river_normals.json` is not published,
so a reader of the history could not work it out. The 10th to 90th percentiles
are not copied: they are one function of the calendar date and add size for
no new information. A class is the class when the day was last written, so
rebuilt percentiles change the last 30 days at the next refresh and leave
older days as they were.

**`soil_moisture_history.json`.** One column per drainage area and per refresh
date: the mean change in percentage points as `soil_moisture.json` published
it, the stations with a change and the stations in the area. At file level it
keeps the day each change ended on and the station counts. The grain is the
drainage area, not the station. The Natural Resources Conservation Service serves
every station's full record on request. Only this site knows the figure it
published on a given day, and that figure is what the page and a later chart
show. A station-level history would cost about 550 KB a year raw and can be
added by a later record if an analysis needs it.

**Merge by date.** A run replaces every date it reports and keeps every other
date. A re-run on the same data changes nothing. A revision by the provider of
a past day, inside the 30-day river window, replaces that day. A river day the
provider leaves empty keeps its stored value. A gauge carried forward late adds
nothing, and a gauge that leaves `rivers.json` for old data keeps its days.

**Keep everything.** Measured with 7 gauges and 45 areas on worst-case noisy
values, at gzip level 6:

| File | 1 year raw / gzip | 5 years raw / gzip |
|---|---|---|
| `river_history.json` | 83 KB / 10 KB | 383 KB / 42 KB |
| `soil_moisture_history.json` | 161 KB / 22 KB | 785 KB / 100 KB |

No window is cut. A deleted day cannot come back, and the cost is small
against `snowpack.json` at 304 KB gzipped.

**Seed.** The river file starts with the 30 days `rivers.json` held on
2026-10-31. The soil file starts with one date, the first run. The earlier
published figures are in no file, and recomputing them would give numbers this
site never published.

**Failure.** A history that fails its validator, or cannot be written, leaves
the last complete history file in place and makes the script exit non-zero. The
payload written just before it stays.

## Consequences

- Two entries in `data/generated-files.json`, class generated-daily, staged by
  the daily refresh. The Pages build copies and verifies both.
- The data reference documents both files and completes the cards for
  `rivers.json`, `soil_moisture.json` and `elevation_history.json` with an
  example record. `river_normals.json` is not published and has no card.
- No runtime validator in `src/` yet, because no page fetches either file. The
  first page that does adds one beside `elevation-validate.ts`.
- A soil history gap is permanent: a missed morning is not rebuilt.
