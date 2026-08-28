/*
 * The pure model for drought's page-specific geographic controls (ADR-091).
 * State and county are sequential place choices. Area size then decides the
 * one hydrologic tier the last menu offers; it never mixes regions,
 * subregions, basins and subbasins into one long list.
 */
import {
  resolveOpeningScope,
  type OpeningRosters,
  type OpeningSelection
} from "../data/opening-scope";
import type { CountyChoice } from "../data/county-scope";
import { offeredStates } from "../data/state-vocabulary";
import { regionNameInContext } from "./place-label";

export const ALL_VALUE = "all";

export interface DroughtPlaceOption {
  value: string;
  label: string;
}

export interface DroughtPlaceAxis {
  value: string;
  options: readonly DroughtPlaceOption[];
}

const LEVEL_WORDS: Readonly<Record<number, { singular: string; plural: string }>> = {
  2: { singular: "Region", plural: "regions" },
  4: { singular: "Subregion", plural: "subregions" },
  6: { singular: "Basin", plural: "basins" },
  8: { singular: "Subbasin", plural: "subbasins" }
};

export function droughtAreaWords(level: number): { singular: string; plural: string } {
  return LEVEL_WORDS[level] ?? { singular: "Drainage area", plural: "drainage areas" };
}

export function droughtStateAxis(
  rosters: OpeningRosters, selection: OpeningSelection
): DroughtPlaceAxis {
  const states = offeredStates({ drainageAreaStates: rosters.areas.map((area) => area.states) });
  return {
    value: selection.state,
    options: [
      { value: ALL_VALUE, label: "All states" },
      ...states.map((state) => ({ value: state.code, label: state.label }))
    ]
  };
}

export function droughtCountyAxis(
  counties: readonly CountyChoice[], selected: string | null
): DroughtPlaceAxis {
  const value = selected !== null && counties.some((county) => county.fips === selected)
    ? selected : ALL_VALUE;
  return {
    value,
    options: [
      { value: ALL_VALUE, label: "All counties" },
      ...counties.map((county) => ({ value: county.fips, label: county.name }))
    ]
  };
}

export function droughtDrainageAxis(
  rosters: OpeningRosters,
  selection: OpeningSelection,
  level: number,
  include?: ReadonlySet<string>
): DroughtPlaceAxis {
  /* State narrows first. The held area does not narrow its own menu: it must
   * remain possible to move directly to a sibling without clearing first. */
  const scope = resolveOpeningScope({ state: selection.state, area: null }, rosters);
  const candidates = level === 2 ? scope.regions
    : level === 4 ? scope.subregions
      : level === 8 ? scope.subbasins
        : scope.areas;
  const offered = include === undefined
    ? candidates : candidates.filter((candidate) => include.has(candidate.huc6));
  const held = selection.area !== null && selection.area.length === level
    && offered.some((candidate) => candidate.huc6 === selection.area)
    ? selection.area : ALL_VALUE;
  const words = droughtAreaWords(level);
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

export function selectionForDroughtState(chosen: string): OpeningSelection {
  return { state: chosen === ALL_VALUE ? "all" : chosen, area: null };
}

export function selectionForDroughtArea(
  current: OpeningSelection, chosen: string
): OpeningSelection {
  return { state: current.state, area: chosen === ALL_VALUE ? null : chosen };
}
