# Drainage filters and state labels: scoping

**Status: scoping, nothing built.** Written 2026-08-22 while the upstream
trace is in flight. Nothing here touches the files that work is holding
(`src/state/selection.ts`, `src/types.ts`, `src/overview-model.ts`).

Two pieces of work that look like one because they share a control:

1. **State labels** on drainage names — small, self-contained, and the data
   for it is already committed. Ready to build.
2. **Filter consolidation** — a taxonomy change that supersedes ADR-071 and
   needs its own record before anything is written.

They are separable and should be done in that order. Piece 1 is worth
landing on its own; piece 2 is a design conversation that piece 1 does not
depend on.

## Piece 1: state abbreviations on drainage names

### The data is already here

The committed watershed files carry the states attribute from the Watershed
Boundary Dataset. No intersection is needed, no new source, and **no geometry
dependency**: this repository has pandas and numpy only, hand-rolls
point-in-polygon in `huc.py`, and asks an ArcGIS service to do spatial work
server-side (`tools/build_county_assignments.py`). Adding geopandas or shapely
to compute something already committed would be the wrong move.

```
data/watersheds/west-huc6.geojson
  huc6 = '140100', name = 'Colorado Headwaters', states = 'CO,UT'
```

Coverage is complete at every level:

| Level | Areas | Carry `states` |
|---|---|---|
| HUC-2 | 5 | 5/5 |
| HUC-4 | 44 | 44/44 |
| HUC-6 | 75 | 75/75 |
| HUC-8 | 571 | 571/571 |

### Decisions taken

- **Labels at HUC-6 and HUC-8 only.** HUC-2 and HUC-4 names render as they do
  today. This is a labelling rule, **not** a change to which levels are
  offered: `drawn_scopes` keeps 2, 4 and 6, `?level=2` and `?level=4` keep
  working, and no saved link changes meaning. ADR-064 and ADR-073 stand.
- **Canadian and Mexican tags are dropped.** `CN` and `MX` never render. This
  is a United States dashboard and it publishes no Mexican or Canadian
  measurement.
- **Nine HUC-8 subbasins hold no United States territory** and lose every tag
  when `CN` and `MX` go. They stay on the roster and render their name with no
  abbreviation after it.

### What the reader sees

After dropping `CN` and `MX`, the lists are short enough to sit after a name:

| Level | 0 states | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| HUC-6 | 0 | 31 | 28 | 14 | 1 | 1 |
| HUC-8 | 9 | 415 | 133 | 13 | 1 | — |

The widest case at each level is `Upper Snake (ID, MT, NV, UT, WY)` and
`Lower San Juan-Four Corners (AZ, CO, NM, UT)`. Both fit. This is the reason
the rule stops at HUC-6: the Pacific Northwest Region spans nine states and
would render `CA, CN, ID, MT, NV, OR, UT, WA, WY` — which also puts
California and Canada side by side as two-letter codes, which is the second
reason foreign tags go.

### The work

`huc.coarser_roster` builds a code-to-**name** map and drops everything else,
so `states` never reaches the payload. The change is to carry it:

1. `huc.py` — carry `states` beside `name` in the roster builders, filtering
   `CN` and `MX` at the point of reading, so no caller has to remember to.
2. Both refresh scripts publish the widened roster. **This is a schema
   version, not a method version**: no published figure changes, only a field
   is added. See `.claude/rules/python-pipeline.md`.
3. `src/data/validate.ts` accepts the added field. Readiness fields are added,
   never removed.
4. Render: storage charting first, then the drainage pickers.
5. `npm run verify:pipeline`, then `npm run verify:browser` for anything a
   reader sees.

Open question for the build: whether the abbreviation is part of the name
string or a field beside it. A field beside it is the safer answer — a name
that carries its own parenthetical cannot be sorted, searched or matched
against the roster without stripping it again, which is the fault the former
name work (ADR-079) exists to undo.

## Piece 2: filter consolidation

### The fault

`createWhereControl` builds up to four `<calcite-select>`s — state, region,
subregion, basin — and pages carry their own drainage picker beside it, plus
a separate `?level=` control.

Region, subregion and basin are not three axes. They are **one axis at three
resolutions**, which means resolution is currently expressed twice: once by
which select a reader reaches for, and again by the level control. That is
AGENTS.md invariant 8 read backwards — one thing wearing several names.

[ADR-071](decisions/ADR-071-one-drainage-area-control-to-a-page.md) already
caught this shape once, when three pages ended up with two controls both
labelled "Drainage area". Its fix was a `finest` option so the shared control
stops one step above the page's own picker. That is a truce: it keeps four
axes and hides some of them.

### What the existing model already supports

From `src/ui/where-control-model.ts`, describing rows it can already build:

> a row carrying `group` renders under a heading of that name … subregion rows
> sit under their region, basin rows under their subregion. Indented groups,
> not flyout submenus — measured at 360px

One grouped drainage menu spanning levels is already this model's own idea. It
is not wired that way.

### The shape being proposed

Two controls in place of four or five:

| Control | Offers |
|---|---|
| Where | state, with that state's counties as a nested group |
| Drainage | one menu, areas grouped under their parent, across levels |

County material exists and is complete: 375/375 reservoirs carry
`county_name`, 157 distinct state-county pairs, governed by
[ADR-058](decisions/ADR-058-assign-the-county-from-the-water-not-the-dam.md).
Folding county into the state control answers the open backlog question about
which control owns county.

### The hard part, and why this is not a quick change

**`?level=` is a navigation, not a re-render.** Per
[`architecture/scopes.md`](architecture/scopes.md), changing level changes
which files a page fetches and every figure computed from them, so the control
does `location.replace`. A combined menu means choosing a HUC-4 row has to
*trigger that navigation* rather than filter in place.

That is the whole design problem. Get it wrong and a reader picking an area
from a menu either silently re-renders against the wrong payload, or takes a
full navigation they did not ask for. Both are quiet failures.

Before any of it is written:

- an ADR superseding ADR-071, because this changes what a control means;
- confirmation that all four scopes still answer only their own question
  (drawn, roster, opening, selected — `scopes.md`);
- `npm run verify:browser`, whose deep-link case is what catches a modal
  buried over someone's shared link.

## HUC-8

`data/watersheds/west-huc8.geojson` is **already committed** — 571 areas, all
carrying `states`. What it is not is offered: `drawn_scopes` reads
`{2, 4, 6}`.

Offering it is a separate decision from labelling it, and it is not free: a
level is a scope change (ADR-064), every figure is published at every offered
level, and drought coverage is computed per level. 571 areas is more than
seven times the basin count.

Levels 4, 6 and 8 draw from the Living Atlas rather than from a committed file
(ADR-073, ADR-048), so offering HUC-8 does not require publishing the polygon
file into the deploy.

## Order

1. State labels at HUC-6 and HUC-8. Self-contained, no contract moves.
2. The ADR for the filter taxonomy.
3. Filter consolidation, once the upstream work has landed and the files it
   holds are free.

HUC-8 as an offered level is independent of all three and can happen whenever
its own cost is worth paying.
