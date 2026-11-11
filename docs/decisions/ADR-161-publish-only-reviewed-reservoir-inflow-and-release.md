# ADR-161: Publish only reviewed reservoir inflow and release

- Status: Accepted; implementation local, not released
- Date: 2026-11-11
- Extends: ADR-117, ADR-135, ADR-146
- Retains: ADR-136's rule that a river gauge is not reservoir inflow

## Context

The November plan requests observed Reclamation inflow and release for Lake
Powell and Lake Mead. Brian authorized implementing this wave. Catalog probes
on 2026-11-11 found Powell daily inflow (item 511), Powell total release
(4315), and Mead total release (6125), all daily averages in cfs, with
`isModeled=false`. Mead's record 4370 lists storage, elevation and releases,
but no daily inflow. Powell also has unregulated inflow, which is a different
quantity and cannot substitute for the requested inflow.

Reclamation's [Powell operations table](https://www.usbr.gov/rsvrWater/rsv40Day.html?siteid=919)
states that inflow is computed from releases and storage change, accounting
for evaporation and bank storage where included. “Observed” in the catalog
does not make that a direct gauge measurement.

## Decision

`admitted_reservoir_flows.json` names each item, its catalog record, parameter,
unit, observed status, operator definition and sources. Its loader refuses
missing evidence, modeled series, unregulated inflow and any unit other than
cfs. Each fetch also checks the live item's record, parameter, observed
status, daily time step and average transformation before reading results.

A reservoir can carry optional `water_flow`, with separately dated `inflow`
and `release` readings, their definitions and source links. Powell has both.
Mead has release and an explicit unavailable-inflow reason and catalog link.
No inflow is reconstructed from river gauges or a storage balance. The
existing river validator's refused fields remain intact.

The daily reservoir refresh reads the last 90 days and merges them by date
into `reservoir_flow_history.json`, version 1, in cubic feet per second.
The first file starts with that window and then grows; this is not a full
historical backfill. A failed individual fetch retains its own last reading
and date. Readings older than the existing 60-day withdrawal threshold are
omitted from the summary, with their historical observations retained.
No normal, percentile, percentage or sum across rivers is added.

The two reservoir pages show **Water in and out**, with daily average units,
dates, late-data text, provisional status, the operator definition and links.
Powell inflow says it is computed. Mead's missing inflow is stated in words,
never plotted as zero.

## Alternatives

- Use unregulated Powell inflow: rejected because upstream storage adjustments
  answer another question.
- Add the four river gauges: rejected because they do not measure total
  reservoir inflow and can include the same water at different locations.
- Fill Mead inflow from releases and storage: rejected because no reviewed
  accounting method or observed series supports that new claim.

## Consequences

Item 11 is implemented for the three available series. A complete daily Mead
inflow remains a source-evidence gap; the implementation does not manufacture
the fourth series to close the plan. The main reservoir schema remains
compatible because the block is optional. Tests cover roster refusal, live
catalog refusal, calendar gaps, future dates, carry-forward and absent Mead
inflow. The public data reference documents both the block and history.
