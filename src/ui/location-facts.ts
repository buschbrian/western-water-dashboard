import type { HydrologicPathPart } from "../data/hydrologic-path";
import { copyText } from "../state/share";
import type { CoordinateText } from "../viz/coordinates";
import { regionNameInContext } from "./place-label";

export interface LocationRow {
  label: string;
  value: string;
}

function placeName(part: HydrologicPathPart): string | null {
  if (part.name === null) return null;
  return part.level === 2 ? regionNameInContext(part.name) : part.name;
}

/** Compact rows for the storage details panel. */
export function hydrologicPathRows(
  path: readonly HydrologicPathPart[]
): LocationRow[] {
  return path.map((part) => {
    const name = placeName(part);
    return {
      label: part.label,
      value: name ? `${name} (${part.code})` : part.code
    };
  });
}

/**
 * A full location block for the reading pages.
 *
 * The ordered list carries the containment relationship; coordinates are
 * separate facts because a point and a drainage area answer different
 * geographic questions.
 */
export function createLocationFacts(
  path: readonly HydrologicPathPart[],
  coordinates: CoordinateText | null,
  pointLabel = "Published point"
): HTMLElement | null {
  if (path.length === 0 && coordinates === null) return null;
  const host = document.createElement("div");
  host.className = "location-facts";

  if (path.length > 0) {
    const list = document.createElement("ol");
    list.className = "hydrologic-path";
    list.setAttribute("aria-label", "Hydrologic path");
    for (const part of path) {
      const item = document.createElement("li");
      const level = document.createElement("span");
      level.className = "hydrologic-path-level";
      level.textContent = part.label;
      const name = document.createElement("span");
      name.className = "hydrologic-path-name";
      name.textContent = placeName(part) ?? "Name not published";
      const code = document.createElement("code");
      code.textContent = part.code;
      item.append(level, name, code);
      list.append(item);
    }
    host.append(list);
  }

  if (coordinates) {
    const list = document.createElement("dl");
    list.className = "coordinate-facts";
    for (const row of [
      { label: pointLabel, value: coordinates.decimal },
      { label: "Degrees, minutes and seconds", value: coordinates.dms }
    ]) {
      const term = document.createElement("dt");
      term.textContent = row.label;
      const value = document.createElement("dd");
      value.textContent = row.value;
      list.append(term, value);
    }
    host.append(list);

    const actions = document.createElement("div");
    actions.className = "coordinate-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "coordinate-copy";
    button.textContent = "Copy coordinates";
    const status = document.createElement("span");
    status.className = "coordinate-copy-status";
    status.setAttribute("role", "status");
    button.addEventListener("click", () => {
      void copyText(coordinates.copy, navigator.clipboard).then((copied) => {
        status.textContent = copied
          ? "Coordinates copied."
          : "Coordinates could not be copied.";
      });
    });
    actions.append(button, status);
    host.append(actions);
  }
  return host;
}
