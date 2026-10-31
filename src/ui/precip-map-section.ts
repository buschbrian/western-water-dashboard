/*
 * The precipitation page's map block (ADR-131): the map, its key and every
 * station's value, in the card's map slot.
 *
 * Nothing here imports the map SDK at load. The map module, the drainage
 * areas, the map frame and the sign-in policy arrive with `import()` once
 * the recent totals are drawn and the slot is within 600 px of the screen,
 * so a phone shows the numbers first and fetches the SDK only for a reader
 * who scrolls toward it.
 *
 * A "Rain | Soil moisture" switch above it (ADR-142) turns the same map to
 * the week's soil-moisture change: one map SDK and one set of areas on a
 * phone, not two. Soil mode has its own key, its own list and its own
 * values table; the day buttons and the rain list hide while it shows. The
 * soil file is fetched the first time a reader turns the switch.
 */
import { precipMapValues, type PrecipMapValues } from "../precip-map-model";
import type { StormTotals, StormWindow } from "../precip-storm-model";
import {
  soilCountsText, soilLeftOutText, soilMapValues, soilNoChangeText, soilWeekText, type SoilMapValues
} from "../soil-map-model";
import type { SnowpackPayload, SnowSite, SoilMoisturePayload } from "../types";
import { PRECIP_CLASSES, PRECIP_NO_VALUE_COLOR } from "../viz/precip-classes";
import { SOIL_CLASSES, SOIL_NO_VALUE_COLOR, soilChangeText } from "../viz/soil-classes";
import type { PrecipMapController } from "./precip-map";
import { precipMapLabel, precipMapModeView, type PrecipMapMode, type SoilLoadState } from "./precip-map-mode-model";

type Box = readonly [readonly [number, number], readonly [number, number]];

export interface SoilSectionStatus {
  state: SoilLoadState;
  /** The day the week ends, or null before the file is in or with no week. */
  endDate: string | null;
  /** Stations in the place with soil sensors in the file, and of those with a change. */
  stations: number;
  withChange: number;
  /** Rows in the "most change" list. */
  rows: number;
}

export interface PrecipMapSectionStatus {
  state: "waiting" | "loading" | "ready" | "failed";
  /** What the switch shows (ADR-142). */
  mode: PrecipMapMode;
  stations: number;
  withValue: number;
  notUsed: number;
  basins: number;
  basinsWithValue: number;
  window: StormWindow | null;
  basemap: boolean;
  basemapDegraded: boolean;
  viewReady: boolean;
  soil: SoilSectionStatus;
}

export interface PrecipMapSection {
  readonly status: PrecipMapSectionStatus;
  /** The totals or the window changed; start the map once there are totals. */
  update(window: StormWindow, totals: StormTotals | null): void;
}

export interface PrecipMapSectionOptions {
  /** The card's day buttons: the switch goes above them, and they hide in soil mode. */
  chooser?: HTMLElement | null;
  /** Shows or hides the card's own list of recent totals. */
  showRecentList?: (shown: boolean) => void;
  /** Loads the soil file; the page's own loader unless a test supplies one. */
  loadSoil?: () => Promise<SoilMoisturePayload>;
  /** The mode the link asked for (ADR-142); rain when absent. */
  initialMode?: PrecipMapMode;
  /** The reader switched, or the soil file failed after they did: the mode now shown. */
  onModeChange?: (mode: PrecipMapMode) => void;
}

const SOIL_ROWS = 8;

function note(text: string): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = "chart-empty";
  element.setAttribute("role", "status");
  element.textContent = text;
  return element;
}

function paragraph(className: string, content = ""): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = content;
  return element;
}

function span(className: string, content: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = className;
  element.textContent = content;
  return element;
}

function keyItem(label: string, color: string): HTMLElement {
  const item = document.createElement("span");
  item.className = "drought-legend-item";
  item.setAttribute("role", "listitem");
  const swatch = document.createElement("span");
  swatch.className = "drought-swatch";
  swatch.style.background = color;
  const text = document.createElement("span");
  text.textContent = label;
  item.append(swatch, text);
  return item;
}

function key(className: string, label: string, items: HTMLElement[]): HTMLElement {
  const element = document.createElement("div");
  element.className = `drought-legend ${className}`;
  element.setAttribute("role", "list");
  element.setAttribute("aria-label", label);
  element.replaceChildren(...items);
  return element;
}

function valuesTable(className: string, summaryText: string, label: string, headings: readonly string[]):
  { details: HTMLDetailsElement; tbody: HTMLTableSectionElement } {
  const details = document.createElement("details");
  details.className = `snow-month-details ${className}`;
  const summary = document.createElement("summary");
  summary.textContent = summaryText;
  const scroller = document.createElement("div");
  scroller.className = "table-scroll";
  scroller.tabIndex = 0;
  scroller.setAttribute("role", "region");
  scroller.setAttribute("aria-label", label);
  const table = document.createElement("table");
  table.className = "overview-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(...headings.map((heading) => {
    const cell = document.createElement("th");
    cell.textContent = heading;
    return cell;
  }));
  head.append(headRow);
  const tbody = document.createElement("tbody");
  table.append(head, tbody);
  scroller.append(table);
  details.append(summary, scroller);
  return { details, tbody };
}

function siteCell(site: SnowSite, siteHref: (station: string) => string): HTMLTableCellElement {
  const name = document.createElement("th");
  name.scope = "row";
  const anchor = document.createElement("a");
  anchor.href = siteHref(site.station);
  anchor.textContent = site.name;
  name.append(anchor);
  return name;
}

function cell(content: string): HTMLTableCellElement {
  const element = document.createElement("td");
  element.textContent = content;
  return element;
}

export function createPrecipMapSection(
  slot: HTMLElement,
  payload: SnowpackPayload,
  sites: readonly SnowSite[],
  level: number,
  box: Box,
  siteHref: (station: string) => string,
  onChange: () => void,
  options: PrecipMapSectionOptions = {}
): PrecipMapSection {
  const host = document.createElement("div");
  host.id = "precip-map-host";
  host.className = "view-map-host";
  host.setAttribute("role", "region");
  host.setAttribute("aria-label", precipMapLabel("rain"));
  host.setAttribute("aria-busy", "true");

  /* Rain mode. The whole scale, always, as the snow map's key does: a key
   * that changes length with the weather is harder to learn than one that
   * does not. */
  const rain = document.createElement("div");
  rain.className = "precip-map-mode-rain";
  const rainKey = key("precip-map-key", "Map colours and the inches they stand for", [
    ...PRECIP_CLASSES.map((entry) => keyItem(entry.label, entry.color)),
    keyItem("No total, or too few stations", PRECIP_NO_VALUE_COLOR)]);
  const rainCaption = paragraph("card-note",
    "Each drainage area takes its colour from the mean of its stations with a total. " +
    "It needs as many of them as its snow figure does. Each point is one station on the same scale. " +
    "The colours are the snow map's: blue is wet.");
  /* Every value, for a reader who cannot see the map or tell its colours
   * apart. Built on first open: the whole region is six hundred rows. */
  const rainTable = valuesTable("precip-map-table", "Values at every station on the map",
    "Values at every station, scrolls sideways", ["Site", "Drainage area", "Inches"]);
  rain.append(rainKey, rainCaption, rainTable.details);

  /* Soil mode (ADR-142). */
  const soil = document.createElement("div");
  soil.className = "precip-map-mode-soil";
  soil.hidden = true;
  const soilKey = key("precip-soil-key", "Map colours and the change in soil moisture they stand for", [
    ...SOIL_CLASSES.map((entry) => keyItem(entry.label, entry.color)),
    keyItem("No change measured, or too few stations", SOIL_NO_VALUE_COLOR)]);
  const soilCaption = paragraph("card-note",
    "Soil moisture is the water in the soil, in percent of the soil's volume. " +
    "A station's value is the mean of its sensors at 2 in (or 4 in), 8 in and 20 in below the ground. " +
    "A station without all three has no value. The map shows the change in percentage points over 7 days. " +
    "A reading is not used on a day the soil at that depth is frozen, because frozen soil reads falsely dry. " +
    "Each drainage area takes its colour from the mean change of its stations with a change. It needs as many " +
    "of them as its snow figure does. Only stations with soil sensors are shown.");
  const soilWeek = paragraph("precip-coverage");
  const soilListTitle = paragraph("chart-axis-title", "");
  const soilCounts = paragraph("precip-note");
  soilCounts.setAttribute("role", "status");
  const soilList = document.createElement("ol");
  soilList.className = "precip-soil-list";
  const soilNote = paragraph("precip-coverage");
  const soilTable = valuesTable("precip-soil-table", "Soil moisture at every station on the map",
    "Soil moisture at every station, scrolls sideways",
    ["Site", "Drainage area", "Change in 7 days", "Soil water at the end (%)", "Sensor depths (in)"]);
  const soilFailed = note("");
  soilFailed.hidden = true;
  soil.append(soilWeek, soilKey, soilCaption, soilListTitle, soilCounts, soilList, soilNote, soilTable.details);

  /* The switch: two plain toggle buttons, the card's own idiom for one choice. */
  const switchHead = document.createElement("div");
  switchHead.className = "precip-storm-head precip-map-mode-head";
  const switchGroup = document.createElement("div");
  switchGroup.className = "precip-range";
  switchGroup.setAttribute("role", "group");
  switchGroup.setAttribute("aria-label", "What the map shows");
  const modeButtons = new Map<PrecipMapMode, HTMLButtonElement>();
  for (const [mode, label] of [["rain", "Rain"], ["soil", "Soil moisture"]] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-pressed", String(mode === "rain"));
    button.addEventListener("click", () => setMode(mode));
    modeButtons.set(mode, button);
    switchGroup.append(button);
  }
  switchHead.append(paragraph("chart-axis-title", "Map shows"), switchGroup);
  if (options.chooser?.parentElement) options.chooser.before(switchHead);
  else slot.append(switchHead);

  slot.append(host, soilFailed, rain, soil);

  const siteAreas = new Map(sites.map((site) => [site.station, site.huc6]));
  const siteByStation = new Map(sites.map((site) => [site.station, site]));
  const areaFloors = new Map(payload.rollups.map((rollup) => [rollup.huc6, rollup.minimum_reporting_sites]));
  const status: PrecipMapSectionStatus = {
    state: "waiting", mode: "rain", stations: sites.length, withValue: 0, notUsed: sites.length,
    basins: 0, basinsWithValue: 0, window: null,
    basemap: false, basemapDegraded: false, viewReady: false,
    soil: { state: "idle", endDate: null, stations: 0, withChange: 0, rows: 0 }
  };
  let values: PrecipMapValues | null = null;
  let soilValues: SoilMapValues | null = null;
  let soilLoad: Promise<void> | null = null;
  let map: PrecipMapController | null = null;
  let started = false;

  const drawRainTable = (): void => {
    if (!rainTable.details.open || !values) return;
    const shown = values.sites;
    const rows = [...sites].sort((a, b) =>
      (shown.get(b.station) ?? -1) - (shown.get(a.station) ?? -1) || a.name.localeCompare(b.name));
    rainTable.tbody.replaceChildren(...rows.map((site) => {
      const row = document.createElement("tr");
      const value = shown.get(site.station);
      row.append(siteCell(site, siteHref), cell(site.huc6_name),
        cell(value === undefined ? "No total" : value < 0.05 ? "Less than 0.1" : value.toFixed(1)));
      return row;
    }));
  };
  rainTable.details.addEventListener("toggle", drawRainTable);

  const drawSoilTable = (): void => {
    if (!soilTable.details.open || !soilValues) return;
    const shown = soilValues.sites;
    const rows = sites.filter((site) => shown.has(site.station)).sort((a, b) =>
      (shown.get(b.station)!.change_points ?? -Infinity) - (shown.get(a.station)!.change_points ?? -Infinity)
      || a.name.localeCompare(b.name));
    soilTable.tbody.replaceChildren(...rows.map((site) => {
      const reading = shown.get(site.station)!;
      const row = document.createElement("tr");
      row.append(siteCell(site, siteHref), cell(site.huc6_name),
        cell(reading.change_points === null ? `No change: ${soilNoChangeText(reading).toLowerCase()}`
          : soilChangeText(reading.change_points)),
        cell(reading.end_percent === null ? "No value" : reading.end_percent.toFixed(1)),
        cell(reading.depths_inches.join(", ")));
      return row;
    }));
  };
  soilTable.details.addEventListener("toggle", drawSoilTable);

  const drawSoil = (): void => {
    const shown = soilValues;
    if (!shown) return;
    const { counts } = shown;
    status.soil.endDate = shown.endDate;
    status.soil.stations = counts.stations;
    status.soil.withChange = counts.measured;
    soilWeek.textContent = soilWeekText(shown);
    soilListTitle.textContent = counts.measured > 0 ? "Wetter and drier this week: most change" : "";
    soilCounts.textContent = soilCountsText(counts);
    const rows = shown.ranked.slice(0, SOIL_ROWS);
    soilList.replaceChildren(...rows.map((reading, index) => {
      const site = siteByStation.get(reading.station);
      const item = document.createElement("li");
      const rank = span("precip-storm-rank", `${index + 1}`);
      rank.setAttribute("aria-hidden", "true");
      const label = document.createElement("a");
      label.className = "precip-storm-name";
      label.textContent = site?.name ?? reading.station;
      label.href = siteHref(reading.station);
      const where = span("precip-storm-area", site?.huc6_name ?? "");
      const value = document.createElement("strong");
      value.className = "precip-storm-value";
      value.textContent = soilChangeText(reading.change_points);
      item.append(rank, label, where, value);
      return item;
    }));
    soilList.hidden = rows.length === 0;
    status.soil.rows = rows.length;
    soilNote.textContent = soilLeftOutText(counts);
    drawSoilTable();
  };

  const publish = (): void => {
    status.window = values?.window ?? null;
    if (status.mode === "rain") {
      status.withValue = values?.sites.size ?? 0;
    } else {
      status.withValue = soilValues ? [...soilValues.sites.values()].filter((site) => site.change_points !== null).length : 0;
    }
    status.notUsed = sites.length - status.withValue;
    if (map) {
      Object.assign(status, {
        basins: map.status.basins, basinsWithValue: map.status.basinsWithValue,
        basemap: map.status.basemap, basemapDegraded: map.status.basemapDegraded,
        viewReady: map.status.viewReady
      });
    }
    onChange();
  };

  const drawMap = (): void => {
    if (!map) return;
    if (status.mode === "soil" && soilValues) map.setSoilValues(soilValues);
    else if (values) map.setValues(values);
  };

  let requested: PrecipMapMode = options.initialMode ?? "rain";
  const showMode = (): void => {
    const view = precipMapModeView(requested, status.soil.state);
    status.mode = view.mode;
    modeButtons.get("rain")!.setAttribute("aria-pressed", String(view.rainPressed));
    modeButtons.get("soil")!.setAttribute("aria-pressed", String(view.soilPressed));
    rain.hidden = !view.rainShown;
    soil.hidden = !view.soilShown;
    soilFailed.textContent = view.failure ?? "";
    soilFailed.hidden = view.failure === null;
    options.showRecentList?.(view.recentListShown);
    host.setAttribute("aria-label", precipMapLabel(view.mode));
    drawMap();
    publish();
  };

  const loadSoil = (): Promise<void> => {
    soilLoad ??= (async () => {
      status.soil.state = "loading";
      soil.setAttribute("aria-busy", "true");
      publish();
      try {
        const load = options.loadSoil ?? (await import("../data/soil-load")).loadSoilMoisture;
        soilValues = soilMapValues(await load(), siteAreas, areaFloors);
        status.soil.state = "ready";
        drawSoil();
      } catch (error) {
        console.warn("The soil moisture measurements could not load:", error);
        status.soil.state = "failed";
        soilLoad = null;
      } finally {
        soil.setAttribute("aria-busy", "false");
      }
    })();
    return soilLoad;
  };

  function setMode(mode: PrecipMapMode): void {
    if (requested === mode && status.mode === mode) return;
    requested = mode;
    if (mode === "soil" && status.soil.state === "failed") status.soil.state = "idle";
    showMode();
    options.onModeChange?.(status.mode);
    if (mode === "soil") {
      void loadSoil().then(() => {
        showMode();
        options.onModeChange?.(status.mode);
      });
    }
  }

  if (requested === "soil") {
    showMode();
    void loadSoil().then(showMode);
  }

  const start = async (): Promise<void> => {
    status.state = "loading";
    publish();
    try {
      const [
        { installAnonymousAuthPolicy }, { createViewMap, mapStatusNote }, { createPrecipMap },
        { mapExtentFromBox }, { loadDrainageScope }, { measuredScope }
      ] = await Promise.all([
        import("../arcgis/basemaps"), import("./view-map"), import("./precip-map"),
        import("../viz/extent"), import("../data/boundaries"), import("../snow-model")
      ]);
      /* Before any map, layer or basemap exists: a 401 must fail, never ask
       * a visitor to sign in (src/arcgis/auth.ts). */
      installAnonymousAuthPolicy();
      /* The areas this place's stations are in: a one-area link draws its
       * area, not forty-eight grey ones around it. */
      const measured = measuredScope(await loadDrainageScope(level), payload);
      const placeAreas = new Set(sites.map((site) => site.huc6));
      const scope = { ...measured, areas: measured.areas.filter((area) => placeAreas.has(area.huc6)) };
      const { element, card } = createViewMap(host, {
        label: "A map of the drainage areas and measurement sites, coloured by recent precipitation or by the change in soil moisture",
        cardId: "precip-map-hover"
      });
      element.extent = mapExtentFromBox(box);
      map = await createPrecipMap(element, card, scope, sites);
      drawMap();
      host.setAttribute("aria-busy", "false");
      if (!map.status.basemap) {
        host.append(mapStatusNote("The map background is unavailable. Areas and sites are still drawn from local data."));
      } else if (map.status.basemapDegraded) {
        host.append(mapStatusNote("The preferred map background was unavailable. An alternate is shown."));
      }
      status.state = "ready";
    } catch (error) {
      console.warn("The precipitation map could not start:", error);
      host.setAttribute("aria-busy", "false");
      host.replaceChildren(note("The map could not start. The lists and the tables below carry the same values."));
      status.state = "failed";
    }
    publish();
  };

  const startWhenNear = (): void => {
    if (started) return;
    started = true;
    if (!("IntersectionObserver" in globalThis)) {
      void start();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void start();
    }, { rootMargin: "600px 0px" });
    observer.observe(host);
  };

  return {
    get status() { return { ...status, soil: { ...status.soil } }; },
    update(window, totals) {
      values = precipMapValues(window, totals, siteAreas, areaFloors);
      if (totals?.endDate) startWhenNear();
      if (status.mode === "rain") map?.setValues(values);
      drawRainTable();
      publish();
    }
  };
}
