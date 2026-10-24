# Draft report: Calcite 5.2 `light-dark()` tokens stop every arcgis-chart from drawing

Where to file: Esri Support case or the ArcGIS Maps SDK for JavaScript board on
Esri Community (charts-components has no public issue tracker); cross-post a
short note on the Calcite Design System GitHub repository, since the trigger is
a Calcite token change. Not filed yet.

## Summary

With `@esri/calcite-components` 5.2.x installed, every `arcgis-chart`
(`@arcgis/charts-components` 5.1.27) draws its legend and no marks, and the
console reports:

```
Uncaught Error: Unknown color syntax: light-dark( #ffffff, #2b2b2b )
```

With Calcite 5.1.2 and nothing else changed, the same charts draw normally.
`@arcgis/charts-components` declares `"@esri/calcite-components": "^5.1.1"` as
its peer range, so npm installs 5.2 without warning.

## Environment

- `@arcgis/core`, `@arcgis/map-components`, `@arcgis/charts-components`,
  `@arcgis/common-components` 5.1.27
- `@esri/calcite-components` 5.2.0 (fails) and 5.1.2 (works)
- Chrome 155 on Linux, desktop; Vite 8 build. Not theme-specific: both light
  and dark mode fail.

## Steps to reproduce

1. A Vite page importing `@esri/calcite-components/main.css`,
   `@arcgis/charts-components/components/arcgis-chart` and `@arcgis/core`.
2. Create a `FeatureLayer` with any numeric field, build a bar chart model
   with the charts setup utilities, and assign `chart.layer` and `chart.model`.
3. Install `@esri/calcite-components@5.2.0`; load the page in desktop Chrome.

Expected: bars draw. Actual: legend only; the error above, repeated per chart.

## Root cause (from the shipped bundle)

`dist/cdn/QRY6QKVG.js` contains amCharts' `Color.fromAny`, which accepts a
`#hex` or `rgb(...)` string and otherwise throws `Unknown color syntax`. The
charts read Calcite theme tokens as custom properties
(`--calcite-color-foreground-1/-2/-3`, `--calcite-color-text-1/-3`,
`--calcite-color-border-1/-2`, `--calcite-color-brand`,
`--calcite-color-brand-hover`, `--calcite-color-background`). A custom
property's computed value is its declared text, so under Calcite 5.2, which
declares these as `light-dark(<light>, <dark>)`, the parser receives the
unresolved `light-dark(...)` string.

`@arcgis/map-components` (`dist/cdn/XDQDTW2I.js`) carries the same parser and
message; we have not measured whether any map component reads Calcite tokens
through it.

## Suggested fix

Resolve each token through the browser before handing it to amCharts:

```js
function resolveColor(token, host) {
  const probe = document.createElement("span");
  probe.style.display = "none";
  probe.style.color = `var(${token})`;
  host.append(probe);
  const rgb = getComputedStyle(probe).color; // always rgb()/rgba(), scheme-aware
  probe.remove();
  return rgb;
}
```

This also covers `color-mix()`, `oklch()` and named colours. Separately, please
narrow the peer range to the Calcite minors the charts are tested against, so a
package manager reports the mismatch instead of shipping it.

## Our workaround

Calcite pinned to `~5.1.2`, with a unit test that fails if the lockfile moves
off 5.1, released as Western Water Dashboard 1.1.1 on 2026-10-24.
