---
description: ArcGIS/Calcite application rules — SDK boundaries, colour, layers, layout, readiness
globs: ["src/**/*.ts", "src/**/*.css", "*.html", "public/**"]
---

Read [`src/AGENTS.md`](../../src/AGENTS.md) — it is the scoped checklist — and
[`docs/architecture/frontend.md`](../../docs/architecture/frontend.md) for the
detail behind any item on it.

Highest-value reminders: no `@arcgis/core/widgets/*`; colour comes only from
`ReservoirViz.CLASSES`; visible text is Simplified Technical English including
`aria-label`s; runtime data is fetched, never imported; every wait has a
deadline and clears `aria-busy`; a readiness field is added and never
removed while the behaviour it reports survives, and is retired with its
control when that behaviour does not (ADR-090).

Before touching a component's props, read the `arcgis-dashboard-ui` skill's
`references/component-api-gotchas.md` — the renamed props, the `.d.ts` lookup
and the type-derivation workaround for the banned `widgets/*` specifier.

Anything a browser renders is verified with `npm run verify:browser`.
