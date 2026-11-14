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
  soilCountsText, soilLeftOutText, soilMapValues, soilMostChange, soilNoChangeText, soilNoSideText,
  soilWeekText, type SoilMapValues
} from "../soil-map-model";
import { precipStandingValues, type StandingValues } from "../precip-standing-model";
import type {
  PrecipitationHistory, PrecipitationPayload, SnowpackPayload, SnowSite, SoilMoisturePayload
} from "../types";
import {
  STANDING_CLASSES, STANDING_RECORD_RING, STANDING_TOO_EARLY_LABEL, standingShortLabel
} from "../viz/precip-standing-classes";
import { PRECIP_CLASSES, PRECIP_NO_VALUE_COLOR } from "../viz/precip-classes";
import { SOIL_CLASSES, SOIL_NO_VALUE_COLOR, soilChangeText } from "../viz/soil-classes";
import { standingText, type PrecipMapController } from "./precip-map";
import {
  precipMapLabel, precipMapModeView, soilSwitchLabel, type PrecipMapMode, type SoilLoadState
} from "./precip-map-mode-model";

type Box = readonly [readonly [number, number], readonly [number, number]];

export interface SoilSectionStatus {
  state: SoilLoadState;
  /** The day the week ends, or null before the file is in or with no week. */
  endDate: string | null;
  /** Stations in the place with soil sensors in the file, and of those with a change. */
  stations: number;
  withChange: number;
  /** Rows in the "most change" lists, wetter and drier together. */
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
  years: YearsSectionStatus;
}

/** This water year against past years (ADR-170). */
export interface YearsSectionStatus {
  /** Waiting until both precipitation files are in. */
  state: "waiting" | "ready";
  date: string | null;
  /** Stations placed against their own past years. */
  stations: number;
  /** Of those, stations with gaps in their record. */
  partialRecord: number;
  areasWithValue: number;
  /** Rows in the wettest and driest lists together. */
  rows: number;
}

/** Stations in each of the wettest and driest lists. */
const YEARS_LIST_LENGTH = 8;

export interface PrecipMapSection {
  readonly status: PrecipMapSectionStatus;
  /** The totals or the window changed; start the map once there are totals. */
  update(window: StormWindow, totals: StormTotals | null): void;
  /** Both precipitation files are in: the comparison with past years can draw. */
  setHistory(daily: PrecipitationPayload, history: PrecipitationHistory): void;
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
    keyItem("No value: too few stations, or no reading on both days", SOIL_NO_VALUE_COLOR)]);
  const soilCaption = paragraph("card-note",
    "Soil moisture is the water in the soil, in percent of the soil's volume. " +
    "A station's value is the mean of its sensors at 2 in (or 4 in), 8 in and 20 in below the ground. " +
    "A station without all three has no value. The map shows the change in percentage points over 7 days. " +
    "A reading is not used on a day the soil at that depth is frozen, because frozen soil reads falsely dry. " +
    "Each drainage area takes its colour from the mean change of its stations with a change. It needs as many " +
    "of them as its snow figure does. Only stations with soil sensors are shown.");
  const soilWeek = paragraph("precip-coverage");
  const soilCounts = paragraph("precip-note");
  soilCounts.setAttribute("role", "status");
  /* Two lists, not one ranked by size (ruling U5, 2026-10-31): in a wet
   * week eight stations by size are all wetter, and the stations that dried
   * are the ones a water manager looks for first. */
  const soilSide = (title: string, direction: "wetter" | "drier") => {
    const block = document.createElement("div");
    block.className = `precip-soil-side precip-soil-${direction}`;
    const list = document.createElement("ol");
    list.className = "precip-soil-list";
    const empty = paragraph("precip-coverage precip-soil-empty", soilNoSideText(direction));
    block.append(paragraph("chart-axis-title", title), list, empty);
    return { block, list, empty };
  };
  const soilWetter = soilSide("Largest increase", "wetter");
  const soilDrier = soilSide("Largest decrease", "drier");
  const soilNote = paragraph("precip-coverage");
  const soilTable = valuesTable("precip-soil-table", "Soil moisture at every station on the map",
    "Soil moisture at every station, scrolls sideways",
    ["Site", "Drainage area", "Change in 7 days", "Soil water at the end (%)", "Sensor depths (in)"]);
  const soilFailed = note("");
  soilFailed.hidden = true;
  soil.append(soilWeek, soilKey, soilCaption, soilCounts, soilWetter.block, soilDrier.block, soilNote,
    soilTable.details);

  /* Past years (ADR-170): where this water year stands at each station
   * against its own record, and in each area against the mean of its
   * stations with the full record. */
  const years = document.createElement("div");
  years.className = "precip-map-mode-years";
  years.hidden = true;
  const yearsKey = key("precip-years-key", "Map colours and how this year compares with past years", [
    ...STANDING_CLASSES.map((entry) => keyItem(entry.label, entry.color)),
    keyItem("Dark ring: the wettest or driest of the years compared", STANDING_RECORD_RING),
    keyItem(`No value: ${STANDING_TOO_EARLY_LABEL.toLowerCase()}, too few stations, or too short a record`,
      PRECIP_NO_VALUE_COLOR)]);
  const yearsDate = paragraph("precip-coverage");
  const yearsCaption = paragraph("card-note",
    "Each station's precipitation since 1 October is compared with the same date in each of its past water years. " +
    "A station needs at least 10 past years. A station with gaps in its record is compared with the years it has. " +
    "Each drainage area takes its colour from the mean of its stations that have every past year, " +
    "and it needs at least 3 of them. " +
    "The classes are the ones the U.S. National Centers for Environmental Information use to rank a season: " +
    "the lowest and highest tenth of years, and the lowest, middle and highest third. " +
    "There is no class until the median for the date is 1 inch or more.");
  const yearsWait = paragraph("precip-coverage", "The comparison with past years shows when the history is in.");
  yearsWait.setAttribute("role", "status");
  const yearsSide = (title: string, className: string) => {
    const block = document.createElement("div");
    block.className = `precip-years-side ${className}`;
    const list = document.createElement("ol");
    list.className = "precip-years-list";
    block.append(paragraph("chart-axis-title", title), list);
    return { block, list };
  };
  const yearsWettest = yearsSide("Wettest against their own past years", "precip-years-wetter");
  const yearsDriest = yearsSide("Driest against their own past years", "precip-years-drier");
  const yearsNote = paragraph("precip-coverage");
  const yearsTable = valuesTable("precip-years-table", "Past-year comparison at every station on the map",
    "Past-year comparison at every station, scrolls sideways",
    ["Site", "Drainage area", "Inches since 1 October", "Median (in)", "Rank", "Class", "Past years compared"]);
  years.append(yearsDate, yearsKey, yearsCaption, yearsWait, yearsWettest.block, yearsDriest.block, yearsNote,
    yearsTable.details);

  /* The switch: two plain toggle buttons, the card's own idiom for one choice. */
  const switchHead = document.createElement("div");
  switchHead.className = "precip-storm-head precip-map-mode-head";
  const switchGroup = document.createElement("div");
  switchGroup.className = "precip-range";
  switchGroup.setAttribute("role", "group");
  switchGroup.setAttribute("aria-label", "What the map shows");
  const modeButtons = new Map<PrecipMapMode, HTMLButtonElement>();
  for (const [mode, label] of [["rain", "Rain"], ["soil", soilSwitchLabel(null)], ["years", "Compared with past years"]] as const) {
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

  slot.append(host, soilFailed, rain, soil, years);

  const siteAreas = new Map(sites.map((site) => [site.station, site.huc6]));
  const siteByStation = new Map(sites.map((site) => [site.station, site]));
  const areaFloors = new Map(payload.rollups.map((rollup) => [rollup.huc6, rollup.minimum_reporting_sites]));
  const status: PrecipMapSectionStatus = {
    state: "waiting", mode: "rain", stations: sites.length, withValue: 0, notUsed: sites.length,
    basins: 0, basinsWithValue: 0, window: null,
    basemap: false, basemapDegraded: false, viewReady: false,
    soil: { state: "idle", endDate: null, stations: 0, withChange: 0, rows: 0 },
    years: { state: "waiting", date: null, stations: 0, partialRecord: 0, areasWithValue: 0, rows: 0 }
  };
  let standing: StandingValues | null = null;
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
    modeButtons.get("soil")!.textContent = soilSwitchLabel(shown.endDate);
    status.soil.stations = counts.stations;
    status.soil.withChange = counts.measured;
    soilWeek.textContent = soilWeekText(shown);
    soilCounts.textContent = soilCountsText(counts);
    const most = soilMostChange(shown);
    const fill = (side: typeof soilWetter, rows: typeof most.wetter): void => {
      side.list.replaceChildren(...rows.map((reading, index) => {
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
      side.list.hidden = rows.length === 0;
      side.empty.hidden = rows.length > 0;
      side.block.hidden = counts.measured === 0;
    };
    fill(soilWetter, most.wetter);
    fill(soilDrier, most.drier);
    status.soil.rows = most.wetter.length + most.drier.length;
    soilNote.textContent = soilLeftOutText(counts);
    drawSoilTable();
  };

  const drawYearsTable = (): void => {
    if (!yearsTable.details.open || !standing) return;
    const shown = standing.sites;
    const rows = [...sites].sort((a, b) =>
      (shown.get(b.station)?.percentile ?? -1) - (shown.get(a.station)?.percentile ?? -1)
      || a.name.localeCompare(b.name));
    yearsTable.tbody.replaceChildren(...rows.map((site) => {
      const value = shown.get(site.station);
      const row = document.createElement("tr");
      row.append(siteCell(site, siteHref), cell(site.huc6_name),
        cell(value ? value.inches.toFixed(1) : "Not compared"),
        cell(value ? value.medianInches.toFixed(1) : ""),
        cell(value ? `${value.rank} of ${value.years + 1}` : ""),
        cell(value ? (value.standingClass ? standingShortLabel(value.standingClass) : "Too early to compare")
          + (value.record ? (value.record === "wettest" ? ", wettest" : ", driest") : "") : ""),
        cell(value ? `${value.years}${value.fullRecord ? "" : ", with gaps"}` : ""));
      return row;
    }));
  };
  yearsTable.details.addEventListener("toggle", drawYearsTable);

  const drawYears = (): void => {
    const shown = standing;
    if (!shown) return;
    const placed = [...shown.sites.entries()];
    status.years = {
      state: "ready",
      date: shown.date,
      stations: placed.length,
      partialRecord: placed.filter(([, value]) => !value.fullRecord).length,
      areasWithValue: [...shown.areas.values()].filter((area) => area.standing?.standingClass).length,
      rows: 0
    };
    yearsWait.hidden = true;
    yearsDate.textContent = shown.date
      ? `Precipitation since 1 October to ${shown.date}, against water years ${shown.firstWaterYear} to ${shown.lastWaterYear}.`
      : "No day has enough stations with a reading to compare.";
    const classed = placed.filter(([, value]) => value.standingClass !== null);
    const fill = (list: HTMLOListElement, rows: typeof classed): void => {
      list.replaceChildren(...rows.map(([station, value], index) => {
        const site = siteByStation.get(station);
        const item = document.createElement("li");
        const rank = span("precip-storm-rank", `${index + 1}`);
        rank.setAttribute("aria-hidden", "true");
        const label = document.createElement("a");
        label.className = "precip-storm-name";
        label.textContent = site?.name ?? station;
        label.href = siteHref(station);
        const where = span("precip-storm-area", site?.huc6_name ?? "");
        const figure = document.createElement("strong");
        figure.className = "precip-storm-value";
        figure.textContent = `${value.medianInches > 0 ? Math.round((100 * value.inches) / value.medianInches) : 0}% of median`;
        item.title = standingText(value);
        item.append(rank, label, where, figure);
        return item;
      }));
    };
    const ratio = ([, value]: (typeof classed)[number]): number => value.inches / value.medianInches;
    const wettest = classed.filter(([, value]) => value.percentile >= 50)
      .sort((a, b) => b[1].percentile - a[1].percentile || ratio(b) - ratio(a)).slice(0, YEARS_LIST_LENGTH);
    const driest = classed.filter(([, value]) => value.percentile < 50)
      .sort((a, b) => a[1].percentile - b[1].percentile || ratio(a) - ratio(b)).slice(0, YEARS_LIST_LENGTH);
    fill(yearsWettest.list, wettest);
    fill(yearsDriest.list, driest);
    yearsWettest.block.hidden = wettest.length === 0;
    yearsDriest.block.hidden = driest.length === 0;
    status.years.rows = wettest.length + driest.length;
    const partial = status.years.partialRecord;
    yearsNote.textContent = `${placed.length} station${placed.length === 1 ? " is" : "s are"} compared. `
      + (partial > 0 ? `${partial} of them ${partial === 1 ? "has" : "have"} gaps in the record. ` : "")
      + (shown.shortRecord > 0
        ? `${shown.shortRecord} station${shown.shortRecord === 1 ? " has" : "s have"} fewer than 10 past years and ${shown.shortRecord === 1 ? "is" : "are"} not compared.`
        : "");
    drawYearsTable();
  };

  const publish = (): void => {
    status.window = values?.window ?? null;
    if (status.mode === "rain") {
      status.withValue = values?.sites.size ?? 0;
    } else if (status.mode === "years") {
      status.withValue = standing?.sites.size ?? 0;
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
    else if (status.mode === "years" && standing) map.setStandingValues(standing);
    else if (status.mode !== "years" && values) map.setValues(values);
  };

  let requested: PrecipMapMode = options.initialMode ?? "rain";
  const showMode = (): void => {
    const view = precipMapModeView(requested, status.soil.state);
    status.mode = view.mode;
    modeButtons.get("rain")!.setAttribute("aria-pressed", String(view.rainPressed));
    modeButtons.get("soil")!.setAttribute("aria-pressed", String(view.soilPressed));
    modeButtons.get("years")!.setAttribute("aria-pressed", String(view.yearsPressed));
    rain.hidden = !view.rainShown;
    soil.hidden = !view.soilShown;
    years.hidden = !view.yearsShown;
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
  } else if (requested === "years") {
    showMode();
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
        label: "A map of the drainage areas and measurement sites, coloured by recent precipitation, by the change in soil moisture, or by this year against past years",
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
    get status() { return { ...status, soil: { ...status.soil }, years: { ...status.years } }; },
    update(window, totals) {
      values = precipMapValues(window, totals, siteAreas, areaFloors);
      if (totals?.endDate) startWhenNear();
      if (status.mode === "rain") map?.setValues(values);
      drawRainTable();
      publish();
    },
    setHistory(daily, history) {
      if (standing) return;
      standing = precipStandingValues(daily, history, siteAreas);
      drawYears();
      if (status.mode === "years") drawMap();
      publish();
    }
  };
}
