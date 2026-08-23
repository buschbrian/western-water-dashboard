# ADR-085: Gate snow's drainage rows to the drawn tier and coarser

## Status

Accepted; narrows ADR-084's snow clause

## Date

2026-08-22

## Context

[ADR-084](ADR-084-two-place-menus-to-a-page.md) says snow's Drainage-menu rows
are gated per row: "a subregion row appears on snow when some child basin
reports; a basin row appears when it reports", explicitly "rather than by
hiding a whole tier". The implementation hides the whole finer tier instead:
snow offers rows at its drawn tier and every coarser one, and nothing finer.
Both suites pass with the code as it is, so nothing currently holds the record's
sentence and the code together.

The reason the implementation stops there is a property of the payload, not a
shortcut. A row can be gated honestly only against what reports, and what
reports is known per drawn level: `snowpack.json` publishes rollups for the
level the page draws (`payloadAtLevel` regroups the raw sites into it), and no
figure for any other tier ships alongside them. To offer a HUC-6 basin row on a
level-4 page, gated by whether that basin reports, snow would have to know the
level-6 publishable set before the reader picks -- which means either fetching
the level-6 payload it did not ask for, or rebuilding that payload client-side
from raw sites by reimplementing the pipeline's reporting-floor population rule
in the browser. The first costs a fetch per page load for a menu; the second is
exactly the estimator duplication this repository keeps splitting apart --
`build_rollups` and `regionCurve` disagreed once already (ADR-081), by two
implementations of one rule drifting.

Drought can offer every row because its roster of measurable areas is the
published roster itself; storage offers the full roster because its picks dim
rather than navigate. Snow is the one host whose gating needs another tier's
figures, and the one host that does not have them.

## Decision

**Snow's Drainage menu offers rows at the drawn tier -- each gated by its own
publishability, exactly as ADR-071's repair required -- and every coarser tier,
each gated by whether some publishable choice sits beneath it. Nothing finer
than the drawn tier is offered.**

This narrows ADR-084's snow clause to match; its mechanism for everything else
-- per-row gating rather than hiding tiers, the level-forcing pick, the
clearing rule -- stands. ADR-084's body is untouched; this record is the
exception, stated where the next reader of either will find it.

A finer-tier row that navigated unoffered would be the alternative shape: offer
basins at level 4 ungated, let the pick take the shared-link path to level 6.
Rejected because ungated is precisely the choice that empties the page
(ADR-071's finding), and the emptying would now happen after a navigation
instead of before it -- harder to see, not easier.

## Consequences

A reader on a subregion-resolution snow page reaches individual basins through
the area-size control first, then the menu -- two steps, where ADR-084's general
rule promised one. That is the cost; it buys never offering a choice whose
honesty the page cannot check. If a future payload ships publishable sets for
every offered level, or the reporting-floor rule becomes cheap to evaluate
client-side against committed data, this record should be superseded and the
finer tier restored to the menu.

## Related

- Narrows [ADR-084](ADR-084-two-place-menus-to-a-page.md)'s snow clause;
  every other part of it stands.
- Rests on ADR-081's finding that two implementations of one estimator drift,
  and on ADR-064's rule that the level decides what a page may know.
