import type { EffectiveTheme } from "../state/theme";

/**
 * Puts one theme on the document: the attribute the site's own CSS reads,
 * the class pair Calcite reads, and the colour scheme the browser draws
 * native controls in. One function, so a page that sets its theme without
 * the reader's stored preference (the story views, ADR-128) cannot drift
 * from the pages that do.
 *
 * Reads and writes no storage.
 */
export function stampTheme(theme: EffectiveTheme): void {
  const root = document.documentElement;
  root.classList.toggle("calcite-mode-dark", theme === "dark");
  root.classList.toggle("calcite-mode-light", theme === "light");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}
