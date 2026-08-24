# Scopes, levels and URL state

Four different geographic questions wear the word "scope". Answering two of
them with one constant is the mistake this document exists to prevent.

| Concept | Name in code | Question it answers |
|---|---|---|
| Drawn scope | `watershed_scopes.DEFAULT_SCOPE`, published as `default_scope` | Which drainage areas do the maps draw? |
| Roster scope | `watershed_scopes.ROSTER_SCOPE`, published as `roster_scope` | Which geography were the published reservoirs admitted from? |
| Opening scope | `OPENING_SCOPE_HUC6_BOUNDS` in `src/viz/extent.ts`, `src/data/opening-scope.ts` | Where does a page open when the reader has chosen nothing? |
| Selected scope | `?state=`, `?area=`, `?level=`, the stored place | Where has *this* reader asked to be? |

## Drawn and roster are two names (ADR-063)

`DEFAULT_SCOPE` is what the maps draw — `west-huc6`, 75 basins across regions
14 to 18. `ROSTER_SCOPE` is the geography the published reservoirs were
admitted from. **The two now name the same scope**: the roster went west and
`ROSTER_SCOPE = DEFAULT_SCOPE`. They stay two names because they answer two
questions, and the next roster move must be able to happen without dragging the
drawn coverage with it. Both are published in `reference.json`; no test, tool or
fixture may name a boundary file directly, because which file holds which
geography has moved twice already.

**23 of the 75 drawn areas hold no reservoir**, which ADR-056 already allowed
for. **Each map draws what it can say something about**: the drought engine
measures all 75 so the drought map draws 75; the snow network reports in 51, so
`measuredScope` narrows the snow map to 51; the storage map draws all 75 as
context around its subject. The two committed boundary files must agree area for
area — fetched at different generalizations they did not, and two drought
figures moved by a rounding step with no weather behind them.

## Where the map opens is a third question, and it is pinned

`HUC6_BOUNDS` in `src/viz/extent.ts` is the roster scope's box and moved west
with it — 19 degrees of longitude. `MAP_BOUNDS` is **not** built from it: it is
built from `OPENING_SCOPE_HUC6_BOUNDS`, a private literal frozen at the box of
the fourteen areas the original roster was admitted from, which is what keeps a
reader who has chosen nothing from opening on the whole west with the
reservoirs too small to point at. That literal equals the frozen oracle's own
`HUC6_BOUNDS` and is ADR-044's contract with the retired routes' saved links;
`extent.test.ts` holds it there. The load the wider box would otherwise put on
the opening view is carried by `src/data/opening-scope.ts` and the first-visit
chooser instead — `unionOfAreaBoxes` over whatever place a reader picked.

## Three shared levels, and a drought-only fourth (ADR-064, ADR-073, ADR-088)

HUC-6 is the default; HUC-4 and HUC-2 are the shared alternatives. Storage,
snow and drought publish figures at those three levels. Drought also publishes
HUC-8 subbasins through its own `drought_scopes` offer. Storage and snow do not
offer HUC-8 until each can put an honest figure and interface behind it.
Drought coverage is computed per level; storage regroups on `huc6[:level]`,
exact because codes nest; snow regroups from *sites* with the pipeline's rule,
never by averaging the published basin means.

**A name is a figure too.** Each coarser level needs a roster published beside
the numbers, or a picker labels its areas by code — the snow region picker read
"14 (137 sites)" for exactly as long as `regions` was missing from the payload
while `subregions` was there. `huc.coarser_roster` builds one per level and
both refresh scripts publish both tables.

**Level 2 draws from the USGS service, levels 4, 6 and 8 from the Living
Atlas** (ADR-073, ADR-034). Same dataset, two publishers, and
`src/arcgis/watershed-layers.ts` says which is which and why. `connect-src`
names `hydro.nationalmap.gov` for the first of them.

**`?level=` is one parameter across all three maps**, like `?area=`, and it
carries the digit count rather than a word because that is what every payload
states and `data.html` documents. Absent means basins; a link never carries
`level=6`. Changing it is a **navigation**, not a re-render: the level changes
which files a page fetches and every figure computed from them, so the control
takes the path a shared link already takes — `location.replace`, never push.
An HUC-8 drought link stays HUC-8 when it moves to drought or methods. A link
to storage or snow coarsens an eight-digit place to its enclosing basin and
drops the unsupported level. The control is appended when `reference.json` resolves rather than written into
a template, because which levels are on offer is the export's answer
(`drawn_scopes`), and it is built at the Calcite scale of the controls beside it.

**The maps draw the level the payload declares** (ADR-050). No client file
names a hydrologic level; it arrives as `DrainageScope { level, areas }` and the
code is read from the attribute that level names. `JOINABLE_LEVELS` and
`DROUGHT_JOINABLE_LEVELS` in `src/data/boundaries.ts` are the explicit sets of
levels each surface can join, and
a scope published at another size says so out loud rather than drawing areas
whose hover cards come back empty. Level is deliberately *not* driven by view
scale: a finer outline a reader can point at, with no figure behind it, is less
information rather than more.

**A watershed scope carries its own level.** `watershed_scopes.py` is the one
place that decides which drainage areas exist and how big they are; the level
picks the WBD service layer and the attribute the code arrives in. Codes are
fixed-width, so the level *is* the digit count — `HUC_CODE` in `src/data/huc.ts`
is the shared pattern and accepts any even length to twelve. Never write
`/^\d{6}$/` again. Levels finer than HUC-8 are refused on purpose: the drought
engine's sampled share carries about 0.21 points of error at HUC-10 against a
published precision of 0.1.

**A scope can be registered before it is published.** `published=False` means
the geography exists to be fetched and reviewed and nothing draws it yet; the
reference export skips those and still fails loudly for anything missing that
*is* published.

## A link is never interrupted, and a preference never leaks into one

Three answers can name the place a page opens on and the order is fixed: the
address bar, then the stored choice, then everywhere. `resolveOpeningPlace`
reports which answered, and `shouldAskWhere` reads that rather than re-deriving
it.

The first-visit chooser appears **only** when the query string is empty —
emptiness, not a list of place parameters, because `?reservoir=Flaming+Gorge`
names no place and is unmistakably someone showing someone else a thing. A list
would need updating for every parameter any surface ever adds, and forgetting
one buries a reader's link under a modal, which is what happened and what the
smoke suite's deep-link case now catches. A reader who wants the question back
asks for it through **Choose another place** in every shared page header. The
action is direct on wide screens and inside the page menu on phones. It reopens
the same dialog and starts the selected destination from an empty query, so the
new place travels and page-owned filters do not.

The stored choice is **never written back into the address bar**: what a reader
copies must be what they see, not what they prefer. `?state=all` exists so that
"everywhere" can be said out loud rather than by silence — deleting the
parameter would produce a link that defers to the *recipient's* stored place. A
stored place that no longer holds anything is cleared rather than left to open
on a blank page tomorrow (`forgetPlaceIfEmpty`); what "empty" means is each
surface's own measurement.

## Two reservoirs are controls, not filters (ADR-011, ADR-062)

Lake Powell and Lake Mead each dominate any total they enter, so each has its
own include/exclude choice and every surface states which way both are set.

**In the reader's view they start included**: a map whose subject is western
water opened with 51 million acre-feet taken out of it, behind two switches most
readers never found. `DEFAULT_URL_STATE` and `DEFAULT_OVERVIEW_STATE` both say
`include`, absence in a link means `include`, and the narrow answer is what a
link spells — `?powell=exclude`, `?mead=exclude`.

**The library default is the opposite, and deliberately so.**
`reservoirInScope` reads `options[key] !== "include"`, so a caller that passes
no `lakeMead` excludes it. That is the ADR-062 guard: a caller written before
Mead joined the roster must not silently start adding 28 million acre-feet
because a page-level default moved. Do not collapse the two defaults into one.

**Rows that are already scoped say so in the type.** `scopeReservoirs` returns
a branded `ScopedReservoirs`, and `rollupOfScoped` is the only way to total a
set that has already been narrowed — it takes no scope dimensions at all, so it
cannot narrow twice. `WIDEST_SCOPE` remains for callers that must still pass an
options object, and its `Required` is what makes admitting the next dominant
reservoir a compile error rather than a silent exclusion.

## Place controls by surface (ADR-091, ADR-094, ADR-095)

### Storage map's sequential selected scope

The Storage map orders four controls: **State**, **County**, **Area size**, then
the area tier named by that size (ADR-095). County is absent until a state is
held. Its choices use each reservoir's reviewed five-digit waterbody county
assignment. The area menu offers regions at level 2, subregions at 4 and
basins at 6—never all three at once.

The order is shared with Drought and Snowpack; the effect is Storage's own.
State is the `waterbody_states` scope and changes the roster and totals. County
and hydrologic area are analysis filters: they dim the other reservoirs,
narrow the list and table, and leave the wider total and drawn roster alone.

A state change clears County and hydrologic area. An Area size change keeps
State and page-local `?county=`, clears `?area=` and `?drainage=`, then performs
the existing full navigation. A County change clears an area that holds no
matching reservoir. The exact-tier area choices come from the full published
roster with both dominant reservoirs available, then narrow by State and
County; a Lake Powell or Lake Mead switch never removes a place choice.

Saved links keep their meanings. A coarser `?area=` or `?drainage=` can still
prefix-filter a finer page on arrival; the exact-tier control shows every area
until the reader chooses one at that tier. County stays outside
`portableSearch`; state, area and level continue to travel between pages.

### Storage charts' mixed menus

Storage charts continue to ask "where am I" with ADR-084's two single-select
menus, both built as indented option groups
([ADR-076](../decisions/ADR-076-nest-the-place-menus-and-let-the-heading-carry-the-state.md)'s
shape):

| Menu | Offers | Writes |
|---|---|---|
| **Where** (`createWhereMenu`) | states; counties grouped beneath their state where the surface has FIPS county material (the storage charts) | a state row → `?state=`, a county row → `?county=` |
| **Drainage area** (`createDrainageMenu`) | regions, subregions and basins in one menu, each tier grouped under its parent | `?area=` (or `?drainage=` on storage), plus `?level=` when the row forces it |

Region, subregion and basin are one axis at three resolutions, so they live in
one menu rather than three selects. **A row finer than the drawn level
navigates** — it takes `location.replace` carrying its own `?level=`, because
the level decides which files the page fetches (ADR-064); a row coarser than or
equal to it narrows by prefix exactly as a link does. The level control stays:
it answers the drawn question (division without narrowing) and the menu answers
the selected question; merging them would answer two of the four scopes with
one control.

The charts offer the full published roster. They keep the mixed menu because
ADR-095 changes only the map.

The pure half lives in `where-control-model.ts` (`whereMenuView`,
`drainageMenuView`, `nextSelectionForState`, `nextSelectionForDrainageRow`)
over `resolveOpeningScope`'s narrowing; the DOM half is `where-control.ts`.
The menus narrow against state but never against the reader's own area pick —
a menu that removed the families around the current choice would leave "All"
as the only way out.

County exists in the combined Where menu because reservoirs carry FIPS codes.
A chart county pick writes `?county=` and leaves `?state=` alone; the two axes
stay two even though the controls are one.

### Snowpack's sequential selected scope

Snowpack orders three controls: **State**, **Area size**, then the area tier
named by that size (ADR-094). The last control offers Region, Subregion or
Basin rows only at the drawn level, and each row must have a publishable figure
in the current Snowpack payload. That keeps ADR-085's empty-page repair while
removing its coarser rows from this control.

A state change clears `?area=` before the new state's areas are offered. An
Area size change also clears it before navigating with the new `?level=`.
The parameter meanings do not change. A coarser saved `?area=` can still
narrow a finer page on arrival; the exact-tier control shows every area until
the reader chooses one at that tier.

County is not a place control on Snowpack. Each site carries a bare county
name, not the verified five-digit identity used by the other county axes. Site
name or county remains a table search beside Elevation and Reporting in the
separate Site options pane.

### Drought's sequential selected scope

Drought orders four controls: **State**, **County**, **Area size**, then the
area tier named by that size (ADR-091). County is absent until a state is held.
Its five-digit FIPS choices come from the detailed Census county service. A
chosen county is sent to the WBD service as a spatial filter at the drawn
level; the returned codes select rows from the committed weekly coverage.
Nothing computes a county drought share.

The selected-scope result is therefore “whole drainage areas that intersect
this county.” The page states that sentence and says the units are not clipped
at the county line. A state still narrows through the published WBD `states`
attribute, and an area still narrows by code prefix; county is an additional
intersection against the exact drawn-level codes.

Area size remains the drawn-scope control and still performs a full navigation.
On drought, changing it clears the prior tier's `?area=` because the following
menu is replaced by the new tier. It keeps `?state=` and page-local
`?county=`. The area menu offers regions at level 2, subregions at 4, basins at
6 and subbasins at 8—never all four at once.

An unchosen county list is optional and fills after the figures render. A link
that carries `?county=` must resolve before the figures render. Failure does
not manufacture a county answer: the page keeps the wider resolved scope and
says the county could not be loaded. County remains outside
`portableSearch`; state, area and level continue to travel between pages.

## A county is where a thing is; a drainage area is where its water goes

(ADR-058, ADR-060.) Counties are a *search and filter* axis and never a
grouping one — 375 reservoirs fall in 157 counties and 73 hold exactly one, so
a county total is a reservoir total wearing a county's name. Nearly half the
counties on the roster hold a single reservoir, and the ratio that made the
aggregation framing wrong at 68 reservoirs held as the roster went west: the
same 375 sit in 52 drainage areas, about seven to an area, with only nine
areas holding exactly one.

The dam-versus-waterbody question `OPEN-BACKLOG-SCOPING.md` left open was
measured 2026-08-21 (`tools/probe_county_dam_point.py`): of the 30 published
reservoirs with a reviewed dam point, **2** would move county if counties
followed the drainage rule — Lake Powell (San Juan County, Utah → Coconino
County, Arizona) and Lost Lake (Wasatch County → Summit County, Utah). Both
are already the named examples behind the rule; no third case emerged from
the larger roster, and the waterbody assignment point stands.

The key is the five-digit FIPS code and never the name: this roster holds seven
repeated county names — two each of Carbon, Garfield, Lincoln, San Juan and
Summit, and **three** each of Lake, in California, Montana and Oregon, and
Washington, in Idaho, Oregon and Utah. The assignment point is the
**waterbody**, deliberately not the dam the drainage area uses — Glen Canyon Dam
is in Coconino County, Arizona and Lake Powell is in San Juan County, Utah. No
county geometry is ever committed; the service resolves the point and answers
with a code, and the *detailed* Living Atlas layer is required rather than
preferred, because the generalized one puts Lost Lake outside Wasatch County.

## A state is three questions (ADR-060)

`state` is the one state holding the published point, `waterbody_states` every
state the water touches, and `connected_states` every state the drainage area
reaches. Hyrum is wholly in Utah and fed from Idaho. A filter must pick one and
say which; ADR-011's warning is unchanged.

**A state filter means the water.** The control picks `waterbody_states`: it is
what `intersects_utah` has always meant, so Bear Lake stays in Utah's list where
a reader expects it. A payload without the array falls back to the point's own
state rather than vanishing from every state filter, and that default is *not* a
finding — the reviewed table holds three waterbodies and does not claim to be
complete. Re-run the dam-versus-waterbody check when the roster grows; it is
cheap, it is already written, and it is what found Lake Powell.

## The payload carries the roster; the service carries the shapes

(ADR-047, ADR-048.) `reference.json` publishes each area's code, name and states
and no drainage geometry — it was 1,001 KB raw and is 193 KB raw, **38.4 KB
on the wire**, and every map page fetches it whole on every load. Quote the wire
figure. Outlines come from the hosted Watershed Boundary Dataset, quantized to
the view.
