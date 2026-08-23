/*
 * The pure half of the place menus (ADR-084): what each menu offers, what
 * it shows as chosen, and what a reader's raw pick turns into. Kept apart
 * from `where-control.ts`, which imports this module
 * and does the actual DOM building, because nothing in this codebase can
 * exercise a custom element outside a browser (no `jsdom` here -- the same
 * split `ui/hover-content.ts`/`ui/hover.ts` already use, and importing a
 * component's side-effecting module -- `@esri/calcite-components/...` --
 * from a plain Node test fails before a single assertion runs). The
 * narrowing, the preserved-choice-on-repopulate rule and the fallback-to-
 * all rule this feature owes tests for all live in functions a Node test
 * can call directly, here.
 *
 * The narrowing itself is not re-derived. `data/opening-scope.ts`'s
 * `resolveOpeningScope` already narrows the published rosters coarsest
 * first -- state first, then region, then subregion, then basin -- and
 * already keeps a surviving choice while dropping a dead one to "all".
 * `whereMenuView`, `drainageMenuView` and `nextSelectionFor*` are a thin
 * layer over that resolver: they turn its answer into what one
 * `<calcite-select>` needs (an offered list and a selected value) and turn
 * a reader's raw pick back into the `OpeningSelection` shape the resolver
 * reads.
 */
import { resolveOpeningScope, type OpeningRosters, type OpeningSelection } from "../data/opening-scope";
import type { DrainageArea } from "../data/boundaries";
import { offeredStates, type StateOption } from "../data/state-vocabulary";

/**
 * The three prefix widths the drainage hierarchy narrows between, named
 * again rather than imported: `data/opening-scope.ts` deliberately keeps
 * `REGION_WIDTH`, `SUBREGION_WIDTH` and `AREA_WIDTH` private
 * (`drought.ts`'s own `REGION_CODE_WIDTH`/`SUBREGION_CODE_WIDTH` made the
 * same choice), so a reader of this file sees what each width means without
 * cross-referencing another module's source.
 */
const REGION_WIDTH = 2;
const SUBREGION_WIDTH = 4;

/**
 * The value every "not narrowed" option carries. Never written into the
 * address bar as `?state=all` by this module -- that sentinel is the URL
 * writers' own, and writing it is `searchWithPlace`'s job ("everywhere" is
 * said out loud there, never as an absent parameter). Here it means only
 * "the reader picked the option that means nothing is chosen", which the
 * `next selection` functions below turn into `"all"` or `null`, never into
 * this string.
 */
export const ALL_VALUE = "all";

/** One row a `<calcite-select>` can offer. A row carrying `group` renders
 * under a heading of that name, which is how the hierarchy shows inside one
 * menu: county rows sit under their state, subregion rows under their
 * region, basin rows under their subregion. Indented groups, not flyout
 * submenus -- measured at 360px, where a flyout's full list is several
 * screens of popup scroll. */
export interface WhereOption {
  value: string;
  label: string;
  group?: string;
}

/** One menu's worth of state: what to offer, and which one is chosen. */
export interface WhereAxis {
  value: string;
  options: readonly WhereOption[];
}

/**
 * A subregion's label, disambiguated the way the landed coarse-area work
 * already does (`main.ts`'s former `coarseAreaLabel`): nineteen of the drawn
 * basins carry their subregion's name exactly, so a bare "Bear" would be
 * two rows in one list meaning different things. Region needs no such
 * suffix -- the published `west-huc2` names already say so ("Upper Colorado
 * Region"), and `parseDrainageUnits` already falls a missing name back to
 * the code itself, so there is nothing this function would add. Basin needs
 * none either: nothing narrower is offered beneath it, so no heading could
 * ever repeat its name back at a reader.
 */
function subregionOptionLabel(name: string): string {
  return `${name} subregion`;
}

/**
 * A reader's new state pick, resolved rather than assumed alive.
 *
 * Reuses `resolveOpeningScope` for the one thing a state change can break: a
 * region, subregion or basin narrowed under the old state may reach nowhere
 * under the new one (`?state=WY` after a Great Basin subregion choice, say).
 * `resolveOpeningScope` already answers that -- a dead area falls to `null`,
 * a live one is kept exactly -- so this function does not repeat the check,
 * it only builds the tentative selection the resolver is asked about.
 */
export function nextSelectionForState(
  current: OpeningSelection, rosters: OpeningRosters, chosen: string
): OpeningSelection {
  const state = chosen === ALL_VALUE ? "all" : chosen;
  return resolveOpeningScope({ state, area: current.area }, rosters).selection;
}

/**
 * One county a Where menu can offer.
 *
 * `fips` is the five-digit code and is the option's value -- ADR-058's key
 * rule, which survives every presentation change including this one. Two
 * counties of the same name in different states stay two different choices
 * because their codes differ; the state travels only as the group heading
 * (ADR-076).
 */
export interface CountyChoice {
  fips: string;
  name: string;
  /** The USPS two-letter code of the state the county sits under. */
  state: string;
}

/**
 * The label a county row carries inside its state's group.
 *
 * The group heading already names the state, so the row does not repeat it
 * (ADR-076's rule). The word "County" stays on the row rather than moving
 * to a heading of its own: unlike a drainage menu's tiers, there is no
 * second level below a county for the word to be confused with, and dropping
 * it would leave bare names such as "Lake", which this roster holds three
 * of across states and which read as nothing on their own.
 */
function countyOptionLabel(name: string): string {
  return name.endsWith("County") ? name : `${name} County`;
}

/**
 * The Where menu's offered list and selected value: states as top-level
 * rows and, when the host can supply them, each state's counties grouped
 * beneath its name (ADR-084).
 *
 * State codes and FIPS codes never collide -- two letters against five
 * digits -- so one flat value space holds both kinds of row and a reader's
 * pick announces its own kind by shape. The caller turns a two-letter pick
 * into `?state=` and a five-digit pick into `?county=`; this function does
 * not know or care which parameters those are.
 *
 * Counties narrow by the held state when one is held, and all sit under
 * their headings when none is (ADR-084: "the county list narrows by the
 * chosen state alone, as ADR-076 left it"). The headings are why an
 * un-narrowed list was ever honest -- every county visibly belonged
 * somewhere -- but a state pick turns an out-of-state row into a two-click
 * emptying of the page, so the narrowing returns exactly while that risk
 * exists. Moving between states' counties costs one pass through "All";
 * silently emptying the page cost more.
 */
export function whereMenuView(
  rosters: OpeningRosters,
  selection: OpeningSelection,
  counties: readonly CountyChoice[] = [],
  selectedCounty: string | null = null,
  offered?: readonly StateOption[]
): WhereAxis {
  const scope = resolveOpeningScope(selection, rosters);
  const stateValue = scope.selection.state;

  /* The offered states come from the roster's own `states` column unless the
   * host brings its own answer. Overview does: it skips the reference export
   * entirely when the address bar names no place (the one fetch that page
   * otherwise has no reason to make), so its states come from the payload's
   * waterbodies -- the same fact at a different source, and a source that is
   * already in hand there. A host without its own list takes the default and
   * never knows the difference. */
  const stateOptions = offered ?? offeredStates({ drainageAreaStates: rosters.areas.map((area) => area.states) });
  const stateLabels = new Map(stateOptions.map((option) => [option.code, option.label]));

  const options: WhereOption[] = [{ value: ALL_VALUE, label: "All states" }];
  for (const option of stateOptions) options.push({ value: option.code, label: option.label });

  /* Grouped rows must be contiguous per group (the renderer opens one
   * option-group per consecutive run of the same heading), so counties are
   * sorted by state first and only then by name. A county whose state is
   * not among the offered rows cannot be grouped honestly and is dropped
   * rather than wearing a heading that names nothing -- the same rule the
   * drainage menu follows.
   *
   * And a held state narrows the counties to its own (ADR-084: "the county
   * list narrows by the chosen state alone, as ADR-076 left it"). The
   * headings made narrowing look unnecessary while no state was held --
   * every county is visible under some heading -- but with a state held,
   * an out-of-state row is a two-click emptying of the charts: pick it and
   * `?state=UT&county=06001` describes zero reservoirs, in silence. The
   * two axes still stay two; this narrows what is *offered*, never what is
   * *held*. */
  const grouped = [...counties]
    .filter((county) => stateLabels.has(county.state))
    .filter((county) => stateValue === "all" || county.state === stateValue)
    .sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
  for (const county of grouped) {
    const heading = stateLabels.get(county.state);
    options.push(heading
      ? { value: county.fips, label: countyOptionLabel(county.name), group: heading }
      : { value: county.fips, label: countyOptionLabel(county.name) });
  }

  /* Marking the selection: an explicit county wins over the state axis,
   * because both can be held at once (`?county=` narrows independently of
   * `?state=`), and what the menu should show is the finer of the two.
   * But only when that county is actually among the rows -- a link can
   * carry a pair this menu would not offer (`?state=UT&county=06001`), and
   * a selected value with no option behind it reads as whichever row the
   * browser lands on. Falling back to the state names the wider truth the
   * reader can act on. */
  const countyHeld = selectedCounty !== null
    && grouped.some((county) => county.fips === selectedCounty);
  const value = countyHeld ? selectedCounty! : stateValue === "all" ? ALL_VALUE : stateValue;
  return { value, options };
}

/**
 * The Drainage menu's offered list and selected value: regions, subregions
 * and basins in one menu, each finer tier grouped beneath its parent
 * (ADR-084).
 *
 * The lists come from `resolveOpeningScope` narrowed by the reader's state
 * and by nothing else -- deliberately not by the chosen area. The old
 * drill-down narrowed each axis by the axes above it because each axis was
 * a separate control whose siblings had to stay consistent; one menu spans
 * all three levels, so narrowing it against the reader's own pick would
 * strand them ("All" as the only way out of a family). State still
 * narrows, because Where is coarser than Drainage and a state choice that
 * emptied the menu would be a dead choice shown as live.
 *
 * Layout is tiers as sections: the region rows together, then subregions
 * grouped under their region's name, then basins grouped under their
 * subregion's name. Three selectable tiers over one level of groups works
 * because the tiers are ordered, not nested -- a reader meets coarser rows
 * first, and each group heading names the parent a row sits in, which is
 * ADR-076's rule carried to a third level.
 *
 * `include` gates rows by what the surface can draw, and it gates downward:
 * a basin row the surface cannot draw disappears, then a subregion whose
 * every basin disappeared goes with them, then a region likewise (snow's
 * 24 siteless basins, ADR-071's repair carried forward). It never gates
 * upward -- a gated basin does not remove its own subregion *selection*,
 * only the row, and aliveness of what was already chosen is the resolver's
 * answer, not this function's.
 */
export function drainageMenuView(
  rosters: OpeningRosters,
  selection: OpeningSelection,
  include?: (code: string) => boolean
): WhereAxis {
  const resolved = resolveOpeningScope(selection, rosters).selection.area;

  /* State-narrowed only. Asking the resolver with `area: null` is what
   * leaves every tier whole: its `regions`, `subregions` and `areas` are
   * each narrowed by the state and by the coarser prefixes of the given
   * area, and a `null` area has no prefixes, so all three come back as
   * full lists the reader can move within. */
  const scope = resolveOpeningScope({ state: selection.state, area: null }, rosters);

  const keepBasin = (area: DrainageArea): boolean => include === undefined || include(area.huc6);
  const basins = scope.areas.filter(keepBasin);
  const basinPrefixes = new Set(basins.map((area) => area.huc6.slice(0, SUBREGION_WIDTH)));
  const subregions = scope.subregions.filter((subregion) => basinPrefixes.has(subregion.huc6));
  const subregionPrefixes = new Set(subregions.map((subregion) => subregion.huc6.slice(0, REGION_WIDTH)));
  const regions = scope.regions.filter((region) => subregionPrefixes.has(region.huc6));

  const regionNames = new Map(regions.map((region) => [region.huc6, region.name]));
  const subregionNames = new Map(subregions.map((subregion) => [subregion.huc6, subregion.name]));

  const options: WhereOption[] = [{ value: ALL_VALUE, label: "All drainage areas" }];

  /* Regions ungrouped: they are the coarsest section and have no parent to
   * name. Their published names already carry the word "Region" where the
   * source publishes it, and `parseDrainageUnits` falls back to the code
   * itself when the source publishes no name. */
  for (const region of regions) options.push({ value: region.huc6, label: region.name });

  for (const subregion of subregions) {
    const group = regionNames.get(subregion.huc6.slice(0, REGION_WIDTH));
    options.push(group
      ? { value: subregion.huc6, label: subregionOptionLabel(subregion.name), group }
      : { value: subregion.huc6, label: subregionOptionLabel(subregion.name) });
  }

  /* Basins sorted by subregion prefix so same-group rows are contiguous,
   * which is what the renderer's one-group-per-consecutive-run rule needs;
   * alphabetical within the group, so a reader scanning for a name scans
   * one short ordered list. An area the roster cannot place under a
   * surviving subregion stays ungrouped rather than wearing a raw-digit
   * heading. */
  const placed = [...basins].sort((a, b) =>
    a.huc6.slice(0, SUBREGION_WIDTH).localeCompare(b.huc6.slice(0, SUBREGION_WIDTH)) ||
    a.name.localeCompare(b.name));
  for (const area of placed) {
    const group = subregionNames.get(area.huc6.slice(0, SUBREGION_WIDTH));
    options.push(group
      ? { value: area.huc6, label: area.name, group }
      : { value: area.huc6, label: area.name });
  }

  return { value: resolved ?? ALL_VALUE, options };
}

/**
 * What a reader's Drainage-menu pick means, resolved rather than assumed.
 *
 * "All drainage areas" clears the area entirely -- the menu spans every
 * level, so there is no coarser tier left to fall back to, which is the one
 * place this differs from the old per-axis fallbacks. Any other value is a
 * code at one of the three widths; the resolver checks it against the state
 * narrowing (a pick came from this same menu, so the common case is that it
 * survives exactly) and answers the honoured selection.
 *
 * Whether the pick also forces a level change is the *host's* question --
 * only the host knows which level it draws -- and it answers it by comparing
 * the code's width to that level, which is why this function returns just
 * the selection.
 */
export function nextSelectionForDrainageRow(
  current: OpeningSelection, rosters: OpeningRosters, chosen: string
): OpeningSelection {
  if (chosen === ALL_VALUE) return { state: current.state, area: null };
  return resolveOpeningScope({ state: current.state, area: chosen }, rosters).selection;
}
