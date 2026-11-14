/*
 * Snow water against earlier seasons (ADR-165), on the snow page. It is the
 * precipitation card's chart, key and table (ADR-125) over the snow history,
 * and it follows the page's place: the page hands it the sites in view.
 *
 * The history is the largest file the page can ask for after a finished
 * season, so it is fetched only when the card nears the screen, with the
 * snow file's deadline. Every exit from loading clears `aria-busy`.
 */
import { loadSnowHistory } from "../data/snow-history";
import { formatInches, medianDifference, ordinal } from "../precip-model";
import { snowHistoryView, type SnowHistoryView } from "../snow-history-model";
import { normalIsComparable, seasonName } from "../snow-model";
import type { PrecipitationHistory, SnowSite } from "../types";
import { formatDate, formatPercent } from "../viz/format";
import {
  HISTORY_REGIONS, renderPrecipitationCurve, type CurveWords, type PrecipitationRange
} from "../viz/precip-curve";

export interface SnowHistoryStatus {
  /** "waiting" until the card nears the screen and the file is asked for. */
  state: "waiting" | "loading" | "ready" | "failed";
  /** Sites every figure is a mean over, and the sites in the place. */
  stations: number;
  placeSites: number;
  /** Earlier seasons in the bands, and their first and last water years. */
  years: number;
  firstWaterYear: number | null;
  lastWaterYear: number | null;
  bandDays: number;
  curveDays: number;
  date: string | null;
  range: PrecipitationRange;
  tableRows: number;
}

export interface SnowHistoryCard {
  /** `sites` are the snow sites in the place shown; `waterYear` the season. */
  update(sites: readonly SnowSite[], waterYear: number, current: boolean): void;
  readonly status: SnowHistoryStatus;
}

const REGION_LABELS: Record<(typeof HISTORY_REGIONS)[number]["className"], string> = {
  "precip-region-driest": "Least snow",
  "precip-region-drier": "Less snow",
  "precip-region-middle": "Middle half of seasons",
  "precip-region-wetter": "More snow",
  "precip-region-wettest": "Most snow"
};

const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

const inches = formatInches;
const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

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

function percentNote(view: SnowHistoryView, normalPeriod: string): string {
  const h = view.headline!;
  const sites = plural(h.normalSites, "site");
  if (h.percentOfNormal !== null) {
    return `${sites} with a normal for ${normalPeriod}: their snow water added up, over their normal added up.`;
  }
  if (h.normalInches === null) return "No site in the set has a normal for this date.";
  if (!normalIsComparable(h.normalInches)) {
    return `The normal for this date is ${inches(h.normalInches)}. That is too little normal snow to compare against.`;
  }
  return `Only ${sites} of the ${view.placeSites} in this place have a value and a normal. ` +
    "A percent needs at least half of them.";
}

function headlineKpis(view: SnowHistoryView, shown: string, normalPeriod: string): HTMLElement[] {
  const h = view.headline!;
  const difference = medianDifference(h);
  return [
    kpi(shown, inches(h.inches), `Mean of ${plural(view.stations.length, "site")} on ${formatDate(h.date)}`, true),
    kpi("Median for this date", inches(h.medianInches), difference.direction === "same"
      ? "The same as the median"
      : `${inches(difference.inches)} ${difference.direction} than the median`),
    kpi("History rank", `${ordinal(h.rank)} highest`,
      `Of ${h.rankedYears} seasons on this date, from ${seasonName(view.firstWaterYear)}`),
    kpi("Of normal at these sites", formatPercent(h.percentOfNormal), percentNote(view, normalPeriod))
  ];
}

function coverageSentence(view: SnowHistoryView): string {
  const parts = [`These figures use the ${plural(view.stations.length, "site")} with a full snow water ` +
    `record from ${seasonName(view.firstWaterYear)}, so every season is measured at the same sites.`];
  if (view.withoutHistory > 0) {
    parts.push(`${plural(view.withoutHistory, "site")} in this place ${view.withoutHistory === 1 ? "has" : "have"} ` +
      `a shorter or broken record and ${view.withoutHistory === 1 ? "is" : "are"} not used.`);
  }
  if (view.late > 0) {
    parts.push(`${plural(view.late, "site")} ${view.late === 1 ? "is" : "are"} not used because of late data.`);
  }
  return parts.join(" ");
}

function monthRows(view: SnowHistoryView): HTMLTableRowElement[] {
  const byDate = new Map(view.current.map((day) => [day.date, day.inches]));
  return view.bands
    .filter((band) => band.date.endsWith("-01") || band === view.bands.at(-1))
    .map((band) => {
      const row = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      name.textContent = `${MONTH_LONG[Number(band.date.slice(5, 7)) - 1]} ${Number(band.date.slice(8))}`;
      const cells = [byDate.get(band.date), band.median, band.low25, band.high75, band.lowest, band.highest]
        .map((value) => {
          const cell = document.createElement("td");
          cell.textContent = value === null || value === undefined ? "—" : value.toFixed(1);
          return cell;
        });
      row.append(name, ...cells);
      return row;
    });
}

export function createSnowHistoryCard(
  section: HTMLElement, onChange: () => void, options: { normalPeriod: string }
): SnowHistoryCard {
  const kpis = document.createElement("div");
  kpis.className = "overview-kpis precip-kpis";
  const legend = document.createElement("div");
  legend.className = "precip-legend";
  const shownSwatch = legendItem("precip-swatch-precip", "This season");
  legend.append(shownSwatch, legendItem("precip-swatch-median", "Median season"));
  const ranges = document.createElement("div");
  ranges.className = "precip-range";
  ranges.setAttribute("role", "group");
  ranges.setAttribute("aria-label", "Days shown on the snow history chart");
  const rangeButtons = new Map<PrecipitationRange, HTMLButtonElement>();
  for (const [value, label] of [["season", "Season so far"], ["year", "Whole season"]] as const) {
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
  const controls = document.createElement("div");
  controls.className = "precip-controls";
  controls.append(ranges, legend);
  const axisTitle = text("p", "chart-axis-title", "");
  const host = document.createElement("div");
  host.className = "snow-curve-host precip-curve-host snow-history-host";
  host.setAttribute("aria-busy", "true");
  host.append(text("p", "chart-empty", "Loading the snow water history."));
  const historyKey = document.createElement("div");
  historyKey.className = "precip-history-key";
  const regions = document.createElement("div");
  regions.className = "precip-legend";
  regions.append(...HISTORY_REGIONS.map((region) =>
    legendItem(`precip-swatch-region ${region.className}`, REGION_LABELS[region.className])));
  const historyNote = text("p", "precip-coverage", "");
  historyKey.append(regions, historyNote);
  const coverage = text("p", "precip-note precip-coverage", "");
  const siteList = document.createElement("details");
  siteList.className = "snow-month-details snow-history-sites";
  const siteSummary = document.createElement("summary");
  const siteNames = text("p", "card-note", "");
  siteList.append(siteSummary, siteNames);
  const details = document.createElement("details");
  details.className = "snow-month-details";
  details.innerHTML = `<summary>Values on the first day of each month</summary>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Snow water history by month table, scrolls sideways"><table class="overview-table"><thead><tr><th>Date</th><th data-snow-history-shown>This season (in)</th><th>Median season (in)</th><th>Middle half from (in)</th><th>Middle half to (in)</th><th>Least snow (in)</th><th>Most snow (in)</th></tr></thead><tbody></tbody></table></div>`;
  const readNote = text("p", "card-note",
    "The chart opens on the season so far. Choose Whole season to see all of it. The bands show the snow water " +
    "the same sites held on each date in earlier seasons. Each earlier season is kept once a week and read on a " +
    "straight line between its weekly values. Point to the chart, or select it and use the arrow keys, to read one day.");
  section.append(kpis, controls, axisTitle, host, historyKey, coverage, siteList, details, readNote);
  const tbody = details.querySelector("tbody")!;
  const shownHeading = details.querySelector<HTMLElement>("[data-snow-history-shown]")!;

  const status: SnowHistoryStatus = {
    state: "waiting", stations: 0, placeSites: 0, years: 0, firstWaterYear: null, lastWaterYear: null,
    bandDays: 0, curveDays: 0, date: null, range: "season", tableRows: 0
  };
  let history: PrecipitationHistory | null = null;
  let wanted: { sites: readonly SnowSite[]; waterYear: number; current: boolean } | null = null;

  const hideFigures = (): void => {
    kpis.replaceChildren();
    controls.hidden = true;
    historyKey.hidden = true;
    axisTitle.textContent = "";
    coverage.textContent = "";
    siteList.hidden = true;
    details.hidden = true;
    tbody.replaceChildren();
  };
  hideFigures();

  const draw = (): void => {
    if (!history || !wanted) return;
    const view = snowHistoryView(wanted.sites, history, wanted.waterYear);
    const shown = wanted.current ? "This season" : `The ${seasonName(wanted.waterYear)} season`;
    Object.assign(status, {
      stations: view.stations.length, placeSites: view.placeSites, years: view.years,
      firstWaterYear: view.firstWaterYear, lastWaterYear: view.lastWaterYear, bandDays: view.bands.length
    });
    if (!view.headline) {
      hideFigures();
      renderPrecipitationCurve(host, [], [], status.range, "");
      host.replaceChildren(text("p", "chart-empty", view.withoutHistory > 0 && view.stations.length === 0
        ? `No site in this place has a full snow water record from ${seasonName(view.firstWaterYear)}. ` +
          "Choose a larger place to compare this season with earlier seasons."
        : "No site in this place has a snow water value to compare yet."));
      Object.assign(status, { curveDays: 0, date: null, tableRows: 0 });
    } else {
      const h = view.headline;
      const first = seasonName(view.firstWaterYear);
      const last = seasonName(view.lastWaterYear);
      kpis.replaceChildren(...headlineKpis(view, shown, options.normalPeriod));
      controls.hidden = false;
      historyKey.hidden = false;
      siteList.hidden = false;
      details.hidden = false;
      shownSwatch.lastChild!.textContent = shown;
      shownHeading.textContent = `${shown} (in)`;
      axisTitle.replaceChildren(document.createTextNode("Snow water equivalent (inches)"),
        text("span", "", `Mean at ${plural(view.stations.length, "site")}`));
      historyNote.textContent = `Earlier seasons: ${first} to ${last}, ${plural(view.years, "season")}. ` +
        "Each colour shows where earlier seasons were on the same date. The edges are not the path of any one season, and they are not a forecast.";
      const words: CurveWords = {
        shown, median: "Median season", middle: "Middle half of seasons",
        extremes: "Least to most snow", after: "Earlier seasons after this date"
      };
      renderPrecipitationCurve(host, view.bands, view.current, status.range,
        `Mean snow water equivalent at ${plural(view.stations.length, "site")}, ` +
        `${status.range === "season" ? "for the season so far" : "for the whole season"}: ` +
        `${inches(h.inches)} on ${formatDate(h.date)}, against a median of ${inches(h.medianInches)} ` +
        `for the date in the seasons ${first} to ${last}. The table below lists the values on the first day of each month.`,
        undefined, words);
      coverage.textContent = coverageSentence(view);
      const names = new Map(wanted.sites.map((site) => [site.station, site.name]));
      siteSummary.textContent = `The ${plural(view.stations.length, "site")} in this comparison`;
      siteNames.textContent = view.stations.map((station) => names.get(station) ?? station)
        .sort((a, b) => a.localeCompare(b)).join(", ") + ".";
      const rows = monthRows(view);
      tbody.replaceChildren(...rows);
      Object.assign(status, {
        curveDays: view.current.filter((day) => day.inches !== null).length, date: h.date, tableRows: rows.length
      });
    }
    host.setAttribute("aria-busy", "false");
    status.state = "ready";
    onChange();
  };

  const load = (): void => {
    status.state = "loading";
    onChange();
    loadSnowHistory().then((loaded) => {
      history = loaded;
      draw();
    }).catch((error: unknown) => {
      console.error("The snow water history could not load:", error);
      status.state = "failed";
      hideFigures();
      host.replaceChildren(text("p", "chart-empty",
        "The snow water history could not load, so this season cannot be compared with earlier seasons. Try again later."));
      host.setAttribute("aria-busy", "false");
      onChange();
    });
  };
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      load();
    }, { rootMargin: "800px 0px" });
    observer.observe(section);
  } else {
    /* After the page has finished building, so the first report it makes
     * can be published. */
    queueMicrotask(load);
  }

  return {
    update(sites, waterYear, current) {
      wanted = { sites, waterYear, current };
      draw();
    },
    get status() { return { ...status }; }
  };
}
