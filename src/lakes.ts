/*
 * The terminal-lakes page (ADR-119): a static shell, the runtime `lakes.json`,
 * nothing generated (ADR-002).
 *
 * Every lake the payload publishes is on this one page, because there is one
 * so far and a page per lake would be a link to a page with one thing on it.
 * A lake the payload withdrew is stated, not measured (ADR-056). The words
 * are the model's; this file is the sequence.
 */
import "@esri/calcite-components/main.css";
import { setAssetPath as setCalciteAssetPath } from "@esri/calcite-components";

import { loadReference } from "./data/boundaries";
import { hydrologicPath, referenceRosters } from "./data/hydrologic-path";
import type { HydrologicRosters } from "./data/hydrologic-path";
import { loadLakes } from "./data/load";
import { describeLake, withdrawnSentence } from "./lakes-model";
import type { LakeGaugeView } from "./lakes-model";
import type { LakePayload, TerminalLake } from "./types";
import { lakesTemplate } from "./ui/lakes-template";
import { definitionList, measurementCard } from "./ui/measurement-card";
import { createLocationFacts } from "./ui/location-facts";
import { setupPlaceChooser } from "./ui/opening-splash";
import { setupPlaceSearch } from "./ui/place-search";
import { wireTheme } from "./ui/theme";
import { coordinateText } from "./viz/coordinates";
import { renderTrendChart, renderTrendTable } from "./viz/trend";
import "./styles/lakes.css";

/* One neutral bar colour: a lake has no storage class to be coloured by
 * (ADR-112), and the storage table's colours would say it did. */
const LAKE_BAR_COLOR = "#5b7f95";

setCalciteAssetPath(new URL(/* @vite-ignore */ "../", import.meta.url).href);
const root = document.querySelector<HTMLElement>("#lakes-app");
if (!root) throw new Error("Missing #lakes-app root");

root.innerHTML = lakesTemplate(window.location.search);
wireTheme();
void setupPlaceChooser();
setupPlaceSearch("lakes");

const main = root.querySelector<HTMLElement>("#lakes-main");
const list = root.querySelector<HTMLElement>("#lakes-list");
if (!main || !list) throw new Error("Missing #lakes-main");

function finish(lakes: number, rendered: number, withdrawn: number, failed = false): void {
  main!.setAttribute("aria-busy", "false");
  window.__lakesReady = { lakes, rendered, withdrawn, failed };
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

/*
 * One gauge's cards, chart and table. A lake read at one site draws these
 * straight into its article with h3 headings, as it always has; an arm is a
 * named sub-record one heading level down (ADR-159).
 */
function renderGauge(gauge: LakeGaugeView, host: HTMLElement, name: string,
  sub: "h3" | "h4"): void {
  const cards = document.createElement("div");
  cards.className = "lake-measurements";
  cards.append(measurementCard(gauge.level, sub, "lake-measure-heading"));
  if (gauge.volume) cards.append(measurementCard(gauge.volume, sub, "lake-measure-heading"));
  host.append(cards);
  if (gauge.noVolume) host.append(note(gauge.noVolume, "reservoir-note lake-no-volume"));

  if (gauge.months.length === 0) return;
  const chartHost = document.createElement("div");
  chartHost.className = "trend-chart-host";
  const chart = renderTrendChart(chartHost, gauge.months, name);
  const table = renderTrendTable(gauge.months, { fullLevel: false });
  if (chart || table) {
    host.append(heading(sub, "Volume in the last 12 months", "reservoir-subhead"));
    if (chart) host.append(chartHost);
    if (table) host.append(table);
  }
}

function renderLake(lake: TerminalLake, rosters: HydrologicRosters): HTMLElement {
  const view = describeLake(lake, LAKE_BAR_COLOR);
  const article = document.createElement("article");
  article.className = "lake";
  article.append(heading("h2", view.name, "lake-name"), note(view.statement));
  if (view.armsNote) article.append(note(view.armsNote));
  if (view.late) article.append(note(view.late, "detail-late"));

  const armed = view.gauges.some((gauge) => gauge.heading !== null);
  for (const gauge of view.gauges) {
    if (gauge.heading === null) {
      renderGauge(gauge, article, view.name, "h3");
      continue;
    }
    const section = document.createElement("section");
    section.className = "lake-arm";
    section.setAttribute("aria-label", `${view.name}, ${gauge.heading}`);
    section.append(heading("h3", gauge.heading, "lake-arm-name"),
      note(`Station ${gauge.station}`, "reservoir-note lake-arm-station"));
    renderGauge(gauge, section, `${view.name}, ${gauge.heading}`, "h4");
    const point = createLocationFacts([], coordinateText(gauge.lat, gauge.lon), "Gauge point");
    if (point) section.append(heading("h4", "Gauge location", "reservoir-subhead"), point);
    article.append(section);
  }

  /* A lake measured by arm has no point of its own: its drainage path is the
   * one every arm agrees on, and each arm states its own point above. */
  const location = createLocationFacts(
    hydrologicPath(lake.huc6, lake.huc6_name, rosters, lake.huc8, lake.huc8_name),
    armed || lake.lat === null || lake.lon === null ? null : coordinateText(lake.lat, lake.lon));
  if (location) article.append(heading("h3", "Location", "reservoir-subhead"), location);

  article.append(heading("h3", "Targets", "reservoir-subhead"),
    ...view.targets.map((line) => note(line)));
  article.append(heading("h3", "Source", "reservoir-subhead"), definitionList(view.source),
    note(view.note));
  return article;
}

function render(payload: LakePayload, rosters: HydrologicRosters): void {
  const children: HTMLElement[] = payload.lakes.map((lake) => renderLake(lake, rosters));
  for (const notice of payload.withdrawn) {
    const article = document.createElement("article");
    article.className = "lake";
    article.append(heading("h2", notice.name, "lake-name"),
      note(withdrawnSentence(notice), "reservoir-withdrawn"));
    if (notice.source_label) {
      article.append(note(`Its readings came from the ${notice.source_label}.`));
    }
    article.append(note("If readings start again, the lake comes back."));
    children.push(article);
  }
  if (children.length === 0) {
    children.push(note("No lake is published yet."));
  }
  list!.replaceChildren(...children);
  finish(payload.lake_count, payload.lakes.length, payload.withdrawn.length);
}

async function run(): Promise<void> {
  try {
    /* The region and subregion names come from the reference export, which
     * the lake payload does not carry. Its failure costs the names and
     * nothing else: the codes are the lake's own, and a page that waited on
     * a second file to show its first would be holding a reading hostage to
     * a label. */
    const [payload, reference] = await Promise.all([
      loadLakes(),
      loadReference().catch((error: unknown) => {
        console.warn("The reference export could not be read; drainage names are omitted:", error);
        return null;
      })
    ]);
    render(payload, reference === null ? {} : referenceRosters(reference));
  } catch (error) {
    console.error("The published lake data could not be read:", error);
    list!.replaceChildren(note("The published lake data could not be read just now, so "
      + "this page has nothing to show. It is worth reloading later.", "reservoir-error"));
    finish(0, 0, 0, true);
  }
}

void run();
