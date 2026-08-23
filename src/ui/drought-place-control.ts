/* DOM controls for drought's sequential place flow (ADR-091). */
import "@esri/calcite-components/components/calcite-label";
import "@esri/calcite-components/components/calcite-option";
import "@esri/calcite-components/components/calcite-select";
import type { CountyChoice } from "../data/county-scope";
import type { OpeningRosters, OpeningSelection } from "../data/opening-scope";
import {
  droughtAreaWords,
  droughtCountyAxis,
  droughtDrainageAxis,
  droughtStateAxis,
  type DroughtPlaceAxis
} from "./drought-place-control-model";

export interface DroughtPlaceControl {
  element: HTMLElement;
}

interface ControlOptions {
  scale?: "s" | "m" | "l";
}

function fill(select: HTMLElement, axis: DroughtPlaceAxis): void {
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
  axis: DroughtPlaceAxis,
  onPick: (value: string) => void,
  options: ControlOptions
): DroughtPlaceControl {
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

export function createDroughtStateControl(
  rosters: OpeningRosters,
  selection: OpeningSelection,
  onPick: (value: string) => void,
  options: ControlOptions = {}
): DroughtPlaceControl {
  return create(
    "drought-state-menu", "State", "Which state to show",
    droughtStateAxis(rosters, selection), onPick, options);
}

export function createDroughtCountyControl(
  counties: readonly CountyChoice[],
  selected: string | null,
  onPick: (value: string) => void,
  options: ControlOptions = {}
): DroughtPlaceControl | null {
  if (counties.length === 0) return null;
  return create(
    "drought-county-menu", "County", "Which county to show",
    droughtCountyAxis(counties, selected), onPick, options);
}

/** A stable slot while the hosted county list resolves. The page and its
 * drought figures do not wait for an unchosen optional filter. */
export function createDroughtCountyStatusControl(
  message: string,
  options: ControlOptions = {}
): DroughtPlaceControl {
  const axis: DroughtPlaceAxis = { value: "status", options: [{ value: "status", label: message }] };
  const control = create(
    "drought-county-menu drought-county-status",
    "County",
    message,
    axis,
    () => {},
    options);
  control.element.querySelector("calcite-select")?.setAttribute("disabled", "");
  return control;
}

export function createDroughtDrainageControl(
  rosters: OpeningRosters,
  selection: OpeningSelection,
  level: number,
  include: ReadonlySet<string> | undefined,
  onPick: (value: string) => void,
  options: ControlOptions = {}
): DroughtPlaceControl | null {
  const axis = droughtDrainageAxis(rosters, selection, level, include);
  if (axis.options.length <= 1) return null;
  const words = droughtAreaWords(level);
  return create(
    "drainage-menu drought-drainage-menu",
    words.singular,
    `Which ${words.singular.toLowerCase()} to show`,
    axis,
    onPick,
    options);
}
