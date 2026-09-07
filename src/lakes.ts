/*
 * The terminal-lakes page (ADR-118): a static shell, the runtime `lakes.json`,
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
import type { LakeMeasurementView, LakeRow } from "./lakes-model";
import type { LakePayload, TerminalLake } from "./types";
import { lakesTemplate } from "./ui/lakes-template";
import { createLocationFacts } from "./ui/location-facts";
import { setupPlaceChooser } from "./ui/opening-splash";
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

function heading(level: "h2" | "h3", text: string, className: string): HTMLHeadingElement {
  const element = document.createElement(level);
  element.className = className;
  element.textContent = text;
  return element;
}

function definitionList(rows: readonly LakeRow[]): HTMLDListElement {
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

function measurementCard(view: LakeMeasurementView): HTMLElement {
  const card = document.createElement("section");
  card.append(heading("h3", view.heading, "lake-measure-heading"));
  const headline = document.createElement("p");
  headline.className = "detail-headline";
  const value = document.createElement("strong");
  value.textContent = view.headline;
  const basis = document.createElement("span");
  basis.textContent = view.basis;
  headline.append(value, basis);
  card.append(headline, definitionList(view.rows));
  return card;
}

function renderLake(lake: TerminalLake, rosters: HydrologicRosters): HTMLElement {
  const view = describeLake(lake, LAKE_BAR_COLOR);
  const article = document.createElement("article");
  article.className = "lake";
  article.append(heading("h2", view.name, "lake-name"), note(view.statement));
  if (view.late) article.append(note(view.late, "detail-late"));

  const cards = document.createElement("div");
  cards.className = "lake-measurements";
  cards.append(measurementCard(view.level), measurementCard(view.volume));
  article.append(cards);

  const chartHost = document.createElement("div");
  chartHost.className = "trend-chart-host";
  const chart = renderTrendChart(chartHost, view.months, view.name);
  const table = renderTrendTable(view.months);
  if (chart || table) {
    article.append(heading("h3", "Volume in the last 12 months", "reservoir-subhead"));
    if (chart) article.append(chartHost);
    if (table) article.append(table);
  }

  const location = createLocationFacts(
    hydrologicPath(lake.huc6, lake.huc6_name, rosters, lake.huc8, lake.huc8_name),
    coordinateText(lake.lat, lake.lon));
  if (location) article.append(heading("h3", "Location", "reservoir-subhead"), location);

  article.append(heading("h3", "Targets", "reservoir-subhead"), note(view.targets));
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
