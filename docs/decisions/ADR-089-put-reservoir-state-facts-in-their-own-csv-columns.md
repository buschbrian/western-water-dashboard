# ADR-089: Put reservoir state facts in their own CSV columns

## Status

Accepted

## Date

2026-08-23

## Context

A reservoir has two different state facts. `state` is the one state holding
the published point; `waterbody_states` is every state the waterbody touches
(ADR-060). The interface question of how to qualify a reservoir's visible name
is unresolved: `Lake Powell, AZ` is incomplete, while `Lake Powell, AZ/UT`
turns an identity label into a compact geography field.

CSV files do not need that compromise. They can keep the name as data and put
both state facts beside it as separately named columns.

## Decision

Every reservoir CSV export carries these leading fields:

1. **Reservoir** — the bare published name.
2. **State** — the published point's state code.
3. **Waterbody states** — all published waterbody-state codes, separated by a
   semicolon and a space inside one CSV field.

This applies to the storage charts' filtered export, the storage map's table
export, and a reservoir's history export. The station or item identifier
remains the stable identity. Download filenames may retain a qualified label
where it prevents two same-named files from replacing one another.

This decision does not change visible reservoir labels. That product-language
question remains open.

## Alternatives considered

**Append state text to the Reservoir field.** Rejected because it merges a
presentation choice into the name and still cannot say both state facts
accurately.

**Publish only `waterbody_states`.** Rejected because it would hide which
point the published reading and station identity use.

**Publish only `state`.** Rejected because a cross-state waterbody would look
wholly contained in the state of its point.

## Consequences

CSV column tests become an explicit data contract. Duplicate reservoir names
remain distinguishable through state fields and the station identifier without
changing the name cell. Visible map, chart, table, and accessibility labels do
not move.

## Related

- Applies ADR-060's three-state-question vocabulary to CSV exports.
- Leaves ADR-066's station identity and same-name URL resolution unchanged.
