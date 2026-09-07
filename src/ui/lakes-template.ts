/*
 * The terminal-lakes page's frame, less everything the payload supplies
 * (ADR-118). The same split the reservoir page makes: structure and rule
 * text here, readings filled in by the entry point.
 */
import "@esri/calcite-components/components/calcite-action";
import "@esri/calcite-components/components/calcite-navigation";

import { brandMarkup, pageLinksMarkup } from "./page-header";

export function lakesTemplate(search: string): string {
  return `
  <calcite-navigation class="reservoir-nav" aria-label="Primary navigation">
    ${brandMarkup(2, "lakes")}
    ${pageLinksMarkup("lakes", search)}
    <calcite-action id="theme-toggle" slot="content-end" text="Theme: system"
      icon="brightness" label="Change color theme"></calcite-action>
  </calcite-navigation>
  <main class="reservoir-main lakes-main" id="lakes-main" aria-busy="true"
    aria-live="polite">
    <p class="eyebrow">Terminal lakes</p>
    <h1 class="reservoir-name">Lakes with no outlet</h1>
    <p class="reservoir-note">A terminal lake sits at the end of a closed basin. Water
      flows in and leaves only by evaporation. No dam holds it and no full level is
      defined for it, so this site shows its surface level and its volume, and never a
      percent full. These lakes are not counted in any reservoir total.</p>
    <div id="lakes-list"><p class="initial-loading">Loading lake readings&hellip;</p></div>
  </main>
  <footer class="app-footer reservoir-footer">
    <a href="./data.html">Use the public data API</a> ·
    <a href="./methods.html">Methods and sources</a> ·
    <a href="./terms.html">Terms and license</a>
  </footer>`;
}
