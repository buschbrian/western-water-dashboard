# ADR-084: Two place menus to a page

## Status

Superseded by ADR-095

## Date

2026-08-22

## Context

A page today asks "where am I" with four or five selects. The where control
builds up to four of them — state, region, subregion, drainage area — and each
map page adds its own: the storage panel a `[data-filter="drainage"]`, the snow
bar an `#snow-area` beside the shared selects, the drought page nothing, and
every map page an **Area size** level select. [ADR-071](ADR-071-one-drainage-area-control-to-a-page.md)
settled the worst of it — two controls carrying one label — by a truce: the
shared control stops one step above the page's own picker. The truce works, and
the count is still wrong.

**Region, subregion and basin are not three axes.** They are one axis at three
resolutions, which means resolution is expressed twice on every page: once by
which select a reader reaches for, and again by the level control. A reader who
wants the Provo basin at HUC-4 resolution must know, before touching anything,
that basins live in the fourth select and the division lives in a fifth
labelled "Area size". That is AGENTS.md invariant 8 read backwards — one thing
wearing several names.

**County is a sixth choice with no home.** It exists only on the storage
charts' filter bar, nested under its state ([ADR-076](ADR-076-nest-the-place-menus-and-let-the-heading-carry-the-state.md)),
while the open backlog still carries the question of which control owns it.
The material is complete wherever reservoirs are: 375 of 375 carry
`county_name` and a five-digit FIPS ([ADR-058](ADR-058-assign-the-county-from-the-water-not-the-dam.md)).
The drought page has no county rows at all, and the snow payload's site
`county` field is a bare name, not a FIPS — so a county axis cannot be offered
everywhere, and must not be half-offered anywhere.

**The hard part is that `?level=` is a navigation, not a re-render**
([ADR-064](ADR-064-offer-two-levels-and-let-the-reader-choose.md), [`architecture/scopes.md`](../architecture/scopes.md)):
the level decides which files a page fetches and every figure computed from
them. One drainage menu spanning levels therefore needs something no control
here has ever done — a row whose pick *is* a navigation to that row's level.
Get it wrong and a reader picking a basin either silently re-renders against
the wrong payload or takes a navigation they did not ask for. Both are quiet
failures.

The upstream-trace work that was holding `src/state/selection.ts`,
`src/types.ts` and `src/overview-model.ts` has landed far enough that none of
those files is any longer in flight, and piece 1 of
[`docs/DRAINAGE-FILTER-AND-STATE-LABEL-SCOPING.md`](../DRAINAGE-FILTER-AND-STATE-LABEL-SCOPING.md)
— state abbreviations on drainage names — shipped separately so this record
could stand alone.

## Decision

**A page shows two place menus: Where and Drainage area.**

| Menu | Offers | Writes |
|---|---|---|
| Where | states, and — where the surface holds county material — that state's counties grouped beneath it | `?state=` from a state row, `?county=` from a county row |
| Drainage area | regions, subregions and basins in one menu, each row grouped under its parent | `?area=` (or `?drainage=` on storage), and `?level=` when the row forces it |

Both menus are single-selects built as indented option groups
([ADR-076](ADR-076-nest-the-place-menus-and-let-the-heading-carry-the-state.md)'s
shape, now carried to its conclusion): flyouts were rejected by measurement
there and nothing here reopens that.

**The drainage menu replaces the drill-down and every page-owned picker.**
Region, subregion and basin selects disappear as separate controls; so do
`[data-filter="drainage"]` on storage and `#snow-area` on snow. The drought
page, which owned no picker, loses three selects and gains nothing.

**A row finer than the drawn level navigates; a row coarser than or equal to
it does not.** Codes are fixed-width, so a row's level *is* its digit count.
Picking a basin while the page draws subregions takes the path a shared link
already takes — `location.replace` carrying `?level=6` and the basin code —
because the page genuinely must fetch different files. Picking a subregion
while the page draws basins narrows by prefix exactly as today's subregion
select does; nothing finer was drawn, so nothing needs fetching. A row at the
drawn level behaves exactly as the page's current picker does, whatever that
is: the in-page dimming filter on storage, the payload narrowing on snow and
drought.

**Snow's rows stay gated by what it can draw.** ADR-071's repair — 24 of 75
published basins hold no measurement site, and offering them offered a choice
that empties the page — is retained by gating each row against its own level's
publishable set rather than by hiding a whole tier. A subregion row appears on
snow when some child basin reports; a basin row appears when it reports.
Drought and storage offer the full published roster, as their controls do
today.

**The level control stays.** It answers the drawn question — how finely the
ground is divided — and the drainage menu answers the selected question —
where within it. Folding one into the other would answer two of the four
scopes with one control, the coupling ADR-068 exists to prevent. What this
record removes is the *need* to find it: reaching a finer cut no longer
requires knowing which control owns resolution, because the row carries its
own level. Changing division *without* narrowing remains the level control's
job, and it stays one select on every map page.

**The Where menu owns county, where county exists.** The storage panel and
the storage charts fold their state and county selects into one menu: states
as top-level rows, counties grouped beneath their state's heading with the
FIPS as the value ([ADR-058](ADR-058-assign-the-county-from-the-water-not-the-dam.md)'s
key rule, [ADR-076](ADR-076-nest-the-place-menus-and-let-the-heading-carry-the-state.md)'s
label rule). The two axes stay two — a county row writes `?county=` and
leaves `?state=` alone, and the county list narrows by the chosen state alone,
both exactly as ADR-076 left them; what folds is the *controls*, not the
parameters. Drought offers no county group because it publishes no county
rows. Snow offers none because its site counties are bare names, not FIPS
codes, and a name-keyed county axis would break the five-digit contract;
resolving those names is recorded as debt, not done here.

**Visible text.** The two menus are labelled **Where** and **Drainage
area**. The first is new and enters the vocabulary through
[ADR-006](ADR-006-simplified-technical-english.md)'s procedure; the second is
already published. Region and Subregion disappear from every page as labels,
which retires rather than renames them. Each menu's accessible name says what
changes, not what it is, per the rule the existing controls follow.

**No parameter changes.** `?state=`, `?area=`, `?drainage=`, `?level=` and
`?county=` are read and written exactly as before, including `?state=all`
and the rule that absence means deferring to the recipient's stored place.
A saved link naming anything any old control could write resolves unchanged.

## Alternatives considered

**Keep ADR-071's truce.** Rejected as the status quo this record exists to
end. The truce fixed the duplicate-label defect but left four selects where
one question is being asked, resolution expressed twice, and county homeless.

**Retire the level control and let the drainage menu carry resolution alone.**
Rejected: it couples drawn scope to selected scope. A reader who wants the
whole west redrawn at subregion resolution with nothing narrowed would have
no way to say so — every row of the merged menu narrows. ADR-064 made
reader-chosen level a scope change; scope changes deserve their own control.

**Offer HUC-8 in the merged menu while spanning levels anyway.** Rejected for
now. Offering a level and labelling a level are separate decisions
([ADR-073](ADR-073-draw-the-regions-too-and-read-them-from-their-own-publisher.md),
[`docs/DRAINAGE-FILTER-AND-STATE-LABEL-SCOPING.md`](../DRAINAGE-FILTER-AND-STATE-LABEL-SCOPING.md)),
and 571 areas more than seven times the basin count is a cost to pay on its
own record. The menu spans the levels that are offered; it does not offer new
ones.

**Flyout submenus for the nesting.** Already rejected by measurement in
ADR-076: several screens of popup scroll at 360 px, and no hover there.

**A separate county select beside the state select.** Rejected — it is the
status quo that left county homeless, and the fifth select the consolidation
exists to remove.

## Consequences

Every page's place controls shrink: the drought bar goes from five selects to
three, snow from five to three, the storage panel from five to three, and the
storage charts lose a select from their filter bar. No reachable choice
disappears except the 24 siteless basins on snow, whose disappearance is
ADR-071's repair carried forward, and region/subregion-as-destination on
storage charts, which that bar never offered.

The browser suite is what holds this together and must move with the change:
the per-host axis assertions become per-host menu assertions, the
duplicate-visible-label check survives unchanged, the deep-link cases gain one
member — a link arriving at a finer level than the menu's drawn level restores
both parameters and marks the right row — and the snow clearing case keeps its
assertion that picking "All drainage areas" removes `?area=` from the address
bar.

`openingAreaCleared` survives intact: the clearing path depends on a real
change event reaching the picker, and the merged menu emits one, from one
control instead of two.

The navigation-per-row rule is the one genuinely new failure mode. A row that
forces a level change must not fire twice, must not fire on programmatic
repopulation, and must leave a reader whose link named a dead area on the
coarsest honest view — the same aliveness rules
`resolveOpeningScope` already applies, extended to a row rather than an axis.

County on snow waits on resolving site county names to FIPS codes; until then
its Where menu is states alone, and that is stated here rather than discovered
later.

## Related

- Supersedes [ADR-071](ADR-071-one-drainage-area-control-to-a-page.md):
  its one-control-per-question rule stands as principle; its mechanism — a
  shared control stopping one step above a page-owned picker — is replaced by
  one menu owning the whole drainage axis, page-owned pickers included.
- Extends [ADR-076](ADR-076-nest-the-place-menus-and-let-the-heading-carry-the-state.md):
  its indented-group shape and heading-carries-state rule become the form of
  both menus, and its charts-only county nesting becomes universal where
  county exists.
- Rests on [ADR-058](ADR-058-assign-the-county-from-the-water-not-the-dam.md)
  (FIPS key), [ADR-064](ADR-064-offer-two-levels-and-let-the-reader-choose.md)
  (level as navigation) and [ADR-011](ADR-011-separate-location-scope-from-lake-powell.md)
  (a filter is a scope is a question, asked once).
- Scoped in
  [`docs/DRAINAGE-FILTER-AND-STATE-LABEL-SCOPING.md`](../DRAINAGE-FILTER-AND-STATE-LABEL-SCOPING.md),
  piece 2.
