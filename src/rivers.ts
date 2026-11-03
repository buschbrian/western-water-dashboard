/*
 * The river-flow page (ADR-136, ADR-144, ADR-145): a static shell, the runtime
 * `rivers.json`, nothing generated (ADR-002).
 *
 * A summary table first, one row per gauge linking to its card, then one
 * article per published gauge in two groups: natural gauges compared with
 * normal, then shaped gauges shown as flow alone. Each card stands alone: no
 * figure on this page adds two gauges together. A withdrawn gauge is stated,
 * not measured (ADR-056). The words are the model's; this file is the
 * sequence.
 */
import "@esri/calcite-components/main.css";
import { setAssetPath as setCalciteAssetPath } from "@esri/calcite-components";

import { stateName } from "./data/state-vocabulary";
import { downloadCsv } from "./data/download";
import { loadRivers } from "./data/load";
import {
  FLOW_UNIT, NATURAL_GROUP_HEADING, SHAPED_GROUP_HEADING, describeGauge, gaugeAnchor, groupGauges,
  riversCsv, riversCsvFilename, summaryDate, summaryFlowHeading, summaryRow, withdrawnSentence
} from "./rivers-model";
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
  compared: number, failed = false): void {
  main!.setAttribute("aria-busy", "false");
  window.__riversReady = { gauges, rendered, charts, withdrawn, compared, failed };
}

function note(text: string, className = "reservoir-note"): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
}

function heading(level: "h2" | "h3" | "h4", text: string, className: string): HTMLHeadingElement {
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
  article.id = gaugeAnchor(gauge);
  article.dataset.station = gauge.source_station_id;
  article.dataset.tier = view.tier;
  if (view.comparison?.shortRecord) article.dataset.shortRecord = "true";
  article.append(heading("h3", view.name, "river-name"));
  if (view.where) article.append(note(view.where));
  article.append(note(view.tierNote, `reservoir-note river-${view.tier}`));
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
  reading.append(headline);
  if (view.comparison) {
    const verdict = document.createElement("p");
    verdict.className = "river-class";
    verdict.textContent = view.comparison.label;
    reading.append(verdict, note(view.comparison.detail, "reservoir-note river-band"));
    if (view.comparison.shortRecord) {
      reading.append(note(view.comparison.shortRecord, "reservoir-note river-short"));
    }
  } else if (view.withheld) {
    reading.append(note(view.withheld, "reservoir-note river-withheld"));
  }
  reading.append(note(view.status, "reservoir-note river-status"), definitionList(view.rows));
  article.append(reading);

  article.append(heading("h4", "Flow in the last 30 days", "reservoir-subhead"));
  const chartHost = document.createElement("div");
  chartHost.className = "trend-chart-host";
  const chart = renderFlowChart(chartHost, view.days, view.name);
  if (chart) article.append(chartHost);
  article.append(renderFlowTable(view.days));

  article.append(heading("h4", "Source", "reservoir-subhead"), definitionList(view.source));
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

/** One row per gauge, in the cards' order, each linking to its card. */
function summaryTable(gauges: readonly RiverGauge[]): HTMLElement {
  const date = summaryDate(gauges);
  const section = document.createElement("section");
  section.className = "rivers-summary";
  section.setAttribute("aria-labelledby", "rivers-summary-heading");
  const title = heading("h2", "Flow at each gauge", "rivers-group-heading");
  title.id = "rivers-summary-heading";
  const scroller = document.createElement("div");
  scroller.className = "rivers-summary-scroll";
  const table = document.createElement("table");
  table.className = "rivers-summary-table";
  table.setAttribute("aria-labelledby", "rivers-summary-heading");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const [text, unit] of [["Gauge", null], [summaryFlowHeading(date), FLOW_UNIT],
    ["Compared with normal", null]] as const) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = text;
    if (unit) {
      const small = document.createElement("span");
      small.className = "rivers-summary-unit";
      small.textContent = unit;
      cell.append(small);
    }
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  for (const gauge of gauges) {
    const row = summaryRow(gauge, date);
    const tr = document.createElement("tr");
    tr.dataset.tier = row.tier;
    const name = document.createElement("th");
    name.scope = "row";
    const link = document.createElement("a");
    link.href = `#${row.anchor}`;
    link.textContent = row.name;
    name.append(link);
    const flow = document.createElement("td");
    flow.className = "rivers-summary-flow";
    flow.textContent = row.flow;
    const comparison = document.createElement("td");
    comparison.textContent = row.comparison;
    tr.append(name, flow, comparison);
    body.append(tr);
  }
  table.append(head, body);
  scroller.append(table);
  section.append(title, scroller);
  return section;
}

function render(payload: RiverPayload): void {
  const children: HTMLElement[] = [];
  let charts = 0;
  const compared = payload.gauges.filter((gauge) => gauge.compared_with_normal).length;
  const groups = groupGauges(payload.gauges);
  const ordered = [...groups.natural, ...groups.shaped];
  if (ordered.length > 0) {
    const states = [...new Set(ordered.map((gauge) => stateName(gauge.state)))].sort();
    children.push(note(`This page covers ${ordered.length} reviewed gauges in ${states.join(", ")}.`),
      summaryTable(ordered));
  }
  for (const [title, gauges] of [[NATURAL_GROUP_HEADING, groups.natural],
    [SHAPED_GROUP_HEADING, groups.shaped]] as const) {
    if (gauges.length === 0) continue;
    const group = document.createElement("section");
    group.className = "rivers-group";
    group.append(heading("h2", title, "rivers-group-heading"));
    for (const gauge of gauges) {
      const { article, chart } = renderGauge(gauge);
      if (chart) charts += 1;
      group.append(article);
    }
    children.push(group);
  }
  if (payload.withdrawn.length > 0) {
    const group = document.createElement("section");
    group.className = "rivers-group";
    group.append(heading("h2", "Not in the current published data", "rivers-group-heading"));
    for (const notice of payload.withdrawn) {
      const article = document.createElement("article");
      article.className = "river";
      article.append(heading("h3", notice.name, "river-name"),
        note(withdrawnSentence(notice), "reservoir-withdrawn"));
      article.append(note("If readings start again, the gauge comes back."));
      group.append(article);
    }
    children.push(group);
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
  finish(payload.gauge_count, payload.gauges.length, charts, payload.withdrawn.length, compared);
}

async function run(): Promise<void> {
  try {
    render(await loadRivers());
  } catch (error) {
    console.error("The published river data could not be read:", error);
    list!.replaceChildren(note("The published river data could not be read just now, so "
      + "this page has nothing to show. It is worth reloading later.", "reservoir-error"));
    finish(0, 0, 0, 0, 0, true);
  }
}

void run();
