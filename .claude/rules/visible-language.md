---
description: Simplified Technical English vocabulary for anything a reader can see (ADR-006)
globs: ["src/**/*.ts", "*.html", "src/styles/**", "docs/**"]
---

**Visible text is Simplified Technical English** (ADR-006). This covers page
copy, button labels, `aria-label`s, live-region messages and chart titles —
everything the smoke suite reads.

The habits, the generic ArcGIS jargon and the keep-list are the
`arcgis-dashboard-ui` skill's `references/simplified-technical-english.md`.
The table below is this project's own.

Never write, where a reader can see it:

| Never | Write |
|---|---|
| `af` | acre-feet |
| `period-of-record` | highest recorded storage |
| `stale` | late data |
| `cadence` | update schedule |
| `seasonal percentile` | history rank |
| `restricted`, `operating restriction` | held below its full level |
| `run-of-river`, `navigation pool`, `pondage` | kept at a steady level |
| `flood space`, `flood control pool`, `gross pool` | space kept empty for floods |
| `conservation pool` | normal full level |
| `surcharge` | water held above the full level |
| `spillway crest` | the top of the spillway |
| `dead pool` | water that cannot be released |
| `stage` | water level |
| `area-capacity table`, `elevation-storage curve` | the table that turns a water level into a volume |
| `physical capacity` | what the reservoir can hold |
| `RISE` | Bureau of Reclamation |
| `AWDB` | Natural Resources Conservation Service |
| `CDEC` | California Department of Water Resources |
| `CDSS` | Colorado Division of Water Resources |
| `USGS`, `NWIS` | U.S. Geological Survey |
| `USACE`, `CWMS` | U.S. Army Corps of Engineers |
| `DSOD` | California Division of Safety of Dams |
| `FERC` | Federal Energy Regulatory Commission |

Also: no `text-transform` in `src/styles/` or the pages — `innerText` returns
what CSS transformed, so an uppercase label is what a screen reader says.

The three sentences the operating characters publish (ADR-114):

- **held below its full level** — "A dam safety order holds this reservoir
  below its full level. The order started on May 27, 2015."
- **kept at a steady level** — "The operator keeps this reservoir at a steady
  level all year. Its percent full changes very little."
- **space kept empty for floods** — "This reservoir keeps space empty to catch
  floods. It is not expected to fill."

`restricted` is refused as a visible word for a second reason beyond being a
term of art: in everyday use it means restricted *access*, which is wrong for a
reservoir people fish in.

Enforced by `src/content-language.test.ts` and `tests/smoke-modern.mjs`. One
row is guidance rather than a check: `stage` cannot be a test rule because
"percentage" contains it. Machine identifiers stay quoted in API documentation
(ADR-026).
