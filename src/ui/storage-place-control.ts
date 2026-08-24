/* DOM controls for Storage's sequential place flow (ADR-095). */
import "@esri/calcite-components/components/calcite-label";
import "@esri/calcite-components/components/calcite-option";
import "@esri/calcite-components/components/calcite-select";
import type { OpeningRosters, OpeningSelection } from "../data/opening-scope";
import type { StateOption } from "../data/state-vocabulary";
import {
  storageAreaWords,
  storageCountyAxis,
  storageDrainageAxis,
  storageStateAxis,
  type StorageCountyChoice,
  type StoragePlaceAxis
} from "./storage-place-control-model";

export interface StoragePlaceControl {
  element: HTMLElement;
  set(axis: StoragePlaceAxis): void;
}

interface ControlOptions {
  scale?: "s" | "m" | "l";
}

function fill(select: HTMLElement, axis: StoragePlaceAxis): void {
  select.replaceChildren(...axis.options.map((option) => {
    const node = document.createElement("calcite-option");
    node.setAttribute("value", option.value);
    node.textContent = option.label;
    if (option.value === axis.value) node.setAttribute("selected", "");
    return node;
  }));
}

function create(
  className: string,
  visibleLabel: string,
  accessibleLabel: string,
  axis: StoragePlaceAxis,
  onPick: (value: string) => void,
  options: ControlOptions
): StoragePlaceControl {
  const wrapper = document.createElement("div");
  wrapper.className = className;
  const label = document.createElement("calcite-label");
  label.append(visibleLabel);
  const select = document.createElement("calcite-select");
  select.setAttribute("scale", options.scale ?? "m");
  select.setAttribute("label", accessibleLabel);
  fill(select, axis);
  select.addEventListener("calciteSelectChange", () => {
    onPick((select as unknown as { value: string }).value);
  });
  label.append(select);
  wrapper.append(label);
  return {
    element: wrapper,
    set(next: StoragePlaceAxis): void {
      fill(select, next);
    }
  };
}

export function createStorageStateControl(
  states: readonly StateOption[],
  selection: OpeningSelection,
  onPick: (value: string) => void,
  options: ControlOptions = {}
): StoragePlaceControl {
  return create(
    "storage-state-menu", "State", "Which state to show",
    storageStateAxis(states, selection), onPick, options);
}

export function createStorageCountyControl(
  counties: readonly StorageCountyChoice[],
  selected: string | null,
  onPick: (value: string) => void,
  options: ControlOptions = {}
): StoragePlaceControl | null {
  if (counties.length === 0) return null;
  return create(
    "storage-county-menu", "County", "Which county to show",
    storageCountyAxis(counties, selected), onPick, options);
}

export function createStorageDrainageControl(
  rosters: OpeningRosters,
  selection: OpeningSelection,
  level: number,
  include: ReadonlySet<string>,
  onPick: (value: string) => void,
  options: ControlOptions = {}
): StoragePlaceControl | null {
  const axis = storageDrainageAxis(rosters, selection, level, include);
  if (axis.options.length <= 1) return null;
  const words = storageAreaWords(level);
  return create(
    "drainage-menu storage-drainage-menu",
    words.singular,
    `Which ${words.singular.toLowerCase()} to show`,
    axis,
    onPick,
    options);
}
