# Draft report: `arcgis-chart` puts `aria-label` on an element with no role

Where to file: Esri Support or the ArcGIS Maps SDK for JavaScript board on
Esri Community. Tracked here as issue #16. Not filed yet.

## Summary

axe-core (WCAG 2.1 AA) reports `aria-prohibited-attr` on every `arcgis-chart`:
an inner `div` carries `aria-label` and has no role, so the label is ignored
by assistive technology. Seen on `@arcgis/charts-components` 5.1.22 and
5.1.27, three charts per page, at every width we test.

## Steps to reproduce

1. A page with one `arcgis-chart` bound to a `FeatureLayer` and a bar chart model.
2. Run `axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] })`.
3. Read the `aria-prohibited-attr` violation; its node is inside the chart.

## Suggested fix

Give the labelled element a role that permits a name (`role="img"` for the
drawn chart, or `role="figure"` on its container), or move the label to the
named container.

## Our workaround

One narrow axe exception scoped to `arcgis-chart`
(`tests/smoke-modern.mjs`, `AXE_EXCEPTIONS`); each chart also sits in a
section named by our own heading.
