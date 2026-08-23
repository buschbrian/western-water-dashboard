/* DOM controls for Snowpack's sequential place flow (ADR-094). */
import "@esri/calcite-components/components/calcite-label";
import "@esri/calcite-components/components/calcite-option";
import "@esri/calcite-components/components/calcite-select";
import type { OpeningRosters, OpeningSelection } from "../data/opening-scope";
import {
  snowAreaWords,
  snowDrainageAxis,
  snowStateAxis,
  type SnowPlaceAxis
} from "./snow-place-control-model";

export interface SnowPlaceControl {
  element: HTMLElement;
}

interface ControlOptions {
  scale?: "s" | "m" | "l";
}

function fill(select: HTMLElement, axis: SnowPlaceAxis): void {
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
  axis: SnowPlaceAxis,
  onPick: (value: string) => void,
  options: ControlOptions
): SnowPlaceControl {
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
  return { element: wrapper };
}

export function createSnowStateControl(
  rosters: OpeningRosters,
  selection: OpeningSelection,
  onPick: (value: string) => void,
  options: ControlOptions = {}
): SnowPlaceControl {
  return create(
    "snow-state-menu", "State", "Which state to show",
    snowStateAxis(rosters, selection), onPick, options);
}

export function createSnowDrainageControl(
  rosters: OpeningRosters,
  selection: OpeningSelection,
  level: number,
  include: ReadonlySet<string>,
  onPick: (value: string) => void,
  options: ControlOptions = {}
): SnowPlaceControl | null {
  const axis = snowDrainageAxis(rosters, selection, level, include);
  if (axis.options.length <= 1) return null;
  const words = snowAreaWords(level);
  return create(
    "drainage-menu snow-drainage-menu",
    words.singular,
    `Which ${words.singular.toLowerCase()} to show`,
    axis,
    onPick,
    options);
}
