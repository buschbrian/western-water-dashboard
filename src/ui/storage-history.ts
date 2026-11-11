import { loadStorageHistory, type StorageHistory } from "../data/storage-history";
import { downloadCsv } from "../data/download";
import { storageHistoryCsv, storageYears, STORAGE_MONTH_STARTS, type StorageYears } from "../storage-history-model";
import type { Reservoir } from "../types";
import { formatAcreFeet, formatDate } from "../viz/format";
import { renderWaterYears } from "../viz/elevation-years";

export type HistoryState = "waiting" | "loading" | "drawn" | "unavailable";

export function drawStorageYears(host: HTMLElement, chart: StorageYears,
  options: { scale?: number; height?: number } = {}): boolean {
  return renderWaterYears(host, chart, { ...options, tickStep: chart.tickStep,
    formatValue: (value) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value),
    markers: chart.monthly, monthStarts: STORAGE_MONTH_STARTS });
}

function text<K extends keyof HTMLElementTagNameMap>(tag: K, content: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = content;
  return node;
}

function valuesTable(chart: StorageYears): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "trend-details";
  details.append(text("summary", "Values for each water year"));
  const scroll = document.createElement("div");
  scroll.className = "trend-table-scroll";
  const table = document.createElement("table");
  table.className = "trend-table";
  const head = document.createElement("thead");
  const row = document.createElement("tr");
  for (const label of ["Water year", "Highest storage", "Lowest storage", "Last reading"]) {
    const th = text("th", label);
    th.scope = "col";
    row.append(th);
  }
  head.append(row);
  const body = document.createElement("tbody");
  const amount = (value: number): string => `${formatAcreFeet(value)} acre-feet`;
  for (const line of chart.lines) {
    const row = document.createElement("tr");
    const th = text("th", line.label);
    th.scope = "row";
    row.append(th, text("td", amount(line.highest)), text("td", amount(line.lowest)),
      text("td", `${amount(line.last.value)} on ${formatDate(line.last.date)}`));
    body.append(row);
  }
  table.append(head, body);
  scroll.append(table);
  details.append(scroll);
  return details;
}

export function storageYearKey(chart: StorageYears): HTMLUListElement {
  const list = document.createElement("ul");
  list.className = "elevation-key";
  for (const line of chart.lines) {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = `elevation-swatch elevation-swatch-${line.tier}`;
    swatch.setAttribute("aria-hidden", "true");
    item.append(swatch, line.label);
    list.append(item);
  }
  return list;
}

export function storageHistorySection(reservoir: Reservoir,
  changed: (state: HistoryState) => void): { element: HTMLElement; mount: () => void } {
  const section = document.createElement("section");
  section.className = "reservoir-storage-history";
  section.id = "reservoir-storage-history";
  const heading = text("h2", "Storage by water year");
  heading.className = "reservoir-subhead";
  section.append(heading, text("p", "Water stored, in acre-feet. Each water year starts on October 1. "
    + "This year is shown with up to five earlier years. Gaps have no reading."));
  const content = document.createElement("div");
  content.append(text("p", "The storage history loads when this chart comes near the screen."));
  section.append(content);
  changed("waiting");
  const load = async (): Promise<void> => {
    changed("loading");
    content.setAttribute("aria-busy", "true");
    try {
      const history: StorageHistory | null = await loadStorageHistory(reservoir.source_station_id);
      const chart = history ? storageYears(history, reservoir.as_of) : null;
      if (!history || !chart) {
        content.replaceChildren(text("p", "A storage history for these water years has not been published for this reservoir."));
        changed("unavailable");
        return;
      }
      const host = document.createElement("div");
      host.id = "reservoir-storage-chart";
      host.className = "elevation-chart-host";
      content.replaceChildren(host);
      drawStorageYears(host, chart);
      content.append(storageYearKey(chart), valuesTable(chart));
      if (chart.monthly) content.append(text("p", "This source reports monthly. Each dot is one reading; the days between readings are empty."));
      const source = text("a", "Storage history source");
      source.href = history.source_url;
      const button = text("button", "Download the full storage record (CSV)");
      button.type = "button";
      button.className = "reservoir-export";
      button.addEventListener("click", () => downloadCsv(storageHistoryCsv(history), "reservoir-storage-history.csv"));
      content.append(text("p", `Record available from ${formatDate(history.start)} to ${formatDate(history.end)}.`), source, button);
      changed("drawn");
    } catch (error) {
      console.warn("Storage history could not load:", error);
      content.replaceChildren(text("p", "The storage history could not be loaded just now. The current figures and monthly chart are still above."));
      changed("unavailable");
    } finally {
      content.setAttribute("aria-busy", "false");
    }
  };
  return { element: section, mount: () => {
    if (!("IntersectionObserver" in window)) { void load(); return; }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void load();
    }, { rootMargin: "600px 0px" });
    observer.observe(section);
  } };
}
