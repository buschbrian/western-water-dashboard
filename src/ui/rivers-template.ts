/*
 * The river-flow page's frame, less everything the payload supplies
 * (ADR-136). The lakes page's split: structure and rule text here, readings
 * filled in by the entry point.
 */
import "@esri/calcite-components/components/calcite-action";
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-navigation";

import { brandMarkup, pageLinksMarkup } from "./page-header";

export function riversTemplate(search: string): string {
  return `
  <calcite-navigation class="reservoir-nav" aria-label="Primary navigation">
    ${brandMarkup(2, "rivers")}
    ${pageLinksMarkup("rivers", search)}
    <calcite-action id="theme-toggle" slot="content-end" text="Theme: system"
      icon="brightness" label="Change color theme"></calcite-action>
  </calcite-navigation>
  <main class="reservoir-main rivers-main" id="rivers-main" aria-busy="true"
    aria-live="polite">
    <p class="eyebrow">River flow</p>
    <h1 class="reservoir-name">Daily flow at river gauges</h1>
    <p class="reservoir-note">Each value is the mean flow for one day, in cubic feet per
      second, from the U.S. Geological Survey. A daily mean cannot show a peak inside
      the day, and this page is not a flood warning.</p>
    <p class="reservoir-note">Where little or no water is stored upstream, the newest
      flow is compared with normal for the same date in earlier years. Where dams
      store and release water, the flow is shown alone.</p>
    <p class="reservoir-note">Each gauge measures a different river. Water joins and
      leaves below each gauge, so this site does not add the gauges together. No gauge
      here measures the water that goes into a reservoir.</p>
    <div id="rivers-list"><p class="initial-loading">Loading river readings&hellip;</p></div>
  </main>
  <footer class="app-footer reservoir-footer">
    <a href="./data.html">Use the public data API</a> ·
    <a href="./methods.html">Methods and sources</a> ·
    <a href="./terms.html">Terms and license</a>
  </footer>`;
}
