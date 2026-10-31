/*
 * The precipitation page (ADR-130): the precipitation card (ADR-125) on a
 * page of its own, for the place in the link. It scopes a place with the
 * snow page's own functions (`snow-place.ts`), as the story views do, so
 * the two pages count the same stations for the same place.
 *
 * Every exit from loading clears `aria-busy`, the failed one included: the
 * card owns its own, and this page's only wait is the place.
 */
import "@esri/calcite-components/main.css";
import { setAssetPath as setCalciteAssetPath } from "@esri/calcite-components";
import "@esri/calcite-components/components/calcite-action";
import "@esri/calcite-components/components/calcite-loader";
import "@esri/calcite-components/components/calcite-navigation";

import {
  EMPTY_OPENING_ROSTERS,
  loadOpeningRosters,
  type OpeningRosters,
  type OpeningSelection
} from "./data/opening-scope";
import { loadSnowpack } from "./data/snow-load";
import { stateName } from "./data/state-vocabulary";
import { basinChoices } from "./snow-model";
import { openingAreaName, snowPlace, type SnowPlace } from "./snow-place";
import { levelFromSearch } from "./state/level";
import { readStoredPlace, resolveOpeningPlace, searchWithPlace } from "./state/opening-preference";
import { linkHref, portableSearch } from "./state/portable-url";
import { placeInSlot } from "./ui/dom";
import { wireMobileFilterDisclosure } from "./ui/mobile-filter-disclosure";
import { setupPlaceChooser } from "./ui/opening-splash";
import { brandMarkup, pageLinksMarkup } from "./ui/page-header";
import { setupPlaceSearch } from "./ui/place-search";
import { createPrecipitationCard } from "./ui/precipitation-card";
import { createPrecipMapSection, type PrecipMapSection } from "./ui/precip-map-section";
import { createSnowDrainageControl, createSnowStateControl } from "./ui/snow-place-control";
import { selectionForSnowArea, selectionForSnowState } from "./ui/snow-place-control-model";
import { wireTheme } from "./ui/theme";
import "./styles/overview.css";
import "./styles/snow.css";

setCalciteAssetPath(new URL(/* @vite-ignore */ "../", import.meta.url).href);
const root = document.querySelector<HTMLElement>("#precip-app");
if (!root) throw new Error("Missing #precip-app root");

root.innerHTML = `
  <calcite-navigation class="overview-nav" aria-label="Primary navigation">
    ${brandMarkup(1, "precipitation")}
    ${pageLinksMarkup("precipitation", window.location.search)}
    <calcite-action id="theme-toggle" slot="content-end" text="Theme: system"
      icon="brightness" label="Change color theme"></calcite-action>
  </calcite-navigation>
  <main class="overview-main">
    <header class="overview-intro">
      <p>This page shows the rain and snow caught by gauges at automatic mountain sites: in the last days, and added up since 1 October. The Natural Resources Conservation Service measures it every day.</p>
    </header>
    <section id="precip-content" aria-live="polite"><calcite-loader label="Loading precipitation measurements"></calcite-loader></section>
  </main>`;
wireTheme();
void setupPlaceChooser();
setupPlaceSearch("precipitation");

function placeSummary(place: SnowPlace): string {
  const state = place.scope.selection.state !== "all" ? stateName(place.scope.selection.state) : null;
  const area = openingAreaName(place.scope);
  const where = state && area ? `${state}, in ${area}` : state ?? area ?? "the whole region";
  return `Showing precipitation for ${where}: ${place.stations.length} measurement sites.`;
}

function navigateWithPlace(selection: OpeningSelection): void {
  /* `searchWithPlace` remembers the choice and writes "everywhere" out loud,
   * as on every other page. A full navigation: every figure is a mean over
   * a different set of stations. */
  window.location.replace(`${window.location.pathname}${searchWithPlace(window.location.search, selection)}`);
}

function renderPage(place: SnowPlace, rosters: OpeningRosters, level: number): void {
  const content = document.querySelector<HTMLElement>("#precip-content");
  if (!content) return;
  const snowHref = linkHref("./snow.html", portableSearch(window.location.search));
  content.innerHTML = `
    <p id="precip-scope-summary" class="filter-status" role="status"></p>
    <section class="dashboard-filterbar mobile-filterbar" aria-labelledby="precip-filter-heading">
      <div class="filterbar-head">
        <div class="filterbar-title"><p class="eyebrow">Precipitation</p><h2 id="precip-filter-heading">Choose a place</h2></div>
        <button id="precip-filter-toggle" class="mobile-filter-toggle" type="button"
          aria-controls="precip-filter-controls" aria-expanded="false">Show filters</button>
      </div>
      <div id="precip-filter-controls" class="filterbar-controls snow-place-controls">
        <div class="control-slot" data-slot="state"></div>
        <div class="control-slot" data-slot="area"></div>
      </div>
    </section>
    <section class="overview-card" id="precip-card" aria-labelledby="precip-heading">
      <div class="card-heading">
        <div><h2 id="precip-heading">Precipitation</h2><p>Rain and snow caught by the gauges at the measurement sites. The newest totals come first, then the season since 1 October against every year since 1991.</p></div>
      </div>
    </section>
    <section class="overview-card" aria-labelledby="precip-snow-heading">
      <div class="card-heading">
        <div><h2 id="precip-snow-heading">Snow at the same sites</h2><p>The same sites measure the water held in the snow. The snowpack page compares it with normal for the day, by drainage area. <a href="${snowHref}">Open the snowpack view for this place</a></p></div>
      </div>
    </section>`;

  const summary = content.querySelector<HTMLElement>("#precip-scope-summary");
  if (summary) summary.textContent = placeSummary(place);

  const filterbar = content.querySelector<HTMLElement>(".mobile-filterbar");
  const filterToggle = content.querySelector<HTMLButtonElement>("#precip-filter-toggle");
  if (filterbar && filterToggle) wireMobileFilterDisclosure(filterbar, filterToggle);
  const controls = content.querySelector<HTMLElement>("#precip-filter-controls");
  const selection = place.scope.selection;
  if (controls) {
    const state = createSnowStateControl(rosters, selection, (value) => {
      navigateWithPlace(selectionForSnowState(value));
    }, { scale: "l" });
    placeInSlot(controls, "state", state.element);
    const tierCodes = new Set(basinChoices(place.payload).map((choice) => choice.code));
    const drainage = createSnowDrainageControl(rosters, selection, level, tierCodes, (value) => {
      navigateWithPlace(selectionForSnowArea(selection, value));
    }, { scale: "l" });
    if (drainage) placeInSlot(controls, "area", drainage.element);
  }

  const section = content.querySelector<HTMLElement>("#precip-card");
  if (!section) return;
  const siteHref = (station: string): string => `./snow.html?state=all&site=${encodeURIComponent(station)}`;
  let mapSection: PrecipMapSection | null = null;
  const card = createPrecipitationCard(section, () => {
    mapSection?.update(card.recent.window, card.recent.totals);
    publishReady();
  }, { siteHref, recentMap: true });
  const publishReady = (): void => {
    window.__precipReady = {
      level,
      area: place.area ?? place.scope.selection.area,
      sites: place.stations.length,
      precipitation: card.status,
      ...(mapSection ? { map: mapSection.status } : {})
    };
  };
  const slot = card.parts.mapSlot;
  if (slot) {
    const inPlace = new Set(place.stations);
    mapSection = createPrecipMapSection(slot, place.payload,
      place.payload.sites.filter((site) => inPlace.has(site.station)),
      level, place.scope.box, siteHref, () => publishReady(), {
        chooser: card.parts.recentChooser,
        showRecentList: (shown) => card.showRecentList(shown)
      });
  }
  card.update(place.stations, place.payload.sites);
  publishReady();
}

const level = levelFromSearch(window.location.search);

try {
  /* The payload and the rosters together, so the page never paints the
   * whole west and then narrows. A rosters failure costs the area
   * narrowing, not the page, as on the snow page. */
  const [raw, rosters] = await Promise.all([
    loadSnowpack(),
    loadOpeningRosters().catch((error: unknown): OpeningRosters => {
      console.warn("The opening-scope rosters could not load; the page " +
        "opens with no area narrowing.", error);
      return EMPTY_OPENING_ROSTERS;
    })
  ]);
  const selection = resolveOpeningPlace(window.location.search, readStoredPlace()).selection;
  /* The link's own area first: it may name an area finer than the six
   * digits the opening scope holds (ADR-103). */
  const linkArea = new URLSearchParams(window.location.search).get("area");
  const place = snowPlace(raw, rosters, { state: selection.state, area: linkArea ?? selection.area, level });
  renderPage(place, rosters, level);
} catch (error) {
  console.error("Precipitation view failed:", error);
  window.__precipReady = { level, area: null, sites: 0, precipitation: null };
  const content = document.querySelector<HTMLElement>("#precip-content");
  if (content) content.innerHTML = `<div class="overview-error" role="alert"><strong>The precipitation measurements could not load.</strong><p>Try again later or return to the storage map.</p></div>`;
}
