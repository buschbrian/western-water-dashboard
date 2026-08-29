/*
 * The drought view: the U.S. Drought Monitor's weekly classes, read by
 * drainage area beside the reservoirs that drain it.
 *
 * The monitor is consumed as data, never embedded: the polygons were
 * downloaded and verified by a tool, the coverage figures were computed and
 * committed by another, and this page renders those committed numbers in
 * the monitor's own colours with this project's vocabulary and freshness
 * handling. The one join no other product makes is on this page: land
 * conditions and banked storage for the same drainage area, side by side --
 * a full reservoir in extreme drought is a region living on savings, and a
 * reader should not need two websites to see it.
 */
import "@esri/calcite-components/main.css";
import { setAssetPath as setCalciteAssetPath } from "@esri/calcite-components";
import "@esri/calcite-components/components/calcite-action";
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-loader";
import "@esri/calcite-components/components/calcite-navigation";

import { installAnonymousAuthPolicy } from "./arcgis/basemaps";
import {
  loadReferenceBoundaries,
  loadSnowSiteReferenceLayer,
  REFERENCE_LOAD_TIMEOUT_MS,
  SNOW_SITE_REFERENCE_LAYER_ID
} from "./arcgis/reference-layers";

import {
  DROUGHT_JOINABLE_LEVELS,
  loadDrainageScope,
  loadOfferedLevels,
  type DrainageScope
} from "./data/boundaries";
import { loadDroughtCoverage } from "./data/drought-load";
import { downloadCsv } from "./data/download";
import { droughtCsv, droughtCsvFilename } from "./data/drought-export";
import { loadReservoirs } from "./data/load";
import { loadSnowSiteInventory } from "./data/snow-sites-load";
import { loadUsdmPolygons } from "./data/usdm-load";
import {
  loadCountyChoices,
  loadCountyDrainageScope,
  type CountyChoice,
  type CountyDrainageScope
} from "./data/county-scope";
import {
  areaAtLevel,
  loadOpeningRosters,
  resolveOpeningScope,
  withinOpeningArea,
  type OpeningRosters,
  type OpeningScope,
  type OpeningSelection,
  isOpeningScopeChosen
} from "./data/opening-scope";
import { readStoredPlace, resolveOpeningPlace, searchWithPlace } from "./state/opening-preference";
import { areaReachesState, stateName } from "./data/state-vocabulary";
import {
  areasAtOrWorse,
  coverageSegments,
  daysOld,
  DRYNESS_CLASS,
  isLateRelease,
  droughtSeverityIndex,
  isMeasured,
  isWellMeasured,
  byChange,
  byStorageGap,
  changeCounts,
  changesByArea,
  droughtChanges,
  orderUnits,
  regionWorst,
  storageAgainstDrought,
  storageByArea,
  unitsAtOrWorse,
  unitsInOpeningScope,
  worstClass,
  worstClassCounts,
  type DroughtSort,
  type StorageContext
} from "./drought-model";
import {
  droughtStateFromSearch,
  writeDroughtUrl,
  type DroughtUrlState
} from "./state/drought-url";
import { levelFromSearch, writeLevel } from "./state/level";
import { placeInSlot } from "./ui/dom";
import { createLevelControl } from "./ui/level-control";
import {
  createDroughtCountyControl,
  createDroughtCountyStatusControl,
  createDroughtDrainageControl,
  createDroughtStateControl
} from "./ui/drought-place-control";
import {
  ALL_VALUE,
  selectionForDroughtArea,
  selectionForDroughtState
} from "./ui/drought-place-control-model";
import {
  DROUGHT_SCATTER_FALLBACK_WIDTH,
  renderDroughtScatter
} from "./viz/drought-scatter";
import { renderDroughtGap } from "./viz/drought-gap";
import { renderDroughtChange } from "./viz/drought-change";
import { CHANGE_CLASSES, changeColor, changeLabel } from "./viz/change-classes";
import { renderDroughtSeverity } from "./viz/drought-severity";
import { renderResponsiveChart, stopResponsiveChart } from "./viz/responsive";
import type { DroughtCoveragePayload, Reservoir } from "./types";
import { createDroughtMap } from "./ui/drought-map";
import { RESERVOIR_REFERENCE_LAYER_ID } from "./ui/layers";
import type { ReservoirReference } from "./ui/layers";
import { createViewMap, mapStatusNote } from "./ui/view-map";
import { wireMobileFilterDisclosure } from "./ui/mobile-filter-disclosure";
import {
  mapExtentFromBox
} from "./viz/extent";
import { brandMarkup, pageLinksMarkup, updatePageLinks } from "./ui/page-header";
import { setupPlaceChooser } from "./ui/opening-splash";
import { wireTheme } from "./ui/theme";
import { DROUGHT_CLASSES, NO_DROUGHT_LABEL } from "./viz/drought-classes";
import { formatDate, formatPercent } from "./viz/format";
import "./styles/overview.css";
import "./styles/drought.css";

setCalciteAssetPath(new URL(/* @vite-ignore */ "../", import.meta.url).href);
const root = document.querySelector<HTMLElement>("#drought-app");
if (!root) throw new Error("Missing #drought-app root");

root.innerHTML = `
  <calcite-navigation class="overview-nav" aria-label="Primary navigation">
    ${brandMarkup(1, "drought")}
    ${pageLinksMarkup("drought", window.location.search)}
    <calcite-action id="theme-toggle" slot="content-end" text="Theme: system"
      icon="brightness" label="Change color theme"></calcite-action>
  </calcite-navigation>
  <main class="overview-main">
    <header class="overview-intro">
      <p>How dry the land is, area by area, from the U.S. Drought Monitor's weekly national map. That map is a weekly expert judgement rather than a single instrument reading: its authors weigh many kinds of evidence together, including water-supply records. Each drainage area also shows its reservoir storage, because the two can disagree. Storage and drought are related pictures rather than independent measurements. They diverge for ordinary reasons. A reservoir holds water that arrived in earlier years. It collects that water from land far upstream. It is filled and emptied by decisions as well as by weather.</p>
    </header>
    <section id="drought-content" aria-live="polite"><calcite-loader label="Loading drought conditions"></calcite-loader></section>
  </main>`;
wireTheme();
void setupPlaceChooser();

/**
 * What a reader's `?state=` and `?area=` selection resolved to (slice S3c,
 * docs/OPENING-SCOPE-AND-THE-WESTERN-ROSTER.md).
 *
 * `null` -- never an empty-but-present scope -- is how this page tells "the
 * reference export could not be read" apart from "nothing was chosen":
 * `unitsInOpeningScope` reads exactly that distinction, and the map, the
 * bars, the table and every chart on this page all narrow from the one set
 * of codes a resolved scope produces, so none of them can end up describing
 * a different set of areas than the others.
 */
interface OpeningContext {
  rosters: OpeningRosters;
  scope: OpeningScope;
}

/** County is a drought-only selected-scope refinement (ADR-091). It keeps
 * the figures keyed by drainage area and carries only which rows intersect
 * the chosen county, plus the county box the map opens on. */
interface DroughtCountyContext {
  requested: string | null;
  choices: readonly CountyChoice[];
  selected: CountyChoice | null;
  scope: CountyDrainageScope | null;
  resolved: boolean;
}

function countyFromSearch(search: string): string | null {
  const county = new URLSearchParams(search).get("county");
  return county !== null && /^\d{5}$/.test(county) ? county : null;
}

async function resolveDroughtCounty(
  search: string, state: string, level: number
): Promise<DroughtCountyContext> {
  const requested = countyFromSearch(search);
  if (state === "all") {
    return { requested, choices: [], selected: null, scope: null, resolved: requested === null };
  }
  /* An unchosen county is an optional control, not a reason to hold every
   * weekly figure behind a hosted service. Its list fills after render. */
  if (requested === null) {
    return { requested: null, choices: [], selected: null, scope: null, resolved: true };
  }
  try {
    const choices = await loadCountyChoices(state);
    const selected = requested === null
      ? null : choices.find((choice) => choice.fips === requested) ?? null;
    if (requested !== null && selected === null) {
      return { requested, choices, selected: null, scope: null, resolved: false };
    }
    const scope = selected ? await loadCountyDrainageScope(selected.fips, level) : null;
    return { requested, choices, selected, scope, resolved: true };
  } catch (error) {
    console.warn("The county filter could not be loaded:", error);
    return { requested, choices: [], selected: null, scope: null, resolved: requested === null };
  }
}

/**
 * Fetches and resolves the opening scope for an already-read selection.
 *
 * Takes `selection` rather than reading `window.location.search` itself, so
 * the caller holds the *requested* selection independently of whether this
 * resolves -- a fetch failure must not cost a reader the fact that they
 * asked for something, only the ability to act on it (a readiness field
 * reports one fact, and "what was asked" and "could it be honoured" are two).
 */
async function resolveOpening(selection: OpeningSelection): Promise<OpeningContext | null> {
  try {
    const rosters = await loadOpeningRosters();
    return { rosters, scope: resolveOpeningScope(selection, rosters) };
  } catch (error) {
    /* No narrowing rather than a broken page: a reader who asked for one
     * state or area still gets every drainage area's figures, which is a
     * smaller loss than the whole view failing over a chooser it did not
     * ask to see. */
    console.warn("The opening scope could not be resolved:", error);
    return null;
  }
}

/**
 * The code widths a reader's `?area=` may resolve to: a region, a subregion
 * or a basin. `opening-scope.ts` keeps its own `REGION_WIDTH`/
 * `SUBREGION_WIDTH`/`AREA_WIDTH` private, so these are named again here
 * rather than reached for as bare `2`/`4` literals -- the point of naming a
 * width at all is that a reader of this file sees what it means without
 * cross-referencing the other module's source.
 */
const REGION_CODE_WIDTH = 2;
const SUBREGION_CODE_WIDTH = 4;
const SUBBASIN_CODE_WIDTH = 8;

/**
 * The name of the region, subregion or basin a reader's `?area=` named, read
 * from the unnarrowed roster so it is found regardless of what state
 * narrowing left standing. Null when nothing was chosen or the code names
 * nothing this site's registry has (a dead link, already resolved to `null`
 * by `resolveOpeningScope` before this is ever called with it).
 */
function chosenAreaName(area: string | null, rosters: OpeningRosters): string | null {
  if (area === null) return null;
  const roster = area.length === REGION_CODE_WIDTH ? rosters.regions
    : area.length === SUBREGION_CODE_WIDTH ? rosters.subregions
    : area.length === SUBBASIN_CODE_WIDTH ? rosters.subbasins
    : rosters.areas;
  return roster.find((candidate) => candidate.huc6 === area)?.name ?? null;
}

/**
 * The sentence naming the chosen place, and -- only when a state is chosen
 * -- the honesty constraint this page owes for one (docs/OPENING-SCOPE-AND-
 * THE-WESTERN-ROSTER.md, "What a state selection is allowed to claim").
 *
 * A drainage area's `states` means "the water reaches this state", not
 * "the water is only in this state": an area whose water reaches two states
 * is drawn whole in both, because clipping to the state line needs polygon
 * geometry in the browser and ADR-048/049 refuse it. This page has no
 * points, only areas -- the reservoir map can say a point is "in" one state
 * and mean it exactly, this map cannot -- so it is the one that has to
 * print the inexact rule in words rather than let a reader assume a state
 * line was drawn that was not. Null when nothing was chosen, so a caller
 * renders no sentence rather than a wordy no-op.
 */
function openingScopeSentence(
  selection: OpeningScope["selection"],
  place: string | null,
  county: DroughtCountyContext
): string | null {
  const stateChosen = selection.state !== "all";
  if (county.requested !== null && !county.resolved) {
    return "The chosen county could not be loaded right now. " +
      "Showing the drainage areas for the wider place instead.";
  }
  if (county.selected && county.scope) {
    const area = place ? ` in ${place}` : "";
    return `Showing drainage areas${area} that intersect ${county.selected.name}, ` +
      `${stateName(county.selected.state)}. Each area is drawn whole, not cut off ` +
      "at the county line.";
  }
  if (!stateChosen && place === null) return null;
  const named = place && stateChosen ? `${place}, in ${stateName(selection.state)}`
    : place ?? stateName(selection.state);
  let sentence = `Showing the drainage areas for ${named}.`;
  if (stateChosen) {
    sentence += ` Each one shown here has water that reaches ${stateName(selection.state)}. ` +
      "Some of them also reach other states, and each area is drawn whole here, not cut off " +
      "at the state line.";
  }
  return sentence;
}

function renderDrought(
  payload: DroughtCoveragePayload,
  storage: Map<string, StorageContext> | null,
  /* The reservoirs themselves, not only their per-area rollup: the map
   * places and names each one, and the rollup has already thrown away where
   * they are. Empty when the payload could not be read, which the rows
   * below already say in words. */
  reservoirs: readonly ReservoirReference[],
  opening: OpeningContext | null,
  county: DroughtCountyContext,
  /* What the reader actually typed, independent of whether `opening`
   * resolved -- a readiness field reports one fact, and "what was asked"
   * and "could it be honoured" are two different ones (see `stateFilter`/
   * `areaFilter`/`openingScopeResolved` below). */
  requested: OpeningSelection
): void {
  const content = document.querySelector<HTMLElement>("#drought-content");
  if (!content) return;

  /* The selection actually in force: the resolved, aliveness-checked one
   * when the opening scope loaded (a dead area code has already fallen back
   * to `null` there, by `resolveOpeningScope`'s own design -- a selection
   * that cannot be honoured yields a wider one rather than filtering to
   * nothing), or the raw request when it did not. Falling back to the raw
   * request rather than "nothing chosen" is what keeps a `?state=CA` link
   * from reporting itself as unscoped just because the reference export
   * happened to fail to load this one time. */
  const openingSelection = opening ? opening.scope.selection : requested;
  /* Whether a reader actually asked for a place, as opposed to a scope that
   * resolved but named nothing. Nothing on this page reads narrowed codes
   * (or overrides the map's opening box) unless this is true, so a reader
   * who chose nothing sees the page exactly as it drew before this slice --
   * unfiltered by construction, not merely by a narrowing that happens not
   * to remove anything. */
  const scopeChosen = isOpeningScopeChosen(openingSelection);
  const countyChosen = county.selected !== null && county.scope !== null;
  /* `?area=` and `?level=` are independent parameters (a shared link from a
   * six-digit-basin page can land on a four-digit-subregion one), so the
   * selection is coarsened to what this page actually draws before it is
   * used to filter or to highlight anything -- `areaAtLevel`'s own doc is
   * the reasoning; left un-coarsened, a finer selection would silently
   * match nothing at a coarser level rather than the subregion it nests in. */
  const levelArea = scopeChosen ? areaAtLevel(openingSelection.area, level) : null;
  /* The codes a reader's `?state=` and `?area=` selection actually means, at
   * this page's own level (D4, D5): filters the page rather than only
   * opening a row, now that there are 75 areas rather than the fourteen the
   * old comment here was written against. Built from whichever published
   * roster tier this page is drawing -- regions at level two, subregions at
   * four, basins at six and subbasins at eight -- rather than from
   * `opening.scope.chosenAreas`: `DroughtUnit` carries no `states` of its own, so `areaReachesState`
   * has to run against the roster that does, at the width the units
   * themselves are published at, or a level-four unit would need to be
   * matched against six-digit codes it can never equal. `null` -- rather
   * than every published code -- both when the opening scope itself could
   * not be resolved and when nothing was chosen, which is what keeps
   * `unitsInOpeningScope` from narrowing a broken chooser (or an ordinary,
   * scope-free visit) into anything other than every published unit. */
  const chosenCodesAtLevel: ReadonlySet<string> | null = opening && (scopeChosen || countyChosen)
    ? new Set(
        (level === REGION_CODE_WIDTH ? opening.rosters.regions
          : level === SUBREGION_CODE_WIDTH ? opening.rosters.subregions
          : level === SUBBASIN_CODE_WIDTH ? opening.rosters.subbasins
          : opening.rosters.areas)
          .filter((area) => areaReachesState(area, openingSelection.state)
            && withinOpeningArea(area.huc6, levelArea)
            && (!countyChosen || county.scope?.codes.has(area.huc6) === true))
          .map((area) => area.huc6))
    : null;
  /* Narrowed before the first line of markup is built below -- a reader who
   * arrived asking for Arizona sees Arizona's rows, bars and table on first
   * paint, never the full 75 first and then a correction. */
  const scopedUnits = unitsInOpeningScope(payload.units, chosenCodesAtLevel);
  const scopeSentence = opening
    ? openingScopeSentence(
        openingSelection, chosenAreaName(openingSelection.area, opening.rosters), county)
    /* The opening scope failed to load, but a reader still asked for a
     * place -- said so honestly rather than silently showing every area
     * with no explanation for why the choice did not take. */
    : scopeChosen || county.requested !== null
      ? "The chosen place could not be loaded right now. Showing every drainage area."
      : null;

  const today = new Date();
  const age = daysOld(payload.release_date, today);
  const late = isLateRelease(payload.release_date, today);
  const worst = regionWorst(scopedUnits);
  const extremeAreas = areasAtOrWorse(scopedUnits, "d3");
  /* Marking, not filtering: how many areas in view are measured over only
   * part of their land, so the tile that counts them can say what its own
   * denominator is doing. */
  const thinlyMeasured = scopedUnits.filter((unit) => !isWellMeasured(unit)).length;

  const dryness = DROUGHT_CLASSES.find((entry) => entry.key === DRYNESS_CLASS)!;

  content.innerHTML = `
    ${scopeSentence ? `<p id="drought-scope-summary" class="filter-status">${scopeSentence}</p>` : ""}
    <section class="dashboard-filterbar mobile-filterbar" aria-labelledby="drought-filter-heading">
      <div class="filterbar-head">
        <div class="filterbar-title"><p class="eyebrow">Land conditions</p><h2 id="drought-filter-heading">Narrow the drainage areas</h2></div>
        <button id="drought-filter-toggle" class="mobile-filter-toggle" type="button"
          aria-controls="drought-filter-controls drought-filter-actions drought-map-controls"
          aria-expanded="false">Show filters</button>
        <div id="drought-filter-actions" class="filterbar-head-actions"><calcite-button id="drought-reset" class="reset-button" appearance="outline" scale="s" kind="neutral">Show every area</calcite-button></div>
      </div>
      <!-- One place-reading order: state, its county when one is chosen,
           area size, then one drainage menu at that size. The slots keep
           that order independent of which request resolves first. -->
      <div id="drought-filter-controls" class="filterbar-controls">
        <div class="control-slot" data-slot="state"></div>
        <div class="control-slot" data-slot="county"></div>
        <div class="control-slot" data-slot="level"></div>
        <div class="control-slot" data-slot="area"></div>
      </div>
      <!-- These controls change how the chosen drainage areas are presented.
           The condition and order choices keep their shared-link state. The
           layer toggles and map mode remain local display state. -->
      <section class="map-controls" id="drought-map-controls" aria-label="Map options">
        <div class="map-controls-head">
          <p class="map-controls-label">Map options</p>
          <div class="map-layer-controls" id="drought-map-layer-controls" role="group" aria-label="Map layers">
            <label class="filterbar-toggle" for="drought-show-reservoirs">Show reservoirs<input id="drought-show-reservoirs" type="checkbox" disabled /></label>
            <label class="filterbar-toggle" id="drought-snow-sites-control" for="drought-show-snow-sites" hidden>Show snowpack sites<input id="drought-show-snow-sites" type="checkbox" disabled /></label>
          </div>
        </div>
        <div class="map-filter-controls">
          <calcite-label>Show areas with<calcite-select id="drought-worse" scale="l">
            <calcite-option value="">Any conditions</calcite-option>
            ${DROUGHT_CLASSES.map((entry) => `<calcite-option value="${entry.key}">${entry.label} (${entry.code}) or worse</calcite-option>`).join("")}
          </calcite-select></calcite-label>
          <calcite-label>Order by<calcite-select id="drought-sort" scale="l">
            <calcite-option value="severity">Most severe first</calcite-option>
            <calcite-option value="index">Highest severity index first</calcite-option>
            <calcite-option value="storage">Emptiest reservoirs first</calcite-option>
            <calcite-option value="name">Drainage area name</calcite-option>
          </calcite-select></calcite-label>
          <div class="control-slot" data-slot="map-mode"></div>
        </div>
      </section>
    </section>
    <p id="drought-status" class="filter-status" role="status"></p>
    <section class="overview-kpis drought-summary" aria-label="Drought summary">
      <article class="overview-kpi overview-kpi-primary"><span>Worst conditions</span><strong>${worst ? worst.label : "None"}</strong><small>${worst ? `Highest class with land in it (${worst.code})` : "No drainage area has land in a drought class"}</small></article>
      <article class="overview-kpi"><span>Extreme or exceptional areas</span><strong>${extremeAreas} of ${scopedUnits.length}</strong><small>Land at D3 or D4${thinlyMeasured > 0 ? `. ${thinlyMeasured} areas use partial coverage` : ""}.</small></article>
      <article class="overview-kpi"><span>Map week</span><strong>${formatDate(payload.map_date)}</strong><small>Published ${formatDate(payload.release_date)}</small></article>
      <article class="overview-kpi"><span>Map age</span><strong${late ? ' class="late-badge"' : ""}>${age} ${age === 1 ? "day" : "days"}</strong><small>${late ? "Late data: a new weekly map has been missed" : "A new map is published each Thursday"}</small></article>
    </section>
    <section class="overview-card" aria-labelledby="drought-map-heading">
      <div class="card-heading">
        <div><h2 id="drought-map-heading">The drought map</h2><p id="drought-map-copy">The monitor's weekly national map in its own colours, for the week of ${formatDate(payload.map_date)}. The outlined shapes are the ${scopedUnits.length} drainage areas the figures below describe. Drought does not stop at their edges, so the map draws the wider pattern too.</p></div>
        <span class="sdk-badge">ArcGIS map</span>
      </div>
      <div id="drought-map-host" class="view-map-host has-inset-legend" aria-busy="true"
        aria-label="A map of drought classes over the drainage areas. The bars and table on this page carry the same shares as text."></div>
    </section>
    <section class="overview-card" aria-labelledby="drought-severity-heading">
      <div class="card-heading">
        <div><h2 id="drought-severity-heading">How the areas are divided</h2><p>Every drainage area counted once, at the most severe class with land in it. The tile above says how many are at extreme drought or worse. This says where all ${scopedUnits.length} sit, which is a different question. Nine clear areas and nine areas one class below the line give the same count, and they are not the same week. Levels with no areas in them are still drawn, so one week can be compared with another.</p></div>
      </div>
      <div id="drought-severity-host" class="drought-severity-host"></div>
      <ul class="overlay-key" id="drought-severity-key" aria-label="What each severity level is called"></ul>
    </section>
    <section class="overview-card" aria-labelledby="drought-join-heading">
      <div class="card-heading">
        <div><h2 id="drought-join-heading">Dry land against banked water</h2><p>Each drainage area is one point. How much of its land is in ${dryness.label.toLowerCase()} (${dryness.code}) or worse goes across the bottom. How full its reservoirs are goes up the side. The colour is the most severe class with land in it. The two do not have to agree, and where they disagree is the point. An area far to the right and high up draws on water banked in better years. One far to the right and low has neither the rain nor the savings. Read this as a description of how the two line up. It is not a test of one against the other. The Drought Monitor already weighs water supply conditions. And a reservoir is placed here by the area holding its dam, not by the land that fills it. A hollow point is measured over only part of its area.</p></div>
      </div>
      <div id="drought-scatter-host" class="drought-scatter-host"></div>
    </section>
    <section class="overview-card" aria-labelledby="drought-gap-heading">
      <div class="card-heading">
        <div><h2 id="drought-gap-heading">The same comparison, in order</h2><p>One row for each drainage area that has a reservoir reading. Both dots in a row sit on the same 0 to 100 scale, each one at its own value. Which dot is on the left therefore changes from row to row. The dot in the class colours is the share of land in ${dryness.label.toLowerCase()} (${dryness.code}) or worse. The dot in the storage colours is how full that area's reservoirs are. The line between them is the distance, and it is only a distance. The two shares divide by different things, one by land and one by reservoir capacity, so the site never states their difference as a number. The rows are ordered by that distance. The areas where the water dot sits furthest to the left of the dry dot lead the list. That is dry ground with little banked to draw on. A name marked with an asterisk is measured over only part of its area.</p></div>
      </div>
      <div id="drought-gap-host" class="drought-gap-host"></div>
    </section>
    <section class="overview-card" aria-labelledby="drought-change-heading">
      <div class="card-heading">
        <div><h2 id="drought-change-heading">What changed since last week</h2><p>One bar for each drainage area, measured from the middle. A bar to the right means more of that area's land is in ${dryness.label.toLowerCase()} (${dryness.code}) or worse than a week ago. A bar to the left means less of it is. The unit is points of the area's own land, and both figures are the same measurement of the same ground a week apart. That is why this chart draws a bar and the one above it does not. The scale is the same distance either side of the middle, so a week where everything got wetter still puts no change in the middle.</p></div>
      </div>
      <div id="drought-change-host" class="drought-change-host"></div>
      <p class="drought-chart-note" id="drought-change-note"></p>
    </section>
    <section class="overview-card table-card" aria-labelledby="drought-areas-heading">
      <div class="card-heading"><div><h2 id="drought-areas-heading">Each drainage area</h2><p>The bar is the share of the area's land in each class, in the same colours as the map above. The figure beside the name is the combined reservoir storage in that area, as a percent of the combined full level. Those full levels mix definitions, so a combined percent full is a working total rather than one measure of full. The severity index adds up the shares at each class or worse, so it runs from 0 to 500. Shares and index are shares of the land the monitor measures.</p></div><calcite-button id="download-drought-csv" appearance="outline" icon-start="export" scale="s">Download filtered table (CSV file)</calcite-button></div>
      <div class="drought-rows"></div>
      <details class="snow-month-details"><summary>Exact values for every class</summary>
        <div class="table-scroll" tabindex="0" role="region" aria-label="Drought class table, scrolls sideways"><table class="overview-table"><thead><tr><th>Drainage area</th><th>No drought</th><th>D0</th><th>D1</th><th>D2</th><th>D3</th><th>D4</th><th>Extreme or worse</th><th>Change since last week</th></tr></thead><tbody id="drought-table-rows"></tbody></table></div>
      </details>
      <p class="drought-attribution">${payload.attribution}. Read the full national map at <a href="https://droughtmonitor.unl.edu/" target="_blank" rel="noreferrer">droughtmonitor.unl.edu</a>.</p>
    </section>`;

  /* Filter state, read from the address bar so a shared link opens on the
   * same view. The map is deliberately not filtered with the rows: it draws
   * the national sweep, and hiding drainage outlines from it would leave a
   * pattern with nothing to locate it against. */
  const wanted = droughtStateFromSearch(window.location.search);
  let state: DroughtUrlState = { ...wanted };

  /* Calcite selects, like every other control in this bar: one family,
   * one height, one focus ring. `.value` reads and assigns the same way;
   * only the change event carries the component's own name. */
  const worseSelect = content.querySelector<HTMLElement & { value: string }>("#drought-worse");
  const sortSelect = content.querySelector<HTMLElement & { value: string }>("#drought-sort");
  const statusLine = content.querySelector<HTMLElement>("#drought-status");
  const resetButton = content.querySelector<HTMLElement>("#drought-reset");
  const filterbar = content.querySelector<HTMLElement>(".mobile-filterbar");
  const filterToggle = content.querySelector<HTMLButtonElement>("#drought-filter-toggle");
  if (filterbar && filterToggle) wireMobileFilterDisclosure(filterbar, filterToggle);
  const scatterHost = content.querySelector<HTMLElement>("#drought-scatter-host");
  const gapHost = content.querySelector<HTMLElement>("#drought-gap-host");
  const changeHost = content.querySelector<HTMLElement>("#drought-change-host");
  const changeNote = content.querySelector<HTMLElement>("#drought-change-note");
  const severityHost = content.querySelector<HTMLElement>("#drought-severity-host");
  const severityKey = content.querySelector<HTMLElement>("#drought-severity-key");
  if (worseSelect) worseSelect.value = state.worse ?? "";
  if (sortSelect) sortSelect.value = state.sort;

  /* The legend lives inside the map rather than above it. A key belongs
   * beside the thing it explains: over the map the reader's eye moves inches
   * between a colour and its name instead of leaving the picture entirely,
   * and the card reclaims the band the key used to occupy.
   *
   * Built here with the rest of the figures, but *attached* only once the map
   * exists. `createViewMap` calls `replaceChildren` on the host, so a legend
   * appended before that is silently thrown away -- which is exactly what
   * happened on the first attempt. It is attached either way: if the map
   * cannot start, the key still belongs with the note that explains why. */
  const legend = document.createElement("div");
  legend.className = "drought-legend map-inset-legend";
  legend.setAttribute("role", "list");
  legend.setAttribute("aria-label", "Drought classes and their map colours");
  /* The key follows the map. Two surfaces, two colour languages, and a key
   * left on the classes while the map drew a change would be worse than no
   * key at all -- it would name the wrong scale with authority. */
  const fillLegend = (mode: "classes" | "change"): void => {
    legend.setAttribute("aria-label", mode === "change"
      ? "Change since last week and its map colours"
      : "Drought classes and their map colours");
    const entries = mode === "change"
      ? CHANGE_CLASSES.map((entry) => ({
        label: entry.label, color: entry.color as string | null
      }))
      : [
        { label: NO_DROUGHT_LABEL, color: null },
        ...DROUGHT_CLASSES.map((entry) => ({
          label: `${entry.label} (${entry.code})`, color: entry.color as string | null
        }))
      ];
    legend.replaceChildren(...entries.map((entry) => {
      const item = document.createElement("span");
      item.className = "drought-legend-item";
      item.setAttribute("role", "listitem");
      const swatch = document.createElement("span");
      swatch.className = "drought-swatch" + (entry.color ? "" : " drought-segment-none");
      if (entry.color) swatch.style.background = entry.color;
      const label = document.createElement("span");
      label.textContent = entry.label;
      item.append(swatch, label);
      return item;
    }));
  };
  fillLegend("classes");

  const rows = content.querySelector<HTMLElement>(".drought-rows");
  const tableBody = content.querySelector<HTMLTableSectionElement>("#drought-table-rows");
  const exportButton = content.querySelector<HTMLElement>("#download-drought-csv");
  let exportUnits = scopedUnits;
  exportButton?.addEventListener("click", () => downloadCsv(
    droughtCsv(payload, exportUnits, storage),
    droughtCsvFilename(payload.map_date, level)
  ));

  /**
   * Everything the filter controls change, in one place.
   *
   * The rows, the exact-values table, the scatter and the sentence that
   * reports what is being shown all describe the same chosen set, so they are
   * rebuilt together. Splitting them is how one surface ends up describing a
   * filter another surface is no longer applying.
   */
  function draw(): void {
    const chosen = unitsAtOrWorse(scopedUnits, state.worse as never);
    const ordered = orderUnits(chosen, storage, state.sort);
    exportUnits = ordered;

    if (rows) {
    rows.replaceChildren(...ordered.map((unit) => {
      const row = document.createElement("article");
      row.className = "drought-row overview-kpi";

      const head = document.createElement("div");
      head.className = "drought-row-head";
      const name = document.createElement("h3");
      name.textContent = unit.huc6_name;
      head.append(name);
      const context = storage?.get(unit.huc6);
      const aside = document.createElement("span");
      aside.className = "drought-row-storage";
      aside.textContent = context
        ? `Reservoirs: ${formatPercent(context.percent)} full across ${context.reservoirCount}`
        : "Reservoir storage is not available just now";
      head.append(aside);

      const bar = document.createElement("div");
      bar.className = "drought-bar";
      const segments = coverageSegments(unit);
      /* A partly measured area's shares divide by its measured land, so the
       * segment wording says which land -- the same disclosure the sentence
       * below makes. */
      const partlyMeasured = unit.measured !== undefined
        && unit.measured.percent_of_area < 100;
      const landWords = partlyMeasured ? "of the measured land" : "of the land";
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label",
        `${unit.huc6_name}: ` + segments.map((segment) =>
          `${segment.label} ${formatPercent(segment.percent)}`).join(", ") +
        ". The table below lists every value.");
      for (const segment of segments) {
        const piece = document.createElement("span");
        piece.className = "drought-segment" + (segment.color ? "" : " drought-segment-none");
        piece.style.flexGrow = String(segment.percent);
        if (segment.color) piece.style.background = segment.color;
        piece.title = `${segment.label}: ${formatPercent(segment.percent)} ${landWords}`;
        bar.append(piece);
      }

      const reading = document.createElement("p");
      reading.className = "drought-row-reading";
      const rowWorst = worstClass(unit);
      /* Three sentences for three facts: some drought, none measured as in
       * drought, and not measured at all -- the last is never the second
       * (ADR-059). A fourth covers the case between them: measured over only
       * part of the area, so every share here divides by that part (and so
       * does the severity index beside it). */
      reading.textContent = !isMeasured(unit)
        ? "The drought monitor does not measure land in this area."
        : rowWorst
          ? `${formatPercent(unit.percent_of_area_at_least.d0)} of the land is in a ` +
            `drought class or abnormally dry. Worst class: ${rowWorst.label} ` +
            `(${rowWorst.code}), covering ${formatPercent(unit.percent_of_area[rowWorst.key])}.`
          : "No land in this area is in a drought class this week.";
      if (isMeasured(unit)) {
        const sentences: string[] = [];
        if (unit.measured !== undefined && unit.measured.percent_of_area < 100) {
          sentences.push(`The figures cover ` +
            `${formatPercent(unit.measured.percent_of_area)} of the area.`);
        }
        const index = droughtSeverityIndex(unit);
        if (index !== null) {
          sentences.push(`Drought severity index ${index.toFixed(1)} of 500.`);
        }
        reading.textContent += ` ${sentences.join(" ")}`;
      }

      const links = document.createElement("p");
      links.className = "drought-row-links";
      const mapLink = document.createElement("a");
      mapLink.href = `./?area=${unit.huc6}`;
      mapLink.textContent = "Open on the storage map";
      const snowLink = document.createElement("a");
      snowLink.href = `./snow.html?area=${unit.huc6}`;
      snowLink.textContent = "Open the snowpack view";
      links.append(mapLink, snowLink);

      row.append(head, bar, reading, links);
      return row;
    }));
  }

    if (tableBody) {
    /* Built once for the whole table rather than per row: the rows call this
     * up to 75 times and a `find` down the change list each time would be a
     * quadratic walk to answer one lookup. */
    const changesHere = changesByArea(droughtChanges(scopedUnits, payload.previous));
    tableBody.replaceChildren(...ordered.map((unit) => {
      const row = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = unit.huc6_name;
      row.append(name);
      if (!isMeasured(unit)) {
        /* One spanning sentence, never a row of zeros: zeros here would
         * read as "no drought" about land the monitor cannot see. The span
         * counts the change column too -- an area with no share has no
         * change either, and a "No comparison" beside the sentence would be
         * a second answer to a question already answered. */
        const cell = document.createElement("td");
        cell.colSpan = 8;
        cell.textContent = "The drought monitor does not measure land in this area.";
        row.append(cell);
        return row;
      }
      const values = [
        unit.percent_of_area.none, unit.percent_of_area.d0,
        unit.percent_of_area.d1, unit.percent_of_area.d2,
        unit.percent_of_area.d3, unit.percent_of_area.d4,
        unit.percent_of_area_at_least.d3
      ];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = formatPercent(value);
        row.append(cell);
      }
      /* The same move the chart above draws and the map fills with, said in
       * words. A swatch beside it rather than a coloured cell: the cell's
       * own text has to keep its contrast in both themes, and a full-strength
       * class colour behind it would not (ADR-006's rule about text applies
       * to the text over a fill as much as to the fill). */
      const changeCell = document.createElement("td");
      const move = changesHere.get(unit.huc6) ?? null;
      const swatchColor = changeColor(move ? move.points : null);
      if (swatchColor) {
        const swatch = document.createElement("span");
        swatch.className = "drought-change-swatch";
        swatch.style.background = swatchColor;
        changeCell.append(swatch);
      }
      changeCell.append(changeLabel(move ? move.points : null));
      row.append(changeCell);
      return row;
    }));
    }

    /* The join, as a picture. Areas with no reservoir reading are left out
     * rather than plotted at zero -- an area with no reservoirs in it is not
     * an area whose reservoirs are empty -- and the count of what was left
     * out is stated under the chart rather than silently dropped. */
    const points = storageAgainstDrought(ordered, storage);
    if (scatterHost) {
      const scatterOptions = {
        drynessLabel: `${dryness.label.toLowerCase()} (${dryness.code})`,
        ariaLabel: `Each drainage area by how much of its land is in ` +
          `${dryness.label.toLowerCase()} or worse and how full its reservoirs ` +
          `are. The table below carries both numbers for every area.`,
        /* D4: still opens the chosen row -- the emphasis a `?area=` naming
         * exactly one basin already had before this slice filtered on it
         * too. `levelArea` is already coarsened to this page's own level, so
         * this reads as a no-op unless the value equals a real plotted
         * point's own code -- exactly the areas `scopedUnits` already
         * narrowed to, never one selected before that narrowing and then
         * filtered away. */
        highlight: levelArea
      };
      const missing = ordered.length - points.length;
      const note = document.createElement("p");
      note.className = "drought-chart-note";
      note.textContent = missing > 0
        ? `${points.length} of ${ordered.length} areas are plotted. ` +
          `${missing} ${missing === 1 ? "has" : "have"} no reservoir reading to ` +
          "compare against."
        : `All ${points.length} areas shown have a reservoir reading.`;
      if (points.length > 0) {
        renderResponsiveChart(scatterHost, (width) => {
          const chart = renderDroughtScatter(points, scatterOptions, width);
          if (chart) scatterHost.replaceChildren(chart, note);
        }, {
          fallbackWidth: DROUGHT_SCATTER_FALLBACK_WIDTH,
          minimumWidth: 140
        });
      } else {
        stopResponsiveChart(scatterHost);
        scatterHost.replaceChildren(mapStatusNote(
          "No area in view has a reservoir reading to compare against."));
      }
    }

    /* The same points the scatter drew, ranked. Built from `points` rather
     * than recomputed, so the two charts cannot disagree about which areas
     * have a reservoir reading. */
    let gapRows = 0;
    if (gapHost) {
      const ranked = byStorageGap(points);
      gapRows = renderDroughtGap(gapHost, ranked, {
        drynessLabel: `in ${dryness.label.toLowerCase()} (${dryness.code}) or worse`,
        ariaLabel: `Each drainage area, worst first, showing the share of its ` +
          `land in ${dryness.label.toLowerCase()} or worse beside how full its ` +
          "reservoirs are. The table below carries both numbers for every area."
      });
      if (gapRows === 0) {
        gapHost.replaceChildren(mapStatusNote(
          "No area in view has a reservoir reading to compare against."));
      }
    }

    /* The week-over-week move, over the areas in scope rather than the
     * `worse=` filtered view: this chart is what the week did to the place a
     * reader chose, and narrowing it by a severity the reader picked would
     * make it a picture of the filter. Empty when the archive holds one week
     * -- which is a real state, not a failure (ADR-074) -- and the note says
     * which of the two reasons applies. */
    let changeRows = 0;
    if (changeHost) {
      const changes = byChange(droughtChanges(scopedUnits, payload.previous));
      const counts = changeCounts(changes);
      /* Only the areas that moved. In a quiet week 58 of 75 hold steady, and
       * drawing each of them as a row with a 1.5-unit mark makes a chart four
       * times taller than its own content -- a reader scrolls a screen of
       * blank rows to find six bars. The ones left out are counted in the
       * note below rather than dropped silently, which is the same bargain
       * the storage scatter makes for the reservoirs above its axis. */
      const moved = changes.filter((change) => change.direction !== "same");
      changeRows = renderDroughtChange(changeHost, moved, {
        changeLabelText: `in ${dryness.label.toLowerCase()} or worse`,
        ariaLabel: "Each drainage area, driest move first, showing how many "
          + "points of its land moved into or out of "
          + `${dryness.label.toLowerCase()} or worse since last week.`,
        highlight: state.area
      });
      if (changeNote) {
        if (!payload.previous) {
          changeNote.textContent = "This is the first week measured at this "
            + "area size. A comparison needs two.";
        } else if (changes.length === 0) {
          changeNote.textContent = "No area in view can be compared with last week.";
        } else if (changeRows === 0) {
          changeNote.textContent = `No area in view moved since `
            + `${formatDate(payload.previous.map_date)}.`;
        } else {
          changeNote.textContent =
            `Compared with ${formatDate(payload.previous.map_date)}: `
            + `${counts.worse} drier, ${counts.better} wetter. `
            + `${counts.same} did not move and are not drawn.`;
        }
      }
    }

    /* Counted over every area in scope, not the `worse=` filtered view. This
     * chart is the shape of the whole week for whichever place a reader
     * chose; narrowing it further to a chosen severity would make it a
     * picture of that filter instead. */
    let severityAreas = 0;
    if (severityHost) {
      const counts = worstClassCounts(scopedUnits, NO_DROUGHT_LABEL);
      severityAreas = renderDroughtSeverity(severityHost, counts,
        "How many drainage areas are at each drought severity, counted at the " +
        "most severe class with land in them.");
      if (severityKey) {
        severityKey.replaceChildren(...counts.map((entry) => {
          const item = document.createElement("li");
          const swatch = document.createElement("span");
          swatch.className = "drought-swatch"
            + (entry.color ? "" : " drought-segment-none");
          if (entry.color) swatch.style.background = entry.color;
          const text = document.createElement("span");
          text.textContent = entry.label;
          item.append(swatch, text);
          return item;
        }));
      }
    }

    if (statusLine) {
      const chosenClass = DROUGHT_CLASSES.find((entry) => entry.key === state.worse);
      const order = state.sort === "storage" ? "emptiest reservoirs first"
        : state.sort === "name" ? "by name" : "most severe first";
      statusLine.textContent = chosenClass
        ? `${ordered.length} of ${scopedUnits.length} drainage areas have land in ` +
          `${chosenClass.label.toLowerCase()} (${chosenClass.code}) or worse, ${order}.`
        : `All ${ordered.length} drainage areas, ${order}.`;
    }

    window.__droughtReady = {
      ...(window.__droughtReady ?? {}),
      /* Two facts, two fields. Rows in the ranked comparison is not areas in
       * the severity chart: the first counts areas with a reservoir reading,
       * the second counts every area in scope. */
      gapRows,
      severityAreas,
      /* The count this page is currently about -- narrowed by `?level=`
       * already, and now also by `?state=`/`?area=` (D5). Equal to the
       * published total exactly when nothing was chosen. */
      units: scopedUnits.length,
      rows: ordered.length,
      level,
      /* Added, not a replacement for `units`: which place, if any, narrowed
       * this page, so a reader (or a test) can tell "75 because nothing was
       * chosen" apart from "75 because the choice matched everything" --
       * distinct facts `units` alone cannot carry. Always the *requested*
       * selection, whether or not it could be resolved -- see the comment on
       * `openingSelection` above -- so a `?state=CA` link never reports
       * itself as "nothing was chosen" merely because the reference export
       * failed to load. */
      stateFilter: openingSelection.state,
      areaFilter: openingSelection.area,
      countyFilter: county.requested,
      countyScopeResolved: county.resolved,
      /* A third, distinct fact from the two above: whether the request
       * *could* be acted on at all. `stateFilter`/`areaFilter` alone cannot
       * tell a reader (or a test) "asked for California, got it" apart from
       * "asked for California, got everything because the export never
       * loaded" -- two very different pages that would otherwise report
       * identically. A readiness field reports one fact each; this is the
       * one those two do not carry, so it is its own field rather than
       * folded into either. */
      openingScopeResolved: opening !== null,
      worstClass: worst ? worst.code : null,
      mapDate: payload.map_date,
      daysOld: age,
      lateData: late,
      storageJoined: storage
        ? ordered.filter((unit) => storage.has(unit.huc6)).length
        : 0,
      severityFilter: state.worse,
      sort: state.sort,
      scatterPoints: points.length
    } as NonNullable<typeof window.__droughtReady>;
  }

  function update(next: Partial<DroughtUrlState>): void {
    state = { ...state, ...next };
    writeDroughtUrl(state);
    /* The write is a `replaceState`; there is no navigation to re-render the
     * bar, so its links are brought up to date here or not at all. */
    updatePageLinks(window.location.search);
    draw();
  }

  /* The level control arrives with the reference export rather than with the
   * page, because which levels are on offer is the export's answer to give
   * (ADR-064) and it is the same request the map below already makes. A
   * reader who never waits for it sees the page they asked for. */
  void loadOfferedLevels(undefined, "drought").then((offered) => {
    const control = createLevelControl(offered, level, (chosen) => {
      /* A full navigation rather than a re-render: the level changes which
       * file this page fetches and every figure computed from it, so the
       * honest implementation is the one a shared link already takes. Replace
       * rather than push, like every other control here -- the back button
       * leaves the site rather than unwinding filter changes one at a time. */
      /* Area size determines the tier the next control offers (ADR-091), so
       * changing it clears the old tier's area choice. State and county stay
       * in force and narrow the newly offered list. */
      const placeQuery = searchWithPlace(window.location.search, {
        state: openingSelection.state,
        area: null
      });
      const params = new URLSearchParams(placeQuery.replace(/^\?/, ""));
      writeLevel(params, chosen);
      const query = params.toString();
      window.location.replace(`${window.location.pathname}${query ? `?${query}` : ""}`);
      /* Large, because the native selects it sits beside are a third taller
       * than a Calcite control at the default scale. */
    }, { scale: "l" });
    const levelHost = content.querySelector<HTMLElement>(".filterbar-controls");
    if (control && levelHost) placeInSlot(levelHost, "level", control.element);
    window.__droughtReady = {
      ...(window.__droughtReady ?? {}), levelsOffered: offered.length || 1
    } as NonNullable<typeof window.__droughtReady>;
  }).catch((error: unknown) => {
    /* No control rather than a broken one. The page is drawn at the level it
     * was asked for either way. */
    console.warn("The area-size control could not be built:", error);
  });

  /* Drought's page-specific sequence (ADR-091): State, County once a state
   * is held, Area size, then one hydrologic tier at that size. Each change is
   * a navigation because place and level are resolved before this render.
   * The shared storage and snow controls keep ADR-084's combined menus. */
  if (opening) {
    const navigateWithPlace = (selection: OpeningSelection): void => {
      const query = searchWithPlace(window.location.search, selection);
      window.location.replace(`${window.location.pathname}${query}`);
    };
    const stateControl = createDroughtStateControl(
      opening.rosters, openingSelection, (chosen) => {
        const selection = selectionForDroughtState(chosen);
        const query = searchWithPlace(window.location.search, selection);
        const params = new URLSearchParams(query.replace(/^\?/, ""));
        /* A county belongs to the old state; keeping it would create a pair
         * this page could not honestly offer. */
        params.delete("county");
        window.location.replace(
          `${window.location.pathname}?${params.toString()}`);
      }, { scale: "l" });
    const countyPicked = (chosen: string): void => {
        const query = searchWithPlace(window.location.search, {
          state: openingSelection.state,
          area: null
        });
        const params = new URLSearchParams(query.replace(/^\?/, ""));
        if (chosen === ALL_VALUE) params.delete("county");
        else params.set("county", chosen);
        window.location.replace(
          `${window.location.pathname}?${params.toString()}`);
      };
    const countyControl = createDroughtCountyControl(
      county.choices, county.selected?.fips ?? null, countyPicked, { scale: "l" });
    const drainageControl = createDroughtDrainageControl(
      opening.rosters,
      openingSelection,
      level,
      countyChosen ? county.scope?.codes : undefined,
      (chosen) => navigateWithPlace(selectionForDroughtArea(openingSelection, chosen)),
      { scale: "l" });
    const placeHost = content.querySelector<HTMLElement>(".filterbar-controls");
    if (placeHost) {
      placeInSlot(placeHost, "state", stateControl.element);
      if (countyControl) placeInSlot(placeHost, "county", countyControl.element);
      else if (openingSelection.state !== "all" && county.requested === null) {
        const countySlot = placeHost.querySelector<HTMLElement>(
          '.control-slot[data-slot="county"]');
        const pending = createDroughtCountyStatusControl("Loading counties", { scale: "l" });
        countySlot?.append(pending.element);
        void loadCountyChoices(openingSelection.state).then((choices) => {
          const control = createDroughtCountyControl(
            choices, null, countyPicked, { scale: "l" });
          if (control) countySlot?.replaceChildren(control.element);
          else countySlot?.replaceChildren(
            createDroughtCountyStatusControl("No counties are available", { scale: "l" }).element);
        }).catch((error: unknown) => {
          console.warn("The county choices could not be loaded:", error);
          countySlot?.replaceChildren(
            createDroughtCountyStatusControl("Counties are unavailable", { scale: "l" }).element);
        });
      }
      if (drainageControl) placeInSlot(placeHost, "area", drainageControl.element);
    }
  }

  worseSelect?.addEventListener("calciteSelectChange", () => {
    update({ worse: worseSelect.value === "" ? null : worseSelect.value });
  });
  sortSelect?.addEventListener("calciteSelectChange", () => {
    update({ sort: sortSelect.value as DroughtSort });
  });
  resetButton?.addEventListener("click", () => {
    /* The label says every area, so clear every selected-scope and row
     * filter. Keep Area size: it changes how the ground is divided, not
     * which part of it is selected. */
    const query = searchWithPlace(window.location.search, { state: "all", area: null });
    const params = new URLSearchParams(query.replace(/^\?/, ""));
    params.delete("county");
    params.delete("worse");
    params.delete("sort");
    window.location.replace(`${window.location.pathname}?${params.toString()}`);
  });

  draw();

  /* The map starts after the figures are on screen, from its own two
   * fetches: the national polygons the coverage was computed from, and the
   * drainage boundaries. Either failing costs the picture only; the note
   * says so and every share stays in the bars and table. */
  void (async () => {
    const mapHost = content.querySelector<HTMLElement>("#drought-map-host");
    if (!mapHost) return;
    const failed = (): void => {
      mapHost.setAttribute("aria-busy", "false");
      /* Layer toggles for a map that did not start have nothing behind them.
       * The condition and order controls stay available because they also
       * narrow and order the figures below. */
      content.querySelector<HTMLElement>("#drought-map-layer-controls")
        ?.setAttribute("hidden", "");
      mapHost.replaceChildren(mapStatusNote(
        "The map could not start. The bars and table carry the same shares."));
      /* The key still describes the bars below, so it is kept even when
       * there is no map to put it over. */
      legend.classList.remove("map-inset-legend");
      mapHost.append(legend);
      window.__droughtReady = {
        ...(window.__droughtReady ?? {}),
        mapClassesDrawn: 0,
        mapOutlines: 0,
        mapSnowSites: 0,
        mapSnowSitesShown: false
      } as NonNullable<typeof window.__droughtReady>;
    };
    try {
      installAnonymousAuthPolicy();
      /* Three fetches, one wait. The boundaries are the only optional one
       * -- they come from hosted services and resolve to null rather than
       * throwing, so a slow or missing state layer costs outlines and never
       * the map. */
      const snowSiteLayer = loadSnowSiteInventory(REFERENCE_LOAD_TIMEOUT_MS)
        .then((inventory) => loadSnowSiteReferenceLayer(inventory.sites))
        .catch((error: unknown) => {
          console.warn("Snowpack sites could not be added to the drought map:", error);
          return null;
        });
      const [drainageScope, usdm, boundaries, snowSites] = await Promise.all([
        loadDrainageScope(level, undefined, "drought"),
        loadUsdmPolygons(),
        loadReferenceBoundaries(),
        snowSiteLayer
      ]);
      /* A technical failure -- the export or the boundary service came back
       * empty -- checked against the *unnarrowed* roster, before a chosen
       * place ever gets a chance to explain an empty list honestly instead. */
      if (drainageScope.areas.length === 0) throw new Error("no drainage boundaries");
      /* D5: the drawn context follows the choice on drought -- the areas
       * are the subject here, unlike the storage map's where they are
       * context. `chosenCodesAtLevel` is already built at this page's own
       * level (`renderDrought`, above), so this is exact membership against
       * `drainageScope`'s own codes, not a prefix guess. */
      const scope: DrainageScope = chosenCodesAtLevel === null ? drainageScope : {
        level: drainageScope.level,
        areas: drainageScope.areas.filter((area) => chosenCodesAtLevel.has(area.huc6))
      };
      if (scope.areas.length === 0) {
        /* A resolved, narrowed-to-nothing answer -- a real state or area
         * with no drainage area on this roster -- not the technical failure
         * `failed()` describes below. Reported the same honest way the bars
         * and table already are for the same case (an empty `scopedUnits`),
         * rather than telling a reader the map "could not start" when
         * nothing actually broke. */
        mapHost.setAttribute("aria-busy", "false");
        mapHost.replaceChildren(mapStatusNote(
          "No drainage area matches the chosen place. The bars and table below say the same."));
        legend.classList.remove("map-inset-legend");
        mapHost.append(legend);
        window.__droughtReady = {
          ...(window.__droughtReady ?? {}),
          mapClassesDrawn: 0,
          mapOutlines: 0,
          mapSnowSites: 0,
          mapSnowSitesShown: false
        } as NonNullable<typeof window.__droughtReady>;
        return;
      }
      if (usdm.mapDate !== payload.map_date) {
        /* Two committed files describing two different weeks is a pipeline
         * fault the reader must not have to notice on their own. */
        throw new Error(
          `polygon week ${usdm.mapDate} does not match coverage week ${payload.map_date}`);
      }
      /* Framed, controlled and constrained exactly like the storage map,
       * with the hover card already beside it in the host. */
      const { element: mapElement, card } = createViewMap(mapHost, {
        label: "A map of drought classes over the drainage areas and reservoirs",
        cardId: "drought-map-hover"
      });
      /* The opening box, overriding what `createViewMap` just set from the
       * fixed, unscoped `drainageExtent()` -- only when a reader actually
       * chose a place. An unchosen page keeps the existing framing exactly,
       * rather than every ordinary visit suddenly opening on the union of
       * all 75 areas' boxes, which is a real, load-bearing behaviour change
       * this slice does not own (the coupling section of docs/OPENING-
       * SCOPE-AND-THE-WESTERN-ROSTER.md gates that on the roster and the
       * chooser control landing together, not on this file alone).
       *
       * This is *not* the late-correction pattern CLAUDE.md warns a gutter
       * against ("the measurement happens after the data loads, and the
       * control sits under the card until then"). There is no `await`
       * between `createViewMap` returning and this assignment -- both run in
       * the same synchronous turn, so nothing (no paint, no microtask, no
       * part of the component's own async view construction, which is what
       * `viewReadyWithin` below exists to wait on in the first place) can
       * observe the component's own default value in between. The reader's
       * chosen extent is in place before the view the element eventually
       * constructs is ever asked to go anywhere.
       *
       * Not expanded by an extra zoom-out level the way the storage map's
       * `regionExtent` is: `drainageExtent()`'s own comment is why -- these
       * cards are wide and short, an extent is a minimum, and asking a short
       * box to contain that much latitude already pushes the view out past
       * what an un-expanded box would on a full-height map. `extentFromBox`
       * is the one conversion every fixed and chosen extent on this site
       * goes through, so the corner order and spatial reference cannot drift
       * between them. */
      if (countyChosen && county.scope) {
        mapElement.extent = mapExtentFromBox(county.scope.box);
      } else if (opening && scopeChosen) {
        mapElement.extent = mapExtentFromBox(opening.scope.box);
      }
      const mapChanges = changesByArea(droughtChanges(scopedUnits, payload.previous));
      const mapController = await createDroughtMap(
        mapElement, card, scope, usdm, reservoirs,
        { units: scopedUnits, storage: storage ?? new Map(), changes: mapChanges },
        boundaries,
        snowSites);
      const mapStatus = mapController.status;
      // After the component has claimed the host, never before.
      mapHost.append(legend);
      mapHost.setAttribute("aria-busy", "false");
      if (!mapStatus.basemap) {
        mapHost.append(mapStatusNote("The map background is unavailable. " +
          "Drought classes, outlines and reservoirs are still drawn from local data."));
      } else if (mapStatus.basemapDegraded) {
        mapHost.append(mapStatusNote(
          "The preferred map background was unavailable. An alternate is shown."));
      }
      /* The reservoir points are placed and hidden (see `drought-map.ts`).
       * This is the reader's way to ask for them: the whole roster of labelled
       * points over five broad classes is more ink than this map's one
       * question asks for, and about three times more of it than when that
       * balance was last judged -- but the join is still what the page is
       * built around, so it is one click away rather than gone.
       *
       * Not a parameter and not stored. It changes what is drawn over the
       * subject, not which subject is drawn, so it is not a scope and does
       * not belong in a shared link beside `?state=` and `?area=`. */
      const reservoirLayer = mapElement.map?.findLayerById(
        RESERVOIR_REFERENCE_LAYER_ID);
      const snowSiteReferenceLayer = mapElement.map?.findLayerById(
        SNOW_SITE_REFERENCE_LAYER_ID);
      /* The toggles are declared markup in `.map-controls` at the end of the
       * filter card; this wires and enables them. A Calcite switch
       * was tried for the checkbox and axe-core refused it: the component's
       * real control lives in a shadow root, so neither a wrapping `<label>`
       * nor the component's own `label` attribute gave it an accessible
       * name. Native is the working answer, and inside its own group the
       * two controls are one family with each other. */
      const mapControls = content.querySelector<HTMLElement>("#drought-map-controls");
      const reservoirSwitch = content.querySelector<HTMLInputElement>("#drought-show-reservoirs");
      if (reservoirSwitch) {
        reservoirSwitch.disabled = false;
        reservoirSwitch.addEventListener("change", () => {
          const shown = reservoirSwitch.checked;
          if (reservoirLayer) reservoirLayer.visible = shown;
          window.__droughtReady = {
            ...(window.__droughtReady ?? {}), mapReservoirsShown: shown
          } as NonNullable<typeof window.__droughtReady>;
        });
      }
      const snowSitesControl = content.querySelector<HTMLElement>(
        "#drought-snow-sites-control");
      const snowSitesSwitch = content.querySelector<HTMLInputElement>(
        "#drought-show-snow-sites");
      if (snowSiteReferenceLayer && snowSitesSwitch) {
        snowSitesControl?.removeAttribute("hidden");
        snowSitesSwitch.disabled = false;
        snowSitesSwitch.addEventListener("change", () => {
          const shown = snowSitesSwitch.checked;
          snowSiteReferenceLayer.visible = shown;
          window.__droughtReady = {
            ...(window.__droughtReady ?? {}), mapSnowSitesShown: shown
          } as NonNullable<typeof window.__droughtReady>;
        });
      }

      /* What the map draws, offered only when there is a second week to draw
       * it from. A control that switches to a blank surface is worse than an
       * absent one: it tells a reader the comparison exists and then shows
       * them nothing (ADR-074). The chart and the table column say why in
       * words; a select cannot. */
      if (mapStatus.changeAreas > 0) {
        const modeField = document.createElement("calcite-label");
        modeField.className = "map-mode-control";
        modeField.append("Map shows");
        const modeSelect = document.createElement("calcite-select");
        modeSelect.id = "drought-map-mode";
        modeSelect.setAttribute("scale", "l");
        modeSelect.setAttribute("label", "Which drought view the map shows");
        for (const [value, text] of [
          ["classes", "This week's classes"],
          ["change", "Change since last week"]
        ] as const) {
          const option = document.createElement("calcite-option");
          option.setAttribute("value", value);
          option.textContent = text;
          modeSelect.append(option);
        }
        /* The card's own words follow the map, like the key does. In change
         * mode the sentence "the monitor's weekly national map in its own
         * colours" is false, and a description that stays put while the
         * surface under it changes is the kind of copy a reader stops
         * trusting. */
        const mapCopy = content.querySelector<HTMLElement>("#drought-map-copy");
        const classesCopy = mapCopy?.textContent ?? "";
        const changeCopy = "How much of each drainage area's land moved into "
          + `or out of ${dryness.label.toLowerCase()} (${dryness.code}) or worse `
          + `since ${formatDate(payload.previous?.map_date ?? "")}. `
          + "Only the drainage areas are coloured here. The monitor's own "
          + "classes are not drawn in this view.";
        modeSelect.addEventListener("calciteSelectChange", () => {
          const value = (modeSelect as unknown as { value: string }).value;
          const mode = value === "change" ? "change" : "classes";
          mapController.setMode(mode);
          fillLegend(mode);
          if (mapCopy) mapCopy.textContent = mode === "change" ? changeCopy : classesCopy;
          window.__droughtReady = {
            ...(window.__droughtReady ?? {}), mapMode: mode
          } as NonNullable<typeof window.__droughtReady>;
        });
        modeField.append(modeSelect);
        /* Into the declared map-options slot at the end of the card. */
        if (mapControls) placeInSlot(mapControls, "map-mode", modeField);
      }

      window.__droughtReady = {
        ...(window.__droughtReady ?? {}),
        mapClassesDrawn: mapStatus.classesDrawn,
        mapOutlines: mapStatus.outlines,
        mapAreaLabels: mapStatus.areaLabels,
        mapAreaLabelsDeconflicted: mapStatus.areaLabelsDeconflicted,
        mapReservoirs: mapStatus.reservoirs,
        mapReservoirLabels: mapStatus.reservoirLabels,
        mapReservoirsShown: mapStatus.reservoirsShown,
        mapSnowSites: mapStatus.snowSites,
        mapSnowSitesShown: mapStatus.snowSitesShown,
        mapStateBoundaries: mapStatus.stateBoundaries,
        mapCountyBoundaries: mapStatus.countyBoundaries,
        mapBasemap: mapStatus.basemap,
        mapViewReady: mapStatus.viewReady,
        mapMode: mapStatus.mode,
        mapChangeAreas: mapStatus.changeAreas
      } as NonNullable<typeof window.__droughtReady>;
    } catch (error) {
      console.warn("The drought map could not start:", error);
      failed();
    }
  })();
}

const level = levelFromSearch(window.location.search, DROUGHT_JOINABLE_LEVELS);
/* Read once, here, rather than inside `resolveOpening`: this is the
 * *requested* selection and stays available to `renderDrought` even when
 * resolving it against the reference export fails, which is what lets the
 * readiness fields and the on-page sentence tell "asked for nothing" apart
 * from "asked for California, could not load it" (see `resolveOpening`'s and
 * `renderDrought`'s own comments). */
/* The address bar wins where it answered, the reader's remembered place
   * otherwise, and everywhere when neither did (`resolveOpeningPlace`). The
   * stored choice is never written back into the address bar: what a reader
   * copies should be what they are looking at, not what they prefer. */
const requestedPlace = resolveOpeningPlace(window.location.search, readStoredPlace(), 8);
const requestedSelection = requestedPlace.selection;

try {
  /* The opening scope is fetched alongside the coverage payload rather than
   * after it: `resolveOpening` already swallows its own failure (returning
   * `null`), so this can never be what fails the page, and there is no
   * reason to make a reader who chose a place wait for two fetches in
   * series when neither depends on the other. Both are awaited before
   * `renderDrought` is ever called, so the very first paint of this page's
   * content already reflects the reader's narrowed scope -- there is no
   * intermediate render of all 75 areas for a chosen place to correct. */
  const [drought, opening, county] = await Promise.all([
    loadDroughtCoverage(level),
    resolveOpening(requestedSelection),
    resolveDroughtCounty(window.location.search, requestedSelection.state, level)
  ]);
  /* Storage is context, not the subject: if the reservoir payload cannot be
   * read the drought figures still render, each row saying the storage
   * comparison is missing rather than the page failing whole. */
  let storage: Map<string, StorageContext> | null = null;
  let reservoirs: readonly Reservoir[] = [];
  try {
    reservoirs = (await loadReservoirs()).reservoirs;
    storage = storageByArea(reservoirs, level);
  } catch (error) {
    console.warn("Reservoir storage could not be joined to the drought view:", error);
  }
  renderDrought(drought, storage, reservoirs, opening, county, requestedSelection);
} catch (error) {
  console.error("Drought view failed:", error);
  const content = document.querySelector<HTMLElement>("#drought-content");
  if (content) content.innerHTML = `<div class="overview-error" role="alert"><strong>The drought conditions could not load.</strong><p>Try again later or return to the storage map.</p></div>`;
}
