/*
 * The precipitation page's map block (ADR-131): the map, its key and every
 * station's value, in the card's map slot.
 *
 * Nothing here imports the map SDK at load. The map module, the drainage
 * areas, the map frame and the sign-in policy arrive with `import()` once
 * the recent totals are drawn and the slot is within 600 px of the screen,
 * so a phone shows the numbers first and fetches the SDK only for a reader
 * who scrolls toward it.
 */
import { precipMapValues, type PrecipMapValues } from "../precip-map-model";
import type { StormTotals, StormWindow } from "../precip-storm-model";
import type { SnowpackPayload, SnowSite } from "../types";
import { PRECIP_CLASSES, PRECIP_NO_VALUE_COLOR } from "../viz/precip-classes";
import type { PrecipMapController } from "./precip-map";

type Box = readonly [readonly [number, number], readonly [number, number]];

export interface PrecipMapSectionStatus {
  state: "waiting" | "loading" | "ready" | "failed";
  stations: number;
  withValue: number;
  notUsed: number;
  basins: number;
  basinsWithValue: number;
  window: StormWindow | null;
  basemap: boolean;
  basemapDegraded: boolean;
  viewReady: boolean;
}

export interface PrecipMapSection {
  readonly status: PrecipMapSectionStatus;
  /** The totals or the window changed; start the map once there are totals. */
  update(window: StormWindow, totals: StormTotals | null): void;
}

function note(text: string): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = "chart-empty";
  element.setAttribute("role", "status");
  element.textContent = text;
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

export function createPrecipMapSection(
  slot: HTMLElement,
  payload: SnowpackPayload,
  sites: readonly SnowSite[],
  level: number,
  box: Box,
  siteHref: (station: string) => string,
  onChange: () => void
): PrecipMapSection {
  const host = document.createElement("div");
  host.id = "precip-map-host";
  host.className = "view-map-host";
  host.setAttribute("role", "region");
  host.setAttribute("aria-label", "Map of recent precipitation by drainage area and measurement site");
  host.setAttribute("aria-busy", "true");
  /* The whole scale, always, as the snow map's key does: a key that changes
   * length with the weather is harder to learn than one that does not. */
  const key = document.createElement("div");
  key.className = "drought-legend precip-map-key";
  key.setAttribute("role", "list");
  key.setAttribute("aria-label", "Map colours and the inches they stand for");
  key.replaceChildren(
    ...PRECIP_CLASSES.map((entry) => keyItem(entry.label, entry.color)),
    keyItem("No total, or too few stations", PRECIP_NO_VALUE_COLOR));
  const caption = document.createElement("p");
  caption.className = "card-note";
  caption.textContent = "Each drainage area takes its colour from the mean of its stations with a total. " +
    "It needs as many of them as its snow figure does. Each point is one station on the same scale. " +
    "The colours are the snow map's: blue is wet.";

  /* Every value, for a reader who cannot see the map or tell its colours
   * apart. Built on first open: the whole region is six hundred rows. */
  const table = document.createElement("details");
  table.className = "snow-month-details precip-map-table";
  const summary = document.createElement("summary");
  summary.textContent = "Values at every station on the map";
  const scroller = document.createElement("div");
  scroller.className = "table-scroll";
  scroller.tabIndex = 0;
  scroller.setAttribute("role", "region");
  scroller.setAttribute("aria-label", "Values at every station, scrolls sideways");
  const tableElement = document.createElement("table");
  tableElement.className = "overview-table";
  tableElement.innerHTML = "<thead><tr><th>Site</th><th>Drainage area</th><th>Inches</th></tr></thead>";
  const tbody = document.createElement("tbody");
  tableElement.append(tbody);
  scroller.append(tableElement);
  table.append(summary, scroller);
  slot.replaceChildren(host, key, caption, table);

  const siteAreas = new Map(sites.map((site) => [site.station, site.huc6]));
  const areaFloors = new Map(payload.rollups.map((rollup) => [rollup.huc6, rollup.minimum_reporting_sites]));
  const status: PrecipMapSectionStatus = {
    state: "waiting", stations: sites.length, withValue: 0, notUsed: sites.length,
    basins: 0, basinsWithValue: 0, window: null,
    basemap: false, basemapDegraded: false, viewReady: false
  };
  let values: PrecipMapValues | null = null;
  let map: PrecipMapController | null = null;
  let started = false;

  const drawTable = (): void => {
    if (!table.open || !values) return;
    const shown = values.sites;
    const rows = [...sites].sort((a, b) =>
      (shown.get(b.station) ?? -1) - (shown.get(a.station) ?? -1) || a.name.localeCompare(b.name));
    tbody.replaceChildren(...rows.map((site) => {
      const row = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      const anchor = document.createElement("a");
      anchor.href = siteHref(site.station);
      anchor.textContent = site.name;
      name.append(anchor);
      const area = document.createElement("td");
      area.textContent = site.huc6_name;
      const inches = document.createElement("td");
      const value = shown.get(site.station);
      inches.textContent = value === undefined ? "No total" : value < 0.05 ? "Less than 0.1" : value.toFixed(1);
      row.append(name, area, inches);
      return row;
    }));
  };
  table.addEventListener("toggle", drawTable);

  const publish = (): void => {
    status.window = values?.window ?? null;
    status.withValue = values?.sites.size ?? 0;
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
        label: "A map of the drainage areas and measurement sites, coloured by recent precipitation",
        cardId: "precip-map-hover"
      });
      element.extent = mapExtentFromBox(box);
      map = await createPrecipMap(element, card, scope, sites);
      if (values) map.setValues(values);
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
      host.replaceChildren(note("The map could not start. The list and the table below carry the same values."));
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
    get status() { return { ...status }; },
    update(window, totals) {
      values = precipMapValues(window, totals, siteAreas, areaFloors);
      if (totals?.endDate) startWhenNear();
      map?.setValues(values);
      drawTable();
      publish();
    }
  };
}
