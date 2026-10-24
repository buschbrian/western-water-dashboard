/*
 * The snow page's precipitation card (ADR-122). It fetches its own two files,
 * so a failure here costs this card and never the snow figures above it, and
 * it follows whatever place the page is showing: the page hands it the
 * stations in view and it does the rest.
 *
 * Every exit from loading clears `aria-busy`, the failed one included.
 */
import { loadPrecipitation, loadPrecipitationHistory } from "../data/precip-load";
import { ordinal, precipitationView, type PrecipitationView } from "../precip-model";
import type { PrecipitationHistory, PrecipitationPayload, SnowSite } from "../types";
import { formatDate } from "../viz/format";
import { renderPrecipitationCurve } from "../viz/precip-curve";

export interface PrecipitationStatus {
  state: "loading" | "ready" | "failed";
  /** Stations every figure is a mean over, for the place shown. */
  stations: number;
  /** Days of this year's line drawn. */
  curveDays: number;
  /** History bands drawn, 0 when the place has no station in the set. */
  bandSteps: number;
}

export interface PrecipitationCard {
  update(stations: readonly string[], snowSites: readonly SnowSite[]): void;
  readonly status: PrecipitationStatus;
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
  if (h.snowWaterInches !== null) {
    const notInSnow = Math.max(0, h.inches - h.snowWaterInches);
    kpis.push(kpi("In the snow now", inches(h.snowWaterInches),
      `${inches(notInSnow)} fell and is not in the snow`));
  }
  return kpis;
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
  return view.bands
    .filter((band) => band.date.endsWith("-01") || band.date === view.bands.at(-1)?.date)
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
  section: HTMLElement, onChange: () => void
): PrecipitationCard {
  const kpis = document.createElement("div");
  kpis.className = "overview-kpis precip-kpis";
  const legend = document.createElement("div");
  legend.className = "precip-legend";
  legend.append(
    legendItem("precip-swatch-precip", "Precipitation this year"),
    legendItem("precip-swatch-snow", "Snow water this year"),
    legendItem("precip-swatch-gap", "Fell, not in the snow now"),
    legendItem("precip-swatch-median", "Median year"),
    legendItem("precip-swatch-half", "Middle half of years"),
    legendItem("precip-swatch-eight", "8 of 10 years"),
    legendItem("precip-swatch-range", "Highest to lowest year"));
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
  section.append(kpis, legend, host, april, coverage, details);
  const tbody = details.querySelector("tbody")!;

  const status: PrecipitationStatus = { state: "loading", stations: 0, curveDays: 0, bandSteps: 0 };
  let data: { daily: PrecipitationPayload; history: PrecipitationHistory } | null = null;
  let wanted: { stations: readonly string[]; snowSites: readonly SnowSite[] } | null = null;

  const draw = (): void => {
    if (!data || !wanted) return;
    const view = precipitationView(wanted.stations, data.daily, data.history, wanted.snowSites);
    status.stations = view.stations.length;
    status.bandSteps = view.bands.length;
    if (!view.headline) {
      kpis.replaceChildren();
      legend.hidden = true;
      april.textContent = "";
      coverage.textContent = "";
      tbody.replaceChildren();
      const empty = text("p", "chart-empty", view.withoutHistory > 0
        ? `No station in this place has a full precipitation record from ${view.firstWaterYear}. ` +
          "Choose a larger place to compare this year with history."
        : "No station in this place measures precipitation today.");
      renderPrecipitationCurve(host, [], [], [], "");
      host.replaceChildren(empty);
      status.curveDays = 0;
    } else {
      kpis.replaceChildren(...headlineKpis(view));
      legend.hidden = false;
      const h = view.headline;
      renderPrecipitationCurve(host, view.bands, view.precipitation, view.snowWater,
        `Mean precipitation since 1 October for the place shown: ${inches(h.inches)} on ` +
        `${formatDate(h.date)}, against a median of ${inches(h.medianInches)} for the date in the ` +
        `water years ${view.firstWaterYear} to ${view.lastWaterYear}. Snow water now is ` +
        `${h.snowWaterInches === null ? "not known" : inches(h.snowWaterInches)}. ` +
        "The table below lists the values on the first day of each month.");
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
        host.replaceChildren(text("p", "chart-empty",
          "The precipitation values could not load. The snow figures on this page are not affected."));
        host.setAttribute("aria-busy", "false");
        onChange();
      });
  };
  /* The history is about half a megabyte gzipped, the largest file on the
   * page, so it is fetched when the card comes near the screen rather than
   * by every reader who opens the page for the map. */
  if ("IntersectionObserver" in window) {
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
    update(stations, snowSites) {
      wanted = { stations, snowSites };
      draw();
    },
    get status() { return { ...status }; }
  };
}
