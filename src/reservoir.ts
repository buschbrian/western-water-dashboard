/*
 * The one-reservoir page: a static shell, the runtime payload, and nothing
 * generated.
 *
 * The shape was decided before it was built (docs/OPEN-BACKLOG-SCOPING.md,
 * decision 4): one entry at `reservoir.html?name=...` rather than a build-time
 * shell per reservoir. The page fetches like every other surface here
 * (ADR-002), and because it reads the *published payload* rather than a
 * generated file, a reservoir withdrawn for a quiet feed (ADR-056) still has
 * a page -- one that says the reading was withdrawn instead of one that
 * stopped existing.
 *
 * What is live on this page is everything about the named reservoir; what is
 * text is the rules. As on the methods page, a page that states a number
 * about the data fills that number from the data.
 *
 * ADR-006 applies to every word of the template and of the model's rows.
 */
import "@esri/calcite-components/main.css";
import { setAssetPath as setCalciteAssetPath } from "@esri/calcite-components";

import { downloadCsv } from "./data/download";
import { hydrologicPath } from "./data/hydrologic-path";
import {
  reservoirCsvFilename, reservoirHistoryCsv
} from "./data/export";
import { loadReservoirs, loadUpstreamIndex } from "./data/load";
import {
  baselineRows, provenanceRows, requestedName, resolveReservoirPage
} from "./reservoir-model";
import type { ReservoirPageState } from "./reservoir-model";
import type { ReservoirPayload } from "./types";
import { renderTrendChart, renderTrendTable } from "./viz/trend";
import { formatAcreFeet, formatDate } from "./viz/format";
import { storageColor } from "./viz/classes";
import { headlinePercent } from "./viz/symbols";
import {
  describeReservoir
} from "./state/detail";
import {
  baselineChoices
} from "./state/baseline";
import { reservoirTemplate } from "./ui/reservoir-template";
import { upstreamSection } from "./ui/upstream-section";
import { setupPlaceChooser } from "./ui/opening-splash";
import { setupPlaceSearch } from "./ui/place-search";
import { createLocationFacts } from "./ui/location-facts";
import { wireTheme } from "./ui/theme";
import { coordinateText } from "./viz/coordinates";
import "./styles/reservoir.css";

setCalciteAssetPath(new URL(/* @vite-ignore */ "../", import.meta.url).href);
const root = document.querySelector<HTMLElement>("#reservoir-app");
if (!root) throw new Error("Missing #reservoir-app root");

root.innerHTML = reservoirTemplate(window.location.search);
wireTheme();
void setupPlaceChooser();
setupPlaceSearch("reservoir");

const found = root.querySelector<HTMLElement>("#reservoir-main");
if (!found) throw new Error("Missing #reservoir-main");
/* A narrowed alias: the render helpers below run after this guard, and the
 * checker does not carry a narrowing into another function body. */
const main: HTMLElement = found;

function finish(state: ReservoirPageState["status"]): void {
  main.setAttribute("aria-busy", "false");
  window.__reservoirReady = { status: state };
}

/** A paragraph with the class every other state message on this page wears. */
function note(text: string, className = "reservoir-note"): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
}

function definitionList(rows: readonly { label: string; value: string }[],
  className: string): HTMLDListElement {
  const list = document.createElement("dl");
  list.className = className;
  for (const row of rows) {
    const term = document.createElement("dt");
    term.textContent = row.label;
    const definition = document.createElement("dd");
    definition.textContent = row.value;
    list.append(term, definition);
  }
  return list;
}

/** The reading's dated facts as tiles: each label over its value. */
function answerTiles(
  rows: readonly { label: string; value: string }[], wide: (label: string) => boolean
): HTMLDListElement {
  const list = document.createElement("dl");
  list.className = "reservoir-tiles";
  for (const row of rows) {
    const tile = document.createElement("div");
    /* The seasonal comparison is the longest sentence; it takes two columns
     * so five tiles fill whole rows at both grid widths. */
    if (wide(row.label)) tile.className = "reservoir-tile-wide";
    const term = document.createElement("dt");
    term.textContent = row.label;
    const definition = document.createElement("dd");
    definition.textContent = row.value;
    tile.append(term, definition);
    list.append(tile);
  }
  return list;
}

function sectionHeading(text: string): HTMLHeadingElement {
  const heading = document.createElement("h2");
  heading.className = "reservoir-subhead";
  heading.textContent = text;
  return heading;
}

/**
 * The page for a reservoir in this morning's payload.
 *
 * The reading and its comparisons come from the same builders the storage
 * map's details panel uses, so one page cannot drift from the other: the
 * wording is a rule, and the rule lives in one module.
 *
 * Readiness includes the aerial image: it is page content like any other,
 * and signalling first would have an accessibility checker reading the
 * map's controls half-hydrated. The image carries its own deadline, so the
 * worst case is bounded -- a slow image delays the signal by that deadline
 * and then says it did not arrive.
 */
async function renderFound(payload: ReservoirPayload,
  state: Extract<ReservoirPageState, { status: "found" }>): Promise<void> {
  const { reservoir, label } = state;
  document.title = `${label} — Western Water Dashboard`;

  const view = describeReservoir(
    reservoir, storageColor(headlinePercent(reservoir)),
    payload.default_baseline ?? "recent",
    baselineChoices(payload),
    payload.climate_normals?.minimum_years ?? 0);

  const heading = document.createElement("h1");
  heading.className = "reservoir-name";
  heading.textContent = label;

  const eyebrow = document.createElement("p");
  eyebrow.className = "eyebrow";
  eyebrow.textContent = "Reservoir details";

  const headline = document.createElement("p");
  headline.className = "detail-headline";
  headline.style.setProperty("--detail-class-color", view.color);
  const value = document.createElement("strong");
  value.textContent = view.percent;
  const basis = document.createElement("span");
  basis.textContent = view.basis;
  headline.append(value, basis);

  /* The answer first: how much is stored, how full that is, how it has
   * moved and whether that is normal. Every other row of the details view
   * follows lower down, under the section it belongs to. */
  const answerLabels = new Set(["Reading date", "History rank", view.baseline.label]);
  const isAnswer = (row: { label: string }): boolean =>
    row.label.startsWith("Change in") || answerLabels.has(row.label);
  const stored = view.rows.find((row) => row.label === "Stored now");
  const answerRank = (label: string): number => label === "Reading date" ? 0
    : label.startsWith("Change in") ? 1 : label === view.baseline.label ? 2 : 3;
  const answerRows = view.rows.filter(isAnswer)
    .sort((a, b) => answerRank(a.label) - answerRank(b.label));
  const restRows = view.rows.filter((row) =>
    row !== stored && !isAnswer(row) && row.label !== "Measured by");
  const peakRows = restRows.filter((row) => row.label === "Highest value this year");
  const factRows = restRows.filter((row) => row.label !== "Highest value this year");

  const children: (HTMLElement | SVGElement)[] = [eyebrow, heading];
  if (view.late) children.push(note(view.late, "detail-late"));
  if (stored) {
    const figure = document.createElement("p");
    figure.className = "reservoir-storage";
    const label = document.createElement("span");
    label.textContent = stored.label;
    const amount = document.createElement("strong");
    amount.textContent = stored.value;
    figure.append(label, amount);
    children.push(figure);
  }
  children.push(headline, answerTiles(answerRows, (label) => label === view.baseline.label));

  // The twelve months, drawn by the same SVG builder the details panel uses.
  const chartHost = document.createElement("div");
  chartHost.className = "trend-chart-host";
  const chart = renderTrendChart(chartHost, view.months, view.name);
  const table = renderTrendTable(view.months);
  if (chart || table) {
    children.push(sectionHeading("The last 12 months"));
    if (chart) children.push(chartHost);
    if (table) children.push(table);
  }

  // Both comparisons, each saying how many years stand behind it. A reader
  // who wants only one is on the map page; here they can see what choosing
  // would change.
  const baselines = baselineRows(reservoir).map((row) => ({
    label: row.label,
    value: row.normalAf === null
      ? "No comparison available."
      : `${formatAcreFeet(row.normalAf)} acre-feet, ${row.percentOfNormal ?? 0}% `
        + `of normal now, from ${row.sampleYears} year${row.sampleYears === 1 ? "" : "s"}`
        + `${row.coversFullPeriod ? "" : " (part of the period)"}`
  }));
  if (baselines.length || peakRows.length) {
    children.push(sectionHeading("Comparisons"));
    children.push(definitionList([...baselines, ...peakRows], "detail-rows"));
  }

  // What the committed trace says sits above this reservoir (ADR-077); the
  // section fills in when the index arrives and stays empty if it does not.
  const upstreamHost = document.createElement("div");
  upstreamHost.className = "reservoir-upstream";
  children.push(upstreamHost);

  const location = createLocationFacts(
    hydrologicPath(reservoir.huc6, reservoir.huc6_name, payload.watersheds ?? {},
      reservoir.huc8, reservoir.huc8_name),
    coordinateText(reservoir.lat, reservoir.lon));
  const provenance = provenanceRows(reservoir);
  const countyRows = provenance.filter((row) => row.label === "County");
  children.push(sectionHeading("Location"));
  if (location) children.push(location);
  if (countyRows.length) children.push(definitionList(countyRows, "detail-rows"));

  // The reservoir's own ground, from Esri's World Imagery. Mounted after
  // the page is on screen and outside the readiness signal: a slow image
  // must not hold the page's facts hostage, and its own deadline replaces
  // it with a sentence rather than an empty box.
  const imageryHost = document.createElement("div");
  imageryHost.className = "reservoir-imagery-host";
  imageryHost.setAttribute("aria-busy", "true");
  const imageryHeading = sectionHeading("From above");
  imageryHeading.className = "reservoir-minorhead";
  children.push(imageryHeading, imageryHost);

  // Where the numbers come from, plus the record itself.
  const record = [
    /* Through the same formatter every other date on this page goes
     * through. It was printed raw, so one line of the Source list read
     * "2015-01-01" while "Reading date" a screen above read "Aug 29, 2026"
     * -- the machine form of a date, in front of a reader, on a page where
     * the reader form was already in use. */
    { label: "Record starts", value: formatDate(reservoir.first_obs) },
    {
      label: "Readings held",
      value: `${reservoir.n_obs} readings over ${reservoir.years_of_record} years`
    }
  ];
  children.push(sectionHeading("Sources"));
  children.push(definitionList([
    ...provenance.filter((row) => row.label !== "County"),
    ...factRows, ...record], "detail-rows"));
  children.push(note(view.note));

  const mapLink = document.createElement("p");
  mapLink.className = "reservoir-links";
  const link = document.createElement("a");
  link.href = `./?reservoir=${encodeURIComponent(label)}`;
  link.textContent = "See this reservoir on the storage map";
  mapLink.append(link);
  children.push(mapLink);

  const exportButton = document.createElement("calcite-button");
  exportButton.className = "detail-export";
  exportButton.setAttribute("appearance", "outline");
  exportButton.setAttribute("icon-start", "export");
  exportButton.textContent = "Download this reservoir (CSV file)";
  exportButton.addEventListener("click", () => void downloadCsv(
    reservoirHistoryCsv(reservoir),
    reservoirCsvFilename(label, payload.generated_at.slice(0, 10))));
  children.push(exportButton);

  main.replaceChildren(...children);
  const imageryReady = (async () => { try {
    const imagery = await import("./ui/reservoir-imagery");
    await imagery.mountReservoirImagery(imageryHost, {
      label, lon: reservoir.lon, lat: reservoir.lat
    });
  } catch {
    /* The dynamic import itself failing is the same honest outcome as the
       image timing out: say so and stop claiming to be busy. */
    imageryHost.replaceChildren(note(
      "The aerial image could not be loaded just now.", "chart-empty"));
    imageryHost.removeAttribute("aria-busy");
  } })();
  // A missing index costs the upstream section and nothing else; a screen
  // inside it is stated as what it is rather than shown as an empty count.
  const upstreamReady = (async () => { try {
    const index = await loadUpstreamIndex();
    const station = reservoir.source_station_id;
    const trace = station === null ? null : index.traces[station];
    if (trace && station) {
      upstreamHost.append(...upstreamSection(trace, payload.reservoirs, station));
    }
  } catch {
    console.error("The upstream index could not be read:");
  } })();
  await Promise.all([imageryReady, upstreamReady]);
  finish("found");
}

/**
 * The page for a reservoir the roster withdrew (ADR-056).
 *
 * The notice carries no measurement, so neither does this page: the name,
 * when the reading was last real, and who published it. That is enough to
 * keep a shared link honest without publishing a figure the pipeline no
 * longer stands behind.
 */
function renderWithdrawn(
  state: Extract<ReservoirPageState, { status: "withdrawn" }>): void {
  document.title = `${state.name} — Western Water Dashboard`;
  const heading = document.createElement("h1");
  heading.className = "reservoir-name";
  heading.textContent = state.name;

  const children: HTMLElement[] = [
    note("Reservoir details", "eyebrow"),
    heading,
    /* The date goes through the same formatter as every other date a reader
     * sees. It was interpolated raw, so the one sentence a withdrawn
     * reservoir has read "It was last read 2024-03-15." -- a machine date in
     * the middle of a plain-English sentence. */
    note("This reservoir is not in the current published data. Its feed went "
      + "quiet for longer than the publication window, so the site stopped "
      + `showing it. It was last read ${
        state.lastRead ? formatDate(state.lastRead) : "at an unknown date"
      }.`, "reservoir-withdrawn")
  ];
  if (state.sourceLabel) {
    children.push(note(`Its readings came from the ${state.sourceLabel}.`,
      "reservoir-note"));
  }
  children.push(note("If readings start again, the reservoir comes back, "
    + "and this link will show it."));
  main.replaceChildren(...children);
  finish("withdrawn");
}

/** A reviewed hold names the issue without displaying the old measurement. */
function renderHeld(state: Extract<ReservoirPageState, { status: "held" }>): void {
  const { notice } = state;
  document.title = `${notice.name} — Western Water Dashboard`;
  const heading = sectionHeading(notice.name);
  const title = document.createElement("h1");
  title.className = "reservoir-name";
  title.textContent = heading.textContent;
  const evidence = document.createElement("a");
  evidence.href = notice.source_url;
  evidence.textContent = "Read the source for this review";
  main.replaceChildren(note("Reservoir details", "eyebrow"), title,
    note("This reservoir is not in the current published data."), note(notice.reason),
    note(`Reviewed ${formatDate(notice.reviewed_on)}.`), evidence);
  finish("held");
}

/** No such name, and no withdrawal either. */
function renderUnknown(
  state: Extract<ReservoirPageState, { status: "unknown" }>): void {
  const heading = document.createElement("h1");
  heading.className = "reservoir-name";
  heading.textContent = "No reservoir by that name";
  const requested = note(`The link asked for \u201C${state.requested}\u201D, `
    + "and no published reservoir carries that name or identifier. If two "
    + "reservoirs share a name, the link must carry the state as well -- "
    + "\u201CLost Creek, OR\u201D, the way the storage map writes it.");
  main.replaceChildren(
    note("Reservoir details", "eyebrow"), heading, requested,
    note("Every published reservoir is listed in the storage charts, and "
      + "every name on it links from there.", "reservoir-links"));
  finish("unknown");
}

/** A bare `reservoir.html` link: say what the page is for. */
function renderLanding(): void {
  const heading = document.createElement("h1");
  heading.className = "reservoir-name";
  heading.textContent = "One reservoir at a time";
  main.replaceChildren(
    note("Reservoir details", "eyebrow"),
    heading,
    note("This page shows one reservoir's storage, its comparisons and its "
      + "sources. Add ?name= to the address, with the reservoir's name -- or "
      + "open the storage map and choose one; every reservoir has a page "
      + "like this one."),
    note("A name shared by two reservoirs needs the state too, exactly as "
      + "the storage map writes it: \u201CLost Creek, OR\u201D.",
      "reservoir-links"));
  finish("none");
}

async function run(): Promise<void> {
  if (requestedName(window.location.search) === null) return renderLanding();
  try {
    const payload = await loadReservoirs();
    const state = resolveReservoirPage(payload, window.location.search);
    switch (state.status) {
      case "found": return renderFound(payload, state);
      case "withdrawn": return renderWithdrawn(state);
      case "held": return renderHeld(state);
      case "unknown": return renderUnknown(state);
      case "none": return renderLanding();
    }
  } catch (error) {
    console.error("The published data could not be read:", error);
    main.replaceChildren(
      note("Reservoir details", "eyebrow"),
      note("The published data could not be read just now, so this page has "
        + "nothing to show. It is worth reloading later.", "reservoir-error"));
    finish("unknown");
  }
}

void run();
