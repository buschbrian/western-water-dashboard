/*
 * The two place menus (ADR-084): a Where menu -- states, and counties
 * grouped beneath them when the host can supply county material -- and a
 * Drainage-area menu -- regions, subregions and basins in one grouped
 * select spanning levels.
 *
 * Modelled closely on `createLevelControl` (`ui/level-control.ts`) -- built
 * from what the reference export publishes, never a list written here;
 * returns `null` when there is nothing to choose; takes a Calcite `scale`
 * because the hosts differ.
 *
 * The option lists and what a reader's raw pick means are all
 * `where-control-model.ts` -- pure functions built over
 * `data/opening-scope.ts#resolveOpeningScope`, kept apart from this file's
 * DOM building so they are testable in plain Node (see that module's own
 * doc). This file is the thin layer that turns their views into real
 * `<calcite-select>`s and wires changes back through the model's
 * next-selection functions.
 *
 * Neither menu navigates itself. Each calls its callback with the reader's
 * raw pick, and each host's own wiring decides what "changed" means for
 * that page -- including the one case only the host can judge, a drainage
 * row finer than the level the page draws, which takes the shared-link
 * path (`location.replace`) rather than a re-render, because the level
 * decides which files the page fetches (ADR-064).
 */
import "@esri/calcite-components/components/calcite-label";
import "@esri/calcite-components/components/calcite-option";
import "@esri/calcite-components/components/calcite-option-group";
import "@esri/calcite-components/components/calcite-select";
import type { OpeningRosters, OpeningSelection } from "../data/opening-scope";
import {
  drainageMenuView,
  nextSelectionForDrainageRow,
  whereMenuView,
  type CountyChoice
} from "./where-control-model";

/**
 * One pick of the Where menu. `kind` is decided by the shape of the value,
 * not by anything this module tracks: a five-digit value is a FIPS code
 * (`kind: "county"`), anything else is a state choice -- the sentinel
 * `"all"` included, which means every place axis this menu holds is
 * cleared, because one menu asking one question has one "nowhere".
 */
export interface WherePick {
  kind: "state" | "county";
  /** The raw option value: a USPS code, a FIPS code, or `"all"`. */
  value: string;
}

export interface WhereMenuOptions {
  /**
   * The Calcite scale to build the select at. The same reasoning as
   * `createLevelControl`'s own option: a control eleven pixels shorter than
   * the controls beside it reads as a different kind of control rather
   * than as one more of them.
   */
  scale?: "s" | "m" | "l";
  /**
   * The counties the surface can offer, with the five-digit FIPS as the
   * key (ADR-058) and the state travelling only as the group heading
   * (ADR-076). Empty or omitted leaves a states-only menu, which is what a
   * surface without county material takes -- a county group must never be
   * half-offered.
   */
  counties?: readonly CountyChoice[];
  /**
   * The currently held county, when the surface keeps that axis and a link
   * or stored view named one. Marked selected in place of the state row;
   * `null` (the default) marks the state itself.
   */
  selectedCounty?: string | null;
}

export interface WhereMenu {
  element: HTMLElement;
}

/* No `set()`, deliberately, and unlike `createLevelControl` which has one.
 *
 * Every host builds these menus from a selection that is already final: the
 * pages widen for a deep link before constructing them, and nothing
 * reassigns the scope afterwards. A method to push a later selection in
 * would never be called, and an unreachable method is not insurance -- it
 * is untested code that reads as a supported path. */

export function createWhereMenu(
  rosters: OpeningRosters,
  current: OpeningSelection,
  onPick: (pick: WherePick) => void,
  options: WhereMenuOptions = {}
): WhereMenu | null {
  const view = whereMenuView(
    rosters, current, options.counties ?? [], options.selectedCounty ?? null);
  /* Nothing offered beyond the sentinel means no choice exists: an
   * unpublished or unreachable reference export degrades to exactly this. */
  if (view.options.length <= 1) return null;

  const scale = options.scale ?? "m";
  const wrapper = document.createElement("div");
  wrapper.className = "where-menu";

  const label = document.createElement("calcite-label");
  label.append("Where");
  const select = document.createElement("calcite-select");
  select.setAttribute("scale", scale);
  /* The accessible name says what changes, not what the control is: the
   * visible label is already read out, and hearing "Where" twice teaches
   * nothing the second time. */
  select.setAttribute("label", "Which state or county to show");
  fillSelect(select, view.options, view.value);
  select.addEventListener("calciteSelectChange", () => {
    const value = (select as unknown as { value: string }).value;
    const kind: WherePick["kind"] = /^\d{5}$/.test(value) ? "county" : "state";
    onPick({ kind, value });
  });
  label.append(select);
  wrapper.append(label);

  return { element: wrapper };
}

export interface DrainageMenuOptions {
  /**
   * The Calcite scale to build the select at. Same reasoning as the Where
   * menu's: match the controls beside it.
   */
  scale?: "s" | "m" | "l";
  /**
   * Gates rows by what the surface can draw, tested against each row's own
   * code. Omitted offers the whole published roster. Snow passes one built
   * from its publishable figures at every level; the 24 siteless basins
   * must not come back as choices that empty the page (ADR-071's repair,
   * carried forward as per-row gating under ADR-084).
   */
  include?: (code: string) => boolean;
}

export interface DrainageMenu {
  element: HTMLElement;
  /**
   * Reflect a selection the page adopted from somewhere else, such as a
   * link read after construction. Marks the matching row, or "All drainage
   * areas" when the selection names nothing or names something the menu
   * does not offer -- a surviving choice shows as a row, a dead one reads
   * as all, never as a value with no option behind it.
   */
  set(selection: OpeningSelection): void;
}

export function createDrainageMenu(
  rosters: OpeningRosters,
  current: OpeningSelection,
  onPick: (selection: OpeningSelection) => void,
  options: DrainageMenuOptions = {}
): DrainageMenu | null {
  let selection = current;

  const firstView = drainageMenuView(rosters, selection, options.include);
  if (firstView.options.length <= 1) return null;

  const scale = options.scale ?? "m";
  const wrapper = document.createElement("div");
  wrapper.className = "drainage-menu";

  const label = document.createElement("calcite-label");
  label.append("Drainage area");
  const select = document.createElement("calcite-select");
  select.setAttribute("scale", scale);
  select.setAttribute("label", "Which drainage area to show");
  label.append(select);
  wrapper.append(label);

  function render(): void {
    const view = drainageMenuView(rosters, selection, options.include);
    fillSelect(select, view.options, view.value);
  }

  select.addEventListener("calciteSelectChange", () => {
    const chosen = (select as unknown as { value: string }).value;
    selection = nextSelectionForDrainageRow(selection, rosters, chosen);
    render();
    onPick(selection);
  });

  render();

  return {
    element: wrapper,
    set(next: OpeningSelection): void {
      selection = next;
      render();
    }
  };
}

/**
 * Replaces `select`'s options with `options` and marks `selected` chosen.
 *
 * Consecutive options carrying the same `group` are wrapped in one
 * `calcite-option-group` heading, which is how the Where menu shows
 * counties under their state and the Drainage menu shows subregions under
 * their region and basins under their subregion. Indented groups inside
 * one menu, not flyout submenus: measured at 360px, where a flyout's full
 * list is several screens of popup scroll and hover is not available
 * anyway, an option group keeps the browser's own keyboard navigation of a
 * native `<select>` -- which is what `calcite-select` renders internally.
 *
 * `selected`, when given, marks the matching option through the attribute
 * alone -- not the attribute and an assigned `.value`. `document
 * .createElement` upgrades a registered Calcite element synchronously, and
 * `calcite-select` re-reads its options on a microtask, so the attribute is
 * always seen; two lines doing one thing need a reason and there is none.
 */
function fillSelect(
  select: HTMLElement, options: readonly { value: string; label: string; group?: string }[],
  selected?: string
): void {
  select.replaceChildren();
  let group: HTMLElement | null = null;
  let current: string | undefined;
  for (const option of options) {
    if (option.group !== current) {
      group = option.group === undefined ? null : (() => {
        const node = document.createElement("calcite-option-group");
        node.setAttribute("label", option.group!);
        select.append(node);
        return node;
      })();
      current = option.group;
    }
    const node = document.createElement("calcite-option");
    node.setAttribute("value", option.value);
    node.textContent = option.label;
    if (selected !== undefined && option.value === selected) node.setAttribute("selected", "");
    (group ?? select).append(node);
  }
}
