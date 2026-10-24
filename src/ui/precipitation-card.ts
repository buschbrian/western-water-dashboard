/*
 * The snow page's precipitation card (ADR-125). It fetches its own two files,
 * so a failure here costs this card and never the snow figures above it, and
 * it follows whatever place the page is showing: the page hands it the
 * stations in view and it does the rest.
 *
 * Every exit from loading clears `aria-busy`, the failed one included.
 */
import { loadPrecipitation, loadPrecipitationHistory } from "../data/precip-load";
import { ordinal, precipitationView, type PrecipitationView } from "../precip-model";
import {
  firstAvailableEnd, STORM_WINDOWS, stormTotals, type StormTotals, type StormWindow, type StormWindowTotal
} from "../precip-storm-model";
import type { PrecipitationHistory, PrecipitationPayload, SnowSite } from "../types";
import { formatDate } from "../viz/format";
import { renderPrecipitationStrip } from "../viz/precip-strip";
import {
  HISTORY_REGIONS, PRECIPITATION_CHART_HEIGHT, renderPrecipitationCurve, shortDate, type PrecipitationRange
} from "../viz/precip-curve";

export interface PrecipitationStatus {
  state: "loading" | "ready" | "failed";
  /** Stations every figure is a mean over, for the place shown. */
  stations: number;
  /** Days of this year's line drawn. */
  curveDays: number;
  /** Days of history bands drawn, 0 when the place has no station in the set. */
  bandDays: number;
  /** The window the chart shows: the season so far, or the whole year. */
  range: PrecipitationRange;
  /** The headline's date, or null before one is drawn. */
  date: string | null;
  /** Past water years drawn as dots on the strip, 0 when it is hidden. */
  stripYears: number;
  /** The recent totals (ADR-129), for the window the station list shows. */
  storm: StormStatus;
}

export interface StormStatus {
  window: StormWindow;
  /** The day every window ends on, or null with no station reporting. */
  endDate: string | null;
  available: boolean;
  /** Stations the window's mean is taken over. */
  stations: number;
  /** Stations in the place with no value on both days, or a falling total. */
  leftOut: number;
  /** Rows in the station list. */
  rows: number;
}

export interface PrecipitationCardOptions {
  /** `strip` builds only "Where this year stands": its title, the dots and
   * its note. The model, the figures and the rules are the same. */
  parts?: "card" | "strip";
  /** The card is the page's only subject (a story view, ADR-128): it loads
   * at once rather than when it nears the screen, and a failure does not
   * point at other figures on the page. */
  standalone?: boolean;
  /** Called when a reader selects a station in the recent totals' list. */
  onSelectSite?: (station: string) => void;
}

export interface PrecipitationCard {
  /** `finishedSeason` names the season on screen when it is not the current
   * one; the card holds only the current water year, so it says so then. */
  update(stations: readonly string[], snowSites: readonly SnowSite[], finishedSeason?: string | null): void;
  readonly status: PrecipitationStatus;
  /** The card's blocks by name, for a page that has to fit them into a
   * fixed frame (a story view, ADR-128). The elements stay the same for the
   * life of the card; their contents are redrawn. */
  readonly parts: PrecipitationCardParts;
  /** Redraw the chart at this height in pixels, and keep it for later
   * draws. The card's own default is the chart's full height. */
  setChartHeight(height: number): void;
}

export interface PrecipitationCardParts {
  top: HTMLElement;
  kpis: HTMLElement;
  split: HTMLElement;
  strip: HTMLElement;
  stripNote: HTMLElement;
  stripKey: HTMLElement | null;
  controls: HTMLElement;
  axisTitle: HTMLElement;
  chart: HTMLElement;
  historyKey: HTMLElement;
  april: HTMLElement;
  coverage: HTMLElement;
  table: HTMLElement;
  readNote: HTMLElement;
}

const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

function inches(value: number): string {
  return `${value.toFixed(1)} in`;
}

function text(tag: string, className: string, content: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = content;
  return node;
}

function kpi(label: string, value: string, note: string, primary = false): HTMLElement {
  const card = document.createElement("article");
  card.className = primary ? "overview-kpi overview-kpi-primary" : "overview-kpi";
  card.append(text("span", "", label), text("strong", "", value), text("small", "", note));
  return card;
}

function legendItem(swatchClass: string, label: string): HTMLElement {
  const item = document.createElement("span");
  item.className = "precip-legend-item";
  const swatch = document.createElement("span");
  swatch.className = `precip-swatch ${swatchClass}`;
  swatch.setAttribute("aria-hidden", "true");
  item.append(swatch, document.createTextNode(label));
  return item;
}

const STORM_ROWS = 8;

function stationCount(count: number): string {
  return `${count} station${count === 1 ? "" : "s"}`;
}

function windowName(days: StormWindow): string {
  return days === 1 ? "Last 1 day" : `Last ${days} days`;
}

/** A mean under a tenth is not zero when some station caught a tip. */
function stormInches(total: StormWindowTotal): string {
  if (total.meanInches === null) return "—";
  if (total.meanInches === 0 && total.totals.some((station) => station.inches > 0)) return "Less than 0.1 in";
  return inches(total.meanInches);
}

function stormKpis(storm: StormTotals, daily: PrecipitationPayload): HTMLElement[] {
  return storm.windows.map((total) => {
    if (!total.available) {
      const from = firstAvailableEnd(daily, total.days);
      return kpi(windowName(total.days), "—",
        from ? `Not available until ${formatDate(from)}` : "Not available yet");
    }
    return kpi(windowName(total.days), stormInches(total),
      total.meanInches === null ? "No station measured both days" : `Mean of ${stationCount(total.totals.length)}`);
  });
}

function stormLeftOut(total: StormWindowTotal): string {
  const parts: string[] = [];
  if (total.withoutValue > 0) {
    parts.push(`${stationCount(total.withoutValue)} without a value on both days ${total.withoutValue === 1 ? "is" : "are"} not used.`);
  }
  if (total.falling > 0) {
    parts.push(`${stationCount(total.falling)} ${total.falling === 1 ? "shows" : "show"} a fall in the gauge total and ${total.falling === 1 ? "is" : "are"} not used. ` +
      "A fall comes from a gauge reset, a correction or evaporation, so it is not a measurement of precipitation.");
  }
  return parts.join(" ");
}

function headlineKpis(view: PrecipitationView): HTMLElement[] {
  const h = view.headline!;
  const difference = h.inches - h.medianInches;
  const differenceText = Math.abs(difference) < 0.05
    ? "The same as the median"
    : `${inches(Math.abs(difference))} ${difference > 0 ? "more" : "less"} than the median`;
  const percent = h.percentOfMedian === null ? "" : ` · ${h.percentOfMedian}% of the median`;
  const kpis = [
    kpi("Since 1 October", inches(h.inches),
      `Mean of ${view.stations.length} station${view.stations.length === 1 ? "" : "s"} to ${formatDate(h.date)}`, true),
    kpi("Median for this date", inches(h.medianInches), `${differenceText}${percent}`),
    kpi("History rank", `${ordinal(h.rank)} highest`,
      `Of ${h.rankedYears} water years, ${view.firstWaterYear} to this year`),
    kpi("Of a median year", h.shareOfMedianYear === null ? "—" : `${h.shareOfMedianYear}%`,
      `A median year brings ${inches(h.medianYearInches)}`)
  ];
  return kpis;
}

/**
 * The same stations' snow water on the headline's day, as a small fact block
 * beside the figures rather than a line on the precipitation axis: two
 * measurements on one axis read as two kinds of precipitation. It says only
 * what the two values show. The difference is not measured rain or melt --
 * wind, gauge catch and sublimation sit in it too -- so it is not named as
 * either.
 */
function snowSplit(view: PrecipitationView): HTMLElement | null {
  const reading = view.snow;
  if (!reading || reading.precipitationInches <= 0) return null;
  const h = { inches: reading.precipitationInches };
  const block = document.createElement("div");
  block.className = "precip-split";
  const snow = reading.snowInches;
  block.append(text("p", "precip-split-title", `Snow water on ${shortDate(reading.date)}: ${inches(snow)}`));
  if (snow > h.inches) {
    block.append(text("p", "precip-split-note",
      `That is more than the ${inches(h.inches)} the gauges caught by then. ` +
      "A gauge catches less snow than falls, most of all in wind."));
    return block;
  }
  const rest = h.inches - snow;
  if (snow > 0) {
    const bar = document.createElement("div");
    bar.className = "precip-split-bar";
    bar.setAttribute("role", "img");
    bar.setAttribute("aria-label",
      `Of ${inches(h.inches)} caught by the gauges, ${inches(snow)} is in the snow now.`);
    const snowPart = document.createElement("span");
    snowPart.className = "precip-split-snow";
    snowPart.style.inlineSize = `${(snow / h.inches) * 100}%`;
    const restPart = document.createElement("span");
    restPart.className = "precip-split-rest";
    restPart.style.inlineSize = `${(rest / h.inches) * 100}%`;
    bar.append(...[snowPart, restPart].filter((_, index) => (index === 0 ? snow : rest) > 0));
    block.append(bar);
  }
  block.append(text("p", "precip-split-note", (snow === 0
    ? `By then the gauges had caught ${inches(h.inches)}, and none of it is in the snow. `
    : `By then the gauges had caught ${inches(h.inches)}, ${inches(rest)} more than the snow holds. `)
    + "These values do not show where that water went."));
  return block;
}

function april1Sentence(view: PrecipitationView): string | null {
  const target = view.headline?.toApril1;
  if (!target) return null;
  return `To reach the median for 1 April (${inches(target.medianInches)}), ` +
    `${inches(target.neededInches)} more must fall. In a median year, ` +
    `${inches(target.medianGainInches)} falls between this date and 1 April.`;
}

function coverageSentence(view: PrecipitationView): string {
  const parts = [`These figures use the ${view.stations.length} ` +
    `station${view.stations.length === 1 ? "" : "s"} with a full record from ` +
    `${view.firstWaterYear}, so every year is measured at the same stations.`];
  if (view.withoutHistory > 0) {
    parts.push(`${view.withoutHistory} station${view.withoutHistory === 1 ? " has" : "s have"} a shorter or broken record and ${view.withoutHistory === 1 ? "is" : "are"} not used.`);
  }
  if (view.late > 0) {
    parts.push(`${view.late} station${view.late === 1 ? " is" : "s are"} not used because of late data.`);
  }
  return parts.join(" ");
}

function monthRows(view: PrecipitationView): HTMLTableRowElement[] {
  const byDate = new Map(view.precipitation.map((day) => [day.date, day.inches]));
  const snowByDate = new Map(view.snowWater.map((day) => [day.date, day.inches]));
  /* The first of every month, and the year's last day. The bands are daily,
   * so each row is a day the model computed rather than a weekly step. */
  return view.bands
    .filter((band) => band.date.endsWith("-01") || band === view.bands.at(-1))
    .map((band) => {
      const row = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = `${MONTH_LONG[Number(band.date.slice(5, 7)) - 1]} ${Number(band.date.slice(8))}`;
      const cells = [
        byDate.get(band.date), snowByDate.get(band.date), band.median,
        band.low25, band.high75, band.lowest, band.highest
      ].map((value) => {
        const cell = document.createElement("td");
        cell.textContent = value === null || value === undefined ? "—" : value.toFixed(1);
        return cell;
      });
      row.append(name, ...cells);
      return row;
    });
}

export function createPrecipitationCard(
  section: HTMLElement, onChange: () => void, options: PrecipitationCardOptions = {}
): PrecipitationCard {
  const stripOnly = options.parts === "strip";
  /* The recent totals (ADR-129) lead the full card: the question most
   * readers bring after a storm. They need no history, so they can draw for
   * a place the rest of the card cannot speak for. A story view (ADR-128)
   * shows the season figure alone and leaves them out. */
  const withStorm = !stripOnly && !options.standalone;
  const storm = document.createElement("div");
  storm.className = "precip-storm";
  storm.hidden = true;
  const stormTitle = text("h3", "precip-storm-title", "Recent precipitation");
  const stormKpiRow = document.createElement("div");
  stormKpiRow.className = "overview-kpis precip-storm-kpis";
  const stormEnd = text("p", "precip-coverage", "");
  const stormListHead = document.createElement("div");
  stormListHead.className = "precip-storm-head";
  const stormListTitle = text("p", "chart-axis-title", "");
  const stormWindows = document.createElement("div");
  stormWindows.className = "precip-range";
  stormWindows.setAttribute("role", "group");
  stormWindows.setAttribute("aria-label", "Days in the station list");
  const windowButtons = new Map<StormWindow, HTMLButtonElement>();
  for (const days of STORM_WINDOWS) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = days === 1 ? "1 day" : `${days} days`;
    button.setAttribute("aria-pressed", String(days === 3));
    button.addEventListener("click", () => {
      if (status.storm.window === days) return;
      status.storm.window = days;
      for (const [key, other] of windowButtons) other.setAttribute("aria-pressed", String(key === days));
      drawStorm();
      onChange();
    });
    windowButtons.set(days, button);
    stormWindows.append(button);
  }
  stormListHead.append(stormListTitle, stormWindows);
  const stormList = document.createElement("ol");
  stormList.className = "precip-storm-list";
  const stormEmpty = text("p", "precip-note", "");
  const stormNote = text("p", "precip-coverage", "");
  storm.append(stormTitle, stormKpiRow, stormEnd, stormListHead, stormList, stormEmpty, stormNote);
  const kpis = document.createElement("div");
  kpis.className = "overview-kpis precip-kpis";
  const legend = document.createElement("div");
  legend.className = "precip-legend";
  legend.append(
    legendItem("precip-swatch-precip", "This year"),
    legendItem("precip-swatch-median", "Median year"));
  /* The history key goes under the chart, in the order the regions stack,
   * with one sentence that says what a region is and is not. */
  const historyKey = document.createElement("div");
  historyKey.className = "precip-history-key";
  const regions = document.createElement("div");
  regions.className = "precip-legend";
  regions.append(...HISTORY_REGIONS.map((region) => legendItem(`precip-swatch-region ${region.className}`, region.label)));
  const historyNote = text("p", "precip-coverage", "");
  historyKey.append(regions, historyNote);
  const axisTitle = document.createElement("p");
  axisTitle.className = "chart-axis-title";
  const split = document.createElement("div");
  /* Two plain toggle buttons rather than a component: one choice, two
   * answers, and `aria-pressed` says which is on. */
  const ranges = document.createElement("div");
  ranges.className = "precip-range";
  ranges.setAttribute("role", "group");
  ranges.setAttribute("aria-label", "Days shown on the chart");
  const rangeButtons = new Map<PrecipitationRange, HTMLButtonElement>();
  for (const [value, label] of [["season", "Season so far"], ["year", "Whole water year"]] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-pressed", String(value === "season"));
    button.addEventListener("click", () => {
      if (status.range === value) return;
      status.range = value;
      for (const [key, other] of rangeButtons) other.setAttribute("aria-pressed", String(key === value));
      draw();
    });
    rangeButtons.set(value, button);
    ranges.append(button);
  }
  const host = document.createElement("div");
  host.className = "snow-curve-host precip-curve-host";
  host.setAttribute("aria-busy", "true");
  const message = text("p", "chart-empty", "Loading precipitation.");
  host.append(message);
  const april = text("p", "precip-note", "");
  const coverage = text("p", "precip-note precip-coverage", "");
  const details = document.createElement("details");
  details.className = "snow-month-details";
  details.innerHTML = `<summary>Values on the first day of each month</summary>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Precipitation by month table, scrolls sideways"><table class="overview-table"><thead><tr><th>Date</th><th>Precipitation (in)</th><th>Snow water (in)</th><th>Median year (in)</th><th>Middle half from (in)</th><th>Middle half to (in)</th><th>Lowest year (in)</th><th>Highest year (in)</th></tr></thead><tbody></tbody></table></div>`;
  const controls = document.createElement("div");
  controls.className = "precip-controls";
  controls.append(ranges, legend);
  const top = document.createElement("div");
  top.className = "precip-top";
  top.append(kpis, split);
  /* Where this year stands among every past year on the same date: the
   * history rank, drawn. */
  const strip = document.createElement("div");
  strip.className = "precip-strip-block";
  const stripTitle = text("p", "chart-axis-title", "");
  const stripHost = document.createElement("div");
  stripHost.className = "precip-strip-host";
  const stripNote = text("p", "precip-coverage", "");
  strip.append(stripTitle, stripHost, stripNote);
  strip.hidden = true;
  const readNote = text("p", "card-note",
    "The chart opens on the season so far. Choose Whole water year to see all of it. The bands show what the same sites measured by each date in earlier water years. " +
    "Point to the chart, or select it and use the arrow keys, to read one day.");
  /* Alone, the strip has no chart below it to share a key with, so it
   * carries the key itself. */
  const stripKey = stripOnly ? document.createElement("div") : null;
  if (stripKey) {
    stripKey.className = "precip-legend";
    stripKey.append(...HISTORY_REGIONS.map((region) => legendItem(`precip-swatch-region ${region.className}`, region.label)));
    strip.append(stripKey);
  }
  if (stripOnly) section.append(strip, host);
  else section.append(...(withStorm ? [storm] : []), top, strip, controls, axisTitle, host, historyKey, april, coverage, details, readNote);
  /* The card's credit line stays last, under everything this card adds. */
  const source = section.querySelector(":scope > .card-source");
  if (source) section.append(source);
  const tbody = details.querySelector("tbody")!;

  const status: PrecipitationStatus = {
    state: "loading", stations: 0, curveDays: 0, bandDays: 0, range: "season",
    date: null, stripYears: 0,
    storm: { window: 3, endDate: null, available: false, stations: 0, leftOut: 0, rows: 0 }
  };
  let chartHeight = PRECIPITATION_CHART_HEIGHT;
  /* The last chart drawn, kept so a new height redraws the chart alone and
   * leaves the figures above it as they are. */
  let curve: (() => void) | null = null;
  let data: { daily: PrecipitationPayload; history: PrecipitationHistory } | null = null;
  let wanted: {
    stations: readonly string[]; snowSites: readonly SnowSite[]; finishedSeason: string | null;
  } | null = null;

  let stormView: StormTotals | null = null;

  const drawStorm = (): void => {
    const totals = stormView;
    const shown = totals?.windows.find((total) => total.days === status.storm.window);
    status.storm.endDate = totals?.endDate ?? null;
    if (!totals || !data || totals.endDate === null || !shown) {
      storm.hidden = true;
      Object.assign(status.storm, { available: false, stations: 0, leftOut: 0, rows: 0 });
      return;
    }
    stormKpiRow.replaceChildren(...stormKpis(totals, data.daily));
    stormEnd.textContent = `The totals end on ${formatDate(totals.endDate)}. ` +
      "Each value is a mean of the stations that measured both days.";
    stormListTitle.textContent = `Most precipitation, ${windowName(shown.days).toLowerCase()}`;
    const rows = shown.totals.filter((total) => total.inches > 0).slice(0, STORM_ROWS);
    const sites = new Map((wanted?.snowSites ?? []).map((site) => [site.station, site]));
    const onSelectSite = options.onSelectSite;
    stormList.replaceChildren(...rows.map((total, index) => {
      const site = sites.get(total.station);
      const name = site?.name ?? total.station;
      const item = document.createElement("li");
      const rank = text("span", "precip-storm-rank", `${index + 1}`);
      rank.setAttribute("aria-hidden", "true");
      const label = document.createElement(onSelectSite ? "button" : "span");
      label.className = "precip-storm-name";
      label.textContent = name;
      if (label instanceof HTMLButtonElement) {
        label.type = "button";
        label.setAttribute("aria-label", `Show the season for ${name}`);
        label.addEventListener("click", () => onSelectSite?.(total.station));
      }
      const where = text("span", "precip-storm-area", site?.huc6_name ?? "");
      item.append(rank, label, where, text("strong", "precip-storm-value", inches(total.inches)));
      return item;
    }));
    stormList.hidden = rows.length === 0;
    stormEmpty.textContent = !shown.available
      ? `A ${shown.days}-day total would start before 1 October, so there is no value yet.`
      : rows.length === 0
        ? `No station in this place measured precipitation in the ${windowName(shown.days).toLowerCase()}.`
        : "";
    stormEmpty.hidden = stormEmpty.textContent === "";
    stormNote.textContent = [stormLeftOut(shown),
      "0.1 in is the smallest step a gauge measures."].filter(Boolean).join(" ");
    storm.hidden = false;
    Object.assign(status.storm, {
      available: shown.available,
      stations: shown.totals.length,
      leftOut: shown.withoutValue + shown.falling,
      rows: rows.length
    });
  };

  const draw = (): void => {
    if (wanted?.finishedSeason) {
      /* A finished snow season (ADR-121) is on screen. This card has only the
       * current water year, and two years side by side on one page would
       * read as one. */
      kpis.replaceChildren();
      strip.hidden = true;
      split.replaceChildren();
      legend.hidden = true;
      ranges.hidden = true;
      historyKey.hidden = true;
      axisTitle.textContent = "";
      april.textContent = "";
      coverage.textContent = "";
      tbody.replaceChildren();
      stormView = null;
      drawStorm();
      renderPrecipitationCurve(host, [], [], status.range, "");
      host.replaceChildren(text("p", "chart-empty",
        `This card shows the current water year only. The page shows the ${wanted.finishedSeason} snow season. ` +
        "Choose this season above to see its precipitation."));
      host.setAttribute("aria-busy", "false");
      status.stations = 0;
      status.curveDays = 0;
      status.bandDays = 0;
      status.date = null;
      status.stripYears = 0;
      status.state = "ready";
      onChange();
      return;
    }
    if (!data || !wanted) return;
    const view = precipitationView(wanted.stations, data.daily, data.history, wanted.snowSites);
    stormView = withStorm ? stormTotals(wanted.stations, data.daily) : null;
    drawStorm();
    status.stations = view.stations.length;
    status.bandDays = view.bands.length;
    if (!view.headline) {
      kpis.replaceChildren();
      strip.hidden = true;
      split.replaceChildren();
      legend.hidden = true;
      ranges.hidden = true;
      historyKey.hidden = true;
      axisTitle.textContent = "";
      april.textContent = "";
      coverage.textContent = "";
      tbody.replaceChildren();
      const empty = text("p", "chart-empty", view.withoutHistory > 0
        ? `No station in this place has a full precipitation record from ${view.firstWaterYear}. ` +
          "Choose a larger place to compare this year with history."
        : "No station in this place measures precipitation today.");
      renderPrecipitationCurve(host, [], [], status.range, "");
      host.replaceChildren(empty);
      host.hidden = false;
      status.curveDays = 0;
      status.date = null;
      status.stripYears = 0;
    } else {
      kpis.replaceChildren(...headlineKpis(view));
      const stripBand = view.bands.find((band) => band.date === view.headline!.date);
      if (stripBand && view.headline!.yearsOnDate.length > 0) {
        const headline = view.headline!;
        /* Shown before it is drawn, so it is drawn at its own width rather
         * than the fallback width of a hidden box. */
        strip.hidden = false;
        stripTitle.textContent = `Where this year stands on ${shortDate(headline.date)}`;
        renderPrecipitationStrip(stripHost, headline.yearsOnDate, headline.inches, stripBand,
          `Each dot is one water year from ${view.firstWaterYear} to ${view.lastWaterYear} on ${shortDate(headline.date)}. ` +
          `This year has ${inches(headline.inches)}, the ${ordinal(headline.rank)} highest of ${headline.rankedYears}.`);
        stripNote.textContent = "Each dot is one past water year, at the same stations on the same date. " +
          (stripOnly ? "Its colour is the history region it falls in, as the key shows."
            : "Its colour is the history region it falls in on the chart below.");
        strip.hidden = false;
        status.stripYears = headline.yearsOnDate.length;
      } else {
        strip.hidden = true;
        status.stripYears = 0;
      }
      status.date = view.headline.date;
      const splitBlock = snowSplit(view);
      split.replaceChildren(...(splitBlock ? [splitBlock] : []));
      legend.hidden = false;
      ranges.hidden = false;
      historyKey.hidden = false;
      const stationCount = `${view.stations.length} station${view.stations.length === 1 ? "" : "s"}`;
      axisTitle.replaceChildren(
        document.createTextNode("Precipitation since 1 October (inches)"),
        text("span", "", `Mean at ${stationCount}`));
      historyNote.textContent = `History: water years ${view.firstWaterYear} to ${view.lastWaterYear}. ` +
        "Each colour shows where past years were on the same date. The edges are not the path of any one year, and they are not a forecast.";
      const h = view.headline;
      if (stripOnly) {
        /* Nothing else is built in this layout; the host stays only to say
         * so when the strip has no date to stand on. */
        host.replaceChildren(...(strip.hidden ? [text("p", "chart-empty",
          "The history for this date is not available for this place.")] : []));
        host.hidden = !strip.hidden;
        curve = null;
      } else {
        curve = () => renderPrecipitationCurve(host, view.bands, view.precipitation, status.range,
          `Mean precipitation since 1 October for the place shown, ` +
          `${status.range === "season" ? "for the season so far" : "for the whole water year"}: ` +
          `${inches(h.inches)} on ${formatDate(h.date)}, against a median of ${inches(h.medianInches)} ` +
          `for the date in the water years ${view.firstWaterYear} to ${view.lastWaterYear}. ` +
          (stripOnly || !options.standalone
            ? "The table below lists the values on the first day of each month."
            : "The full page lists the values on the first day of each month."),
          chartHeight);
        curve();
      }
      status.curveDays = view.precipitation.filter((day) => day.inches !== null).length;
      april.textContent = april1Sentence(view) ?? "";
      april.hidden = april.textContent === "";
      coverage.textContent = coverageSentence(view);
      tbody.replaceChildren(...monthRows(view));
    }
    host.setAttribute("aria-busy", "false");
    status.state = "ready";
    onChange();
  };

  const load = (): void => {
    Promise.all([loadPrecipitation(), loadPrecipitationHistory()])
      .then(([daily, history]) => {
        data = { daily, history };
        draw();
      })
      .catch((error: unknown) => {
        console.error("Precipitation could not load:", error);
        status.state = "failed";
        legend.hidden = true;
        ranges.hidden = true;
        host.replaceChildren(text("p", "chart-empty", options.standalone
          ? "The precipitation values could not load."
          : "The precipitation values could not load. The snow figures on this page are not affected."));
        host.hidden = false;
        host.setAttribute("aria-busy", "false");
        onChange();
      });
  };
  /* The history is about half a megabyte gzipped, the largest file on the
   * page, so it is fetched when the card comes near the screen rather than
   * by every reader who opens the page for the map. */
  if (!options.standalone && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      load();
    }, { rootMargin: "800px 0px" });
    observer.observe(section);
  } else {
    load();
  }

  return {
    update(stations, snowSites, finishedSeason = null) {
      wanted = { stations, snowSites, finishedSeason };
      draw();
    },
    get status() { return { ...status, storm: { ...status.storm } }; },
    parts: {
      top, kpis, split, strip, stripNote, stripKey, controls, axisTitle, chart: host,
      historyKey, april, coverage, table: details, readNote
    },
    setChartHeight(height) {
      if (height === chartHeight) return;
      chartHeight = height;
      curve?.();
    }
  };
}
