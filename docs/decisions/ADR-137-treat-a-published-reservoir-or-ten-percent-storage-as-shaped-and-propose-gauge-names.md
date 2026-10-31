# ADR-137: Treat a published reservoir or ten percent storage as shaped, and propose gauge names

## Status

Accepted; the `shaped` tier is split and the bulk queue widened by ADR-138

## Date

2026-10-27

## Relates to

ADR-124 (bounded Utah recent-conditions pilot and human-reviewed admission),
ADR-130 (merge saved gauge reviews). ADR-079 (reservoir names) is the model
for the name proposals. No existing decision is superseded.

## Context

The gauge review worksheet suggests one of five tiers per gauge. Its first
storage rule used a 2% line and let a published reservoir decide only when no
inventoried dam sat in the basin. Brian ruled on both points on 2026-10-27.
Thirteen Utah rows suggested `shaped` held storage under 10% of a year's flow
with no published reservoir upstream.

The U.S. Geological Survey station names that fill the review page are upper
case with the agency's abbreviations ("DIRTY DEVIL R AB POISON SP WSH NR
HANKSVILLE UT"). The reservoir roster had the same fault, and ADR-079 settled
it with a worksheet of proposed names that a person accepted.

## Decision

**A published reservoir in the gauge's basin makes the gauge `shaped`**, no
matter what else is found. The finding is no longer reached only when the
inventory lists no dams.

**With no published reservoir in the basin, inventoried dam storage under 10%
of a year's flow is `natural`.** At or above 10% it stays `shaped`.
`SMALL_STORAGE_SHARE` moves from 2 to 10. The other findings are unchanged:
exclusion by conduit name, `check` when untraced or when the trace differs from
the published drainage area, `short` for a record starting after 1991, a name
below a diversion, and the irrigation and near-gauge notes.

**Gauge display names are proposed deterministically.** The worksheet gains
`proposed_display_name`, `name_patterns` and `name_check`, written by
`tools/gauge_names.py` on every write. Rules: proper case with lower-case
locator words; agency abbreviations spelled out; the state suffix dropped;
`Mc` names, Roman numerals, highway names and ordinals kept in form. A token
the rules cannot settle is left as written and named in `name_check`. A person
accepts a name; the review page shows it beside the station name. Nothing
published is renamed by this decision.

## Rejected alternatives

- Keep 2%: it sent gauges with modest storage to `shaped`, where the river
  loses its comparison with normal.
- Raise the line and still let a published reservoir lose to small storage:
  the published roster is the better evidence that a reservoir is there.
- Guess ambiguous abbreviations (`C`, `SP`, `ST`): a wrong name reads as fact.
  They stay as written, or expand with a flag in `name_check`.
- Ask a language model for names: the project's data work is deterministic
  first, with a review gate.

## Consequences

Utah suggestions moved from 26 `natural`, 110 `shaped`, 14 `short`, 11 `check`
and 3 `exclude` to 39 `natural`, 96 `shaped`, 15 `short`, 11 `check` and
3 `exclude`. Thirteen rows moved from `shaped` to `natural` and one to `short`.
The `bulk` queue shrank from 96 to 79, because it still holds only storage at
or above the line, a named diversion or an exclusion. A natural river wrongly
suggested shaped costs a comparison; the reverse publishes a wrong one, so the
direction of the change is the one Brian chose to accept.

Colorado, New Mexico and Arizona worksheets pick up the new rules and columns
when `--suggest` runs on them after their traces finish. The importer reads
the worksheet by its column list, so a worksheet written before this change
needs one `--suggest` run before it can be merged.
