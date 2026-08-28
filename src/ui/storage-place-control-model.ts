/*
 * Storage's sequential place controls (ADR-095). State names the waterbody
 * scope. County then uses the reviewed five-digit waterbody assignment,
 * Area size chooses the drawn tier, and the last control offers only that
 * tier. The last two choices remain storage analysis filters: they dim the
 * other reservoirs instead of changing the map's drawn geography.
 */
import {
  resolveOpeningScope,
  type OpeningRosters,
  type OpeningSelection
} from "../data/opening-scope";
import type { StateOption } from "../data/state-vocabulary";
import { regionNameInContext } from "./place-label";

export const ALL_VALUE = "all";

export interface StorageCountyChoice {
  fips: string;
  name: string;
}

export interface StoragePlaceOption {
  value: string;
  label: string;
}

export interface StoragePlaceAxis {
  value: string;
  options: readonly StoragePlaceOption[];
}

const LEVEL_WORDS: Readonly<Record<number, { singular: string; plural: string }>> = {
  2: { singular: "Region", plural: "regions" },
  4: { singular: "Subregion", plural: "subregions" },
  6: { singular: "Basin", plural: "basins" }
};

export function storageAreaWords(level: number): { singular: string; plural: string } {
  return LEVEL_WORDS[level] ?? { singular: "Drainage area", plural: "drainage areas" };
}

export function storageStateAxis(
  states: readonly StateOption[], selection: OpeningSelection
): StoragePlaceAxis {
  return {
    value: selection.state,
    options: [
      { value: ALL_VALUE, label: "All states" },
      ...states.map((state) => ({ value: state.code, label: state.label }))
    ]
  };
}

export function storageCountyAxis(
  counties: readonly StorageCountyChoice[], selected: string | null
): StoragePlaceAxis {
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

export function storageDrainageAxis(
  rosters: OpeningRosters,
  selection: OpeningSelection,
  level: number,
  include: ReadonlySet<string>
): StoragePlaceAxis {
  /* State narrows first. The held area does not narrow its own control, so
   * a reader can move directly to a sibling. `include` is the reservoir
   * evidence behind each offered row, optionally narrowed by County. */
  const scope = resolveOpeningScope({ state: selection.state, area: null }, rosters);
  const candidates = level === 2 ? scope.regions
    : level === 4 ? scope.subregions
      : scope.areas;
  const offered = candidates.filter((candidate) => include.has(candidate.huc6));
  const held = selection.area !== null && selection.area.length === level
    && offered.some((candidate) => candidate.huc6 === selection.area)
    ? selection.area : ALL_VALUE;
  const words = storageAreaWords(level);
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

export function selectionForStorageState(chosen: string): OpeningSelection {
  return { state: chosen === ALL_VALUE ? "all" : chosen, area: null };
}

export function selectionForStorageArea(
  current: OpeningSelection, chosen: string
): OpeningSelection {
  return { state: current.state, area: chosen === ALL_VALUE ? null : chosen };
}
