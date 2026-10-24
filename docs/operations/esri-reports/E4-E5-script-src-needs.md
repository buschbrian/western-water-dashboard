# Draft report: the SDK requires a permissive `script-src`, and fails silently without it

Where to file: Esri Support or the ArcGIS Maps SDK for JavaScript board on
Esri Community, as an enhancement with one defect inside it (the silent
failure). Tracked here as issue #17. Not filed yet.

## Summary

A static site that wants a strict Content Security Policy cannot have one with
the SDK, for two reasons:

1. Worker code loads from `js.arcgis.com`, so `script-src` must allow
   `https://*.arcgis.com` even when the application bundles the SDK. Without
   it, a page with `arcgis-chart` never becomes ready, and **no CSP violation
   or error explains why** -- the worker import fails quietly
   (`@arcgis/core/core/workers/WorkerOwner`). That silence is the defect.
2. `@arcgis/charts-components` compiles JSON schemas with `new Function`, so
   `script-src` must include `'unsafe-eval'`; without it the console shows
   `Error compiling schema`.

Measured on `@arcgis/core` and `@arcgis/charts-components` 5.1.22 and 5.1.27.

## Steps to reproduce

1. Build a page with `arcgis-chart` (and one with `arcgis-map`) and serve it
   with `<meta http-equiv="Content-Security-Policy" content="script-src 'self' blob:">`.
2. Observe the chart page never draws and logs no violation; add
   `https://*.arcgis.com` and it draws; remove `'unsafe-eval'` and observe
   `Error compiling schema`.

## Asks

- Self-hostable worker code (a documented assets option) so the CDN allowance
  is not required for bundled applications.
- A schema validator that does not need `eval` (precompiled validators).
- Report a failed worker import as an error, so the cause is visible.

## Our workaround

Every page's CSP allows `'unsafe-eval'` and `https://*.arcgis.com`; a comment
in `index.html` says how little injection protection that leaves. Re-measured
on each SDK upgrade.
