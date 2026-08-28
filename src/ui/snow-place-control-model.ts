/*
 * Snowpack's sequential place controls (ADR-094). State is the verified
 * land axis this payload carries. Area size then decides which one
 * hydrologic tier the last control offers, so a reader never has to choose
 * a region, subregion or basin from one mixed list.
 *
 * County is intentionally absent. Snow sites publish a county name but no
 * five-digit FIPS code, and ADR-084 keeps a county axis off this surface
 * until that identity is resolved.
 */
import {
  resolveOpeningScope,
  type OpeningRosters,
  type OpeningSelection
} from "../data/opening-scope";
import { offeredStates } from "../data/state-vocabulary";
import { regionNameInContext } from "./place-label";

export const ALL_VALUE = "all";

export interface SnowPlaceOption {
  value: string;
  label: string;
}

export interface SnowPlaceAxis {
  value: string;
  options: readonly SnowPlaceOption[];
}

const LEVEL_WORDS: Readonly<Record<number, { singular: string; plural: string }>> = {
  2: { singular: "Region", plural: "regions" },
  4: { singular: "Subregion", plural: "subregions" },
  6: { singular: "Basin", plural: "basins" }
};

export function snowAreaWords(level: number): { singular: string; plural: string } {
  return LEVEL_WORDS[level] ?? { singular: "Drainage area", plural: "drainage areas" };
}

export function snowStateAxis(
  rosters: OpeningRosters, selection: OpeningSelection
): SnowPlaceAxis {
  const states = offeredStates({ drainageAreaStates: rosters.areas.map((area) => area.states) });
  return {
    value: selection.state,
    options: [
      { value: ALL_VALUE, label: "All states" },
      ...states.map((state) => ({ value: state.code, label: state.label }))
    ]
  };
}

export function snowDrainageAxis(
  rosters: OpeningRosters,
  selection: OpeningSelection,
  level: number,
  include: ReadonlySet<string>
): SnowPlaceAxis {
  /* State narrows first. The held area never narrows its own control, so a
   * reader can move directly to a sibling without clearing it first. */
  const scope = resolveOpeningScope({ state: selection.state, area: null }, rosters);
  const candidates = level === 2 ? scope.regions
    : level === 4 ? scope.subregions
      : scope.areas;
  const offered = candidates.filter((candidate) => include.has(candidate.huc6));
  const held = selection.area !== null && selection.area.length === level
    && offered.some((candidate) => candidate.huc6 === selection.area)
    ? selection.area : ALL_VALUE;
  const words = snowAreaWords(level);
  return {
    value: held,
    options: [
      { value: ALL_VALUE, label: `All ${words.plural}` },
      ...offered.map((area) => ({
        value: area.huc6,
        label: level === 2 ? regionNameInContext(area.name) : area.name
      }))
    ]
  };
}

export function selectionForSnowState(chosen: string): OpeningSelection {
  return { state: chosen === ALL_VALUE ? "all" : chosen, area: null };
}

export function selectionForSnowArea(
  current: OpeningSelection, chosen: string
): OpeningSelection {
  return { state: current.state, area: chosen === ALL_VALUE ? null : chosen };
}
