/*
 * The river-flow page (ADR-136): a static shell, the runtime `rivers.json`,
 * nothing generated (ADR-002).
 *
 * One article per published gauge, each standing alone: no figure on this
 * page adds two gauges together. A withdrawn gauge is stated, not measured
 * (ADR-056). The words are the model's; this file is the sequence.
 */
import "@esri/calcite-components/main.css";
import { setAssetPath as setCalciteAssetPath } from "@esri/calcite-components";

import { downloadCsv } from "./data/download";
import { loadRivers } from "./data/load";
import { describeGauge, riversCsv, riversCsvFilename, withdrawnSentence } from "./rivers-model";
import type { RiverRow } from "./rivers-model";
import type { RiverGauge, RiverPayload } from "./types";
import { setupPlaceChooser } from "./ui/opening-splash";
import { setupPlaceSearch } from "./ui/place-search";
import { riversTemplate } from "./ui/rivers-template";
import { wireTheme } from "./ui/theme";
import { renderFlowChart, renderFlowTable } from "./viz/flow-chart";
import "./styles/rivers.css";

setCalciteAssetPath(new URL(/* @vite-ignore */ "../", import.meta.url).href);
const root = document.querySelector<HTMLElement>("#rivers-app");
if (!root) throw new Error("Missing #rivers-app root");

root.innerHTML = riversTemplate(window.location.search);
wireTheme();
void setupPlaceChooser();
setupPlaceSearch("rivers");

const main = root.querySelector<HTMLElement>("#rivers-main");
const list = root.querySelector<HTMLElement>("#rivers-list");
if (!main || !list) throw new Error("Missing #rivers-main");

function finish(gauges: number, rendered: number, charts: number, withdrawn: number,
  failed = false): void {
  main!.setAttribute("aria-busy", "false");
  window.__riversReady = { gauges, rendered, charts, withdrawn, failed };
}

function note(text: string, className = "reservoir-note"): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
}

function heading(level: "h2" | "h3", text: string, className: string): HTMLHeadingElement {
  const element = document.createElement(level);
  element.className = className;
  element.textContent = text;
  return element;
}

function definitionList(rows: readonly RiverRow[]): HTMLDListElement {
  const dl = document.createElement("dl");
  dl.className = "detail-rows";
  for (const row of rows) {
    const term = document.createElement("dt");
    term.textContent = row.label;
    const definition = document.createElement("dd");
    definition.textContent = row.value;
    dl.append(term, definition);
  }
  return dl;
}

function renderGauge(gauge: RiverGauge): { article: HTMLElement; chart: boolean } {
  const view = describeGauge(gauge);
  const article = document.createElement("article");
  article.className = "river";
  article.dataset.station = gauge.source_station_id;
  article.append(heading("h2", view.name, "river-name"));
  if (view.where) article.append(note(view.where));
  article.append(note(view.shaped, "reservoir-note river-shaped"));
  if (view.late) article.append(note(view.late, "detail-late"));

  const reading = document.createElement("section");
  reading.className = "river-reading";
  reading.setAttribute("aria-label", `Flow at ${view.name}`);
  const headline = document.createElement("p");
  headline.className = "detail-headline";
  const value = document.createElement("strong");
  value.textContent = view.headline;
  const basis = document.createElement("span");
  basis.textContent = view.basis;
  headline.append(value, basis);
  reading.append(headline, note(view.status, "reservoir-note river-status"),
    definitionList(view.rows));
  article.append(reading);

  article.append(heading("h3", "Flow in the last 30 days", "reservoir-subhead"));
  const chartHost = document.createElement("div");
  chartHost.className = "trend-chart-host";
  const chart = renderFlowChart(chartHost, view.days, view.name);
  if (chart) article.append(chartHost);
  article.append(renderFlowTable(view.days));

  article.append(heading("h3", "Source", "reservoir-subhead"), definitionList(view.source));
  const links = document.createElement("p");
  links.className = "reservoir-links";
  const link = document.createElement("a");
  link.href = view.pageUrl;
  link.rel = "noopener";
  link.textContent = "Open this gauge's page at the U.S. Geological Survey";
  links.append(link);
  article.append(links);
  return { article, chart };
}

function render(payload: RiverPayload): void {
  const children: HTMLElement[] = [];
  let charts = 0;
  for (const gauge of payload.gauges) {
    const { article, chart } = renderGauge(gauge);
    if (chart) charts += 1;
    children.push(article);
  }
  for (const notice of payload.withdrawn) {
    const article = document.createElement("article");
    article.className = "river";
    article.append(heading("h2", notice.name, "river-name"),
      note(withdrawnSentence(notice), "reservoir-withdrawn"));
    article.append(note("If readings start again, the gauge comes back."));
    children.push(article);
  }
  if (children.length === 0) children.push(note("No river gauge is published yet."));
  if (payload.gauges.length > 0) {
    const exportButton = document.createElement("calcite-button");
    exportButton.className = "detail-export";
    exportButton.setAttribute("appearance", "outline");
    exportButton.setAttribute("icon-start", "export");
    exportButton.textContent = "Download the daily flows (CSV file)";
    exportButton.addEventListener("click", () => downloadCsv(
      riversCsv(payload), riversCsvFilename(payload.run_date)));
    children.push(exportButton);
  }
  list!.replaceChildren(...children);
  finish(payload.gauge_count, payload.gauges.length, charts, payload.withdrawn.length);
}

async function run(): Promise<void> {
  try {
    render(await loadRivers());
  } catch (error) {
    console.error("The published river data could not be read:", error);
    list!.replaceChildren(note("The published river data could not be read just now, so "
      + "this page has nothing to show. It is worth reloading later.", "reservoir-error"));
    finish(0, 0, 0, 0, true);
  }
}

void run();
