# ADR-162: Show upstream conditions without claiming inflow

- Status: Accepted; implementation local, not released
- Date: 2026-11-11
- Extends: ADR-097, ADR-125, ADR-127, ADR-129, ADR-161

## Context

Item 12 of the authorized November product-review plan asks for mountain
gauge catch and snow water above a reservoir, a precipitation link narrowed
to that same committed set, and 30-day context for Powell and Mead. A shared
time axis is useful context but cannot establish causality or travel time.

## Decision

The reservoir page adds **Rain and snow upstream** for a trace with mountain
sites. It reads `upstream_index.json` membership, never a guessed basin or
nearby gauge. The seven-day catch uses `stormTotals` unchanged, including its
set day and refusal of falling accumulations. Catch since October 1 is the
mean of on-time member stations reporting on the newest 90% set day. Snow
water is the existing `regionDepthCurve` mean at on-time member stations,
on the newest day with 90% reporting. Zero snow is a reading. Every figure
states its own date and reporting count; absent stations and a place filter's
intersection are different facts. These are station means, never area means,
volumes delivered, or a sum across gauges. No historical normal is computed
on the reservoir page.

The card keeps this sentence: “These measurements do not show where the
water went. They are not reservoir inflow and do not show the cause of a
change in storage.” It links to the full precipitation and snow pages for
their historical comparisons. The large files load only near the card.

The precipitation page accepts page-local `?upstream=<source_station_id>`.
As on Snowpack, it intersects the resolved place. Reservoir links include
`state=all`, so a stored preference cannot narrow them. The page reports
the active set, offers a clear control, and states when a screened, unknown
or unavailable trace leaves the chosen place in view instead. Upstream is
not portable state, changes no drawn, roster or opening scope, and never
opens the first-visit chooser. A general story embed is not offered for an
upstream-filtered view because that story's URL contract has no upstream set.

Powell and Mead additionally have a lazy 30-day view ending on the reservoir
payload's generation date. Mountain catch, each of the four reviewed rivers
toward Powell, the reservoir's available inflow and total release, and its
reviewed level are aligned by calendar date in separate plots. Every plot
names its unit, source and scale and has daily values in text. Missing dates
stay gaps; missing Mead inflow stays unavailable. The four rivers remain
labelled as flowing toward Powell on Mead's page too. Neither sums nor
correlations are computed. A failed optional history leaves other available
plots and an explanation. Failure clears busy state.

## Alternatives

- Overlay all units on one scale: rejected because an inch at a mountain
  site, a flow rate and reservoir feet are not comparable magnitudes.
- Claim a storm raised storage: rejected because dates alone establish no
  path, amount, travel time or cause.
- Load the precipitation historical file on every reservoir page: rejected;
  the full comparison belongs on its existing page and costs much more.

## Consequences

The reservoir entry gains optional lazy requests, not another backend or
runtime host. Browser readiness gains separate storage, upstream-condition
and daily-context facts. Tests compare joins, counts and values with the
payloads and synthetic calendars, including reset and missing days, explicit
upstream links and the history failure path.
