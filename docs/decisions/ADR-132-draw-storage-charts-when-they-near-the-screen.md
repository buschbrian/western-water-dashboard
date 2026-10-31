# ADR-132: Draw the storage charts when they near the screen

- Status: Accepted
- Date: 2026-10-26
- Relates to: ADR-090 (readiness fields), the "a chart that drew nothing
  says so" check (1.2.0)

## Context

The storage charts page built all five ArcGIS charts at load, each from its
own client-side layer, and again on every filter change, whether a chart was
on screen or not. Traced at 390 px on a desktop CPU, the main thread was
busy for about 13 seconds after load; the hot code was the charts package's
own layout loop. A phone CPU is several times slower. The browser suite did
not see it: it waits for readiness, not for an idle page.

## Decision

**A chart draws when its card comes within one screen of view. A filter,
measure or theme change redraws the charts near the screen now and leaves
the others to draw when they near it.**

- Each host is in one state: `drawn`, `empty`, `failed`, `deferred` or
  `pending`. Readiness reports all five counts, and they always add up to
  `charts`. `chartsDrawn` and `chartsFailed` keep their meanings.
- A chart is rebuilt, not reused, when it draws again. Its selection
  handlers, tooltips, axes and theme are set when it is built, and record
  ids are reassigned by rank on every update.
- Both readiness writers merge into one object.

Measured after the change at 390 px: one chart drew at load, five waited,
and the main thread was busy about 3.4 seconds in all and idle from the
fourth second.

## Rejected

- **Reusing charts across filter changes.** Faster again, but a retained
  bar chart's click handler would open the reservoir that held that rank
  before the filter. It needs its own proof of the full update contract.
- **Hand-built charts on phones.** The spread chart already is one
  (ADR-075); replacing five more is a larger change than the fault needs.

## Consequences

- A test that checks every chart scrolls each one into view first
  (`drawEveryChart` in the browser suite).
- A chart off screen can show the previous filter's drawing until it nears
  the screen; the margin is one screen, so it is redrawn before it is seen.
