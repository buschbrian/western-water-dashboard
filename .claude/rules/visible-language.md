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
| `RISE` | Bureau of Reclamation |
| `AWDB` | Natural Resources Conservation Service |
| `CDEC` | California Department of Water Resources |
| `CDSS` | Colorado Division of Water Resources |
| `USGS`, `NWIS` | U.S. Geological Survey |
| `USACE`, `CWMS` | U.S. Army Corps of Engineers |

Also: no `text-transform` in `src/styles/` or the pages — `innerText` returns
what CSS transformed, so an uppercase label is what a screen reader says.

Enforced by `src/content-language.test.ts` and `tests/smoke-modern.mjs`.
Machine identifiers stay quoted in API documentation (ADR-026).
