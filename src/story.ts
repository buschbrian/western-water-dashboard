/*
 * Story views (ADR-128): one figure from a full page, alone, for a story
 * to embed. `story.html?view=precip|strip|upstream&...`.
 *
 * Nothing here computes. Each view is built from the module its full page
 * uses -- the precipitation card and the snow page's own place scoping, the
 * reservoir reading and the upstream section -- so a view and its page
 * cannot disagree.
 *
 * The view fills its frame exactly and never scrolls (`ui/story-fit.ts`).
 * It never reads or writes the reader's stored theme or place: an embed
 * must not change the site for the person reading the story.
 */
import "@esri/calcite-components/main.css";

import { EMPTY_OPENING_ROSTERS, loadOpeningRosters, type OpeningRosters } from "./data/opening-scope";
import { loadReservoirs, loadUpstreamIndex } from "./data/load";
import { loadSnowpack } from "./data/snow-load";
import { stateName } from "./data/state-vocabulary";
import { resolveReservoirPage } from "./reservoir-model";
import { openingAreaName, snowPlace } from "./snow-place";
import { baselineChoices } from "./state/baseline";
import { describeReservoir } from "./state/detail";
import {
  invalidSentence, reservoirPageHref, snowPageHref, storyRequestFromSearch,
  type StoryInvalid, type StoryPlace, type StoryRequest
} from "./state/story-url";
import type { EffectiveTheme } from "./state/theme";
import { createPrecipitationCard, type PrecipitationCard } from "./ui/precipitation-card";
import { fitContent, type FitDrop, type FitPlan } from "./ui/story-fit";
import { stampTheme } from "./ui/theme-stamp";
import { upstreamSection } from "./ui/upstream-section";
import { storageColor } from "./viz/classes";
import { formatDate } from "./viz/format";
import { PRECIPITATION_CHART_HEIGHT, PRECIPITATION_CHART_MIN_HEIGHT } from "./viz/precip-curve";
import { headlinePercent } from "./viz/symbols";
import "./styles/overview.css";
import "./styles/snow.css";
import "./styles/upstream.css";
import "./styles/story.css";

const SITE_NAME = "Western Water Dashboard";

const request = storyRequestFromSearch(window.location.search);

/* The theme the link asks for, or the reader's system setting, live. No
 * storage either way. */
function wireStoryTheme(theme: EffectiveTheme | null): void {
  if (theme) {
    stampTheme(theme);
    return;
  }
  const dark = window.matchMedia("(prefers-color-scheme: dark)");
  stampTheme(dark.matches ? "dark" : "light");
  dark.addEventListener("change", () => stampTheme(dark.matches ? "dark" : "light"));
}
wireStoryTheme(request.theme);

const root = document.querySelector<HTMLElement>("#story-app");
if (!root) throw new Error("Missing #story-app root");
const main = document.createElement("main");
main.id = "story-main";
main.className = "story-main";
main.setAttribute("aria-busy", "true");
const content = document.createElement("div");
content.className = "story-content";
const footer = document.createElement("footer");
footer.className = "story-footer";
main.append(content);
root.replaceChildren(main, footer);

function text(tag: string, className: string, value: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

/** The view's own name in the tab and for a reader of the page's metadata. */
function describePage(title: string, description: string): void {
  document.title = `${title} — ${SITE_NAME}`;
  for (const [selector, value] of [
    ['meta[name="description"]', description],
    ['meta[property="og:title"]', title],
    ['meta[property="og:description"]', description]
  ] as const) {
    document.querySelector(selector)?.setAttribute("content", value);
  }
}

/** One line: the credit, the data's date, and the full page in a new tab.
 * `date` is already worded: "Readings to ..." or "Published ...". */
function setFooter(date: string | null, href: string | null): void {
  const parts: (Node | string)[] = [text("span", "story-credit", SITE_NAME)];
  if (date) parts.push(" · ", text("span", "story-date", date));
  if (href) {
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener";
    link.textContent = "Open the full page";
    parts.push(" · ", link);
  }
  footer.replaceChildren(...parts);
}

type Ready = NonNullable<Window["__storyReady"]>;
let ready: Ready = { view: request.view, state: "loading", theme: request.theme ?? "system" };
let plan: FitPlan | null = null;

function publish(fields: Partial<Ready>): void {
  ready = { ...ready, ...fields };
  window.__storyReady = ready;
}

/* Fit now, whenever the frame changes size, and whenever the content does:
 * the charts redraw at their measured width within their own deadline, and
 * fonts arrive late, and either changes how tall the content is. A fit
 * settles on one answer for one layout, so the content's size after a fit is
 * the size the next fit leaves it at, and the two observers fall quiet. */
let fitTimer: ReturnType<typeof setTimeout> | null = null;
function fit(): void {
  if (!plan) return;
  const result = fitContent(main, content, plan);
  publish({ dropped: result.dropped, fits: result.fits, chartHeight: result.chartHeight });
}
function scheduleFit(): void {
  if (fitTimer !== null) return;
  fitTimer = setTimeout(() => { fitTimer = null; fit(); }, 0);
}
const observer = new ResizeObserver(scheduleFit);
observer.observe(main);
observer.observe(content);
void document.fonts?.ready.then(scheduleFit);
window.addEventListener("resize", scheduleFit);

function finish(state: "ready" | "failed" | "invalid", fields: Partial<Ready> = {}): void {
  main.setAttribute("aria-busy", "false");
  fit();
  publish({ ...fields, state });
}

function showInvalid(reason: StoryInvalid, href: string | null = null): void {
  plan = null;
  describePage("Story view", invalidSentence(reason));
  content.replaceChildren(text("p", "story-message", invalidSentence(reason)));
  setFooter(null, href);
  finish("invalid", { reason });
}

function showFailure(sentence: string, href: string | null): void {
  plan = null;
  content.replaceChildren(text("p", "story-message", sentence));
  setFooter(null, href);
  finish("failed");
}

/* ---- Precipitation, and the strip alone ---------------------------------- */

function placeName(place: StoryPlace, area: string | null): string {
  const state = place.state === "all" ? null : stateName(place.state);
  if (area && state) return `${area}, ${state}`;
  return area ?? state ?? "the western United States";
}

function precipitationPlan(card: PrecipitationCard, lead: HTMLElement, stripOnly: boolean): FitPlan {
  const parts = card.parts;
  if (stripOnly) {
    return {
      drops: () => [lead, parts.stripNote, ...(parts.stripKey ? [parts.stripKey] : [])]
        .map((element) => ({ elements: [element] }))
    };
  }
  return {
    drops: (): FitDrop[] => {
      const kpis = [...parts.kpis.children] as HTMLElement[];
      const one = (element: HTMLElement): FitDrop => ({ elements: [element] });
      return [
        one(lead), one(parts.readNote), one(parts.coverage), one(parts.april),
        one(parts.strip), one(parts.split), { elements: [parts.kpis], className: "story-kpi-short" },
        /* The chart names its own two lines, so their key and the range
         * buttons go before the key to the history colours. */
        one(parts.controls), one(parts.historyKey), one(parts.axisTitle),
        { elements: kpis.slice(2) }, one(parts.chart), { elements: kpis.slice(1, 2) }
      ];
    },
    flexible: {
      element: parts.chart,
      min: PRECIPITATION_CHART_MIN_HEIGHT,
      max: PRECIPITATION_CHART_HEIGHT,
      set: (height) => card.setChartHeight(height)
    }
  };
}

async function showPrecipitation(view: "precip" | "strip", place: StoryPlace): Promise<void> {
  const href = snowPageHref(place);
  setFooter(null, href);
  const [raw, rosters] = await Promise.all([
    loadSnowpack(),
    loadOpeningRosters().catch((error: unknown): OpeningRosters | null => {
      console.warn("The place rosters could not load:", error);
      return null;
    })
  ]);
  /* Without the rosters an area cannot be checked or named, and a view that
   * widened to everywhere would show a figure for the wrong place. */
  if (place.area !== null && rosters === null) {
    showFailure("The place in this link could not be checked just now. Try again later.", href);
    return;
  }
  const scoped = snowPlace(raw, rosters ?? EMPTY_OPENING_ROSTERS, place);
  if (place.area !== null && scoped.scope.selection.area === null) {
    showInvalid("place", null);
    return;
  }
  const name = placeName(place, openingAreaName(scoped.scope));
  const title = `Precipitation since 1 October: ${name}`;
  describePage(title, view === "strip"
    ? `Where this water year stands against every earlier year on the same date, for ${name}.`
    : `Rain and snow caught by the gauges at the snow measurement sites in ${name}, against the same sites' history.`);

  const section = document.createElement("section");
  section.className = "overview-card story-card";
  section.id = "precip-card";
  section.setAttribute("aria-labelledby", "story-heading");
  const heading = text("h1", "story-title", title);
  heading.id = "story-heading";
  const lead = text("p", "story-lead", view === "strip"
    ? "Rain and snow caught by the gauges at the measurement sites, added up from 1 October."
    : "Rain and snow caught by the gauges at the measurement sites, added up from 1 October. " +
      "The snow water the same sites hold now is shown beside the figures.");
  section.append(heading, lead);
  content.replaceChildren(section);

  let settled = false;
  const card = createPrecipitationCard(section, () => {
    const status = card.status;
    if (status.state === "loading") return;
    setFooter(status.date ? `Readings to ${formatDate(status.date)}` : null, href);
    const fields: Partial<Ready> = {
      stations: status.stations, curveDays: status.curveDays,
      bandDays: status.bandDays, stripYears: status.stripYears
    };
    if (!settled) {
      settled = true;
      finish(status.state === "failed" ? "failed" : "ready", fields);
    } else {
      publish(fields);
      scheduleFit();
    }
  }, { parts: view === "strip" ? "strip" : "card", standalone: true });
  /* A table that opens would not fit a frame, and a wide one scrolls
   * inside itself; the full page has it. */
  card.parts.table.remove();
  plan = precipitationPlan(card, lead, view === "strip");
  /* A block the fit has left out is out of the flow, so its redraw does not
   * change the content's size; watch the drawn blocks themselves. */
  for (const part of [card.parts.strip, card.parts.chart, card.parts.top]) observer.observe(part);
  card.update(scoped.stations, scoped.payload.sites);
}

/* ---- What is above a reservoir ------------------------------------------- */

function upstreamPlan(lead: HTMLElement[], section: HTMLElement, more: HTMLElement): FitPlan {
  const items = (): HTMLElement[] => [...section.querySelectorAll<HTMLElement>(".upstream-list > li")];
  return {
    drops: () => {
      const list = items();
      /* The last row first, and never the first row: the largest store of
       * water above the reservoir stays on screen. */
      return [
        ...lead.map((element) => ({ elements: [element] })),
        ...list.slice(1).reverse().map((element) => ({ elements: [element] }))
      ];
    },
    dropped: (count) => {
      const hidden = Math.max(0, count - lead.length);
      const grouped = section.querySelector(".upstream-group-name") !== null;
      more.textContent = hidden === 0 ? "" : `${hidden} more ${grouped
        ? `drainage area${hidden === 1 ? " is" : "s are"}`
        : `reservoir${hidden === 1 ? " is" : "s are"}`} on the full page.`;
      more.hidden = hidden === 0;
    }
  };
}

async function showUpstream(requested: string): Promise<void> {
  const payload = await loadReservoirs();
  const page = resolveReservoirPage(payload, `?${new URLSearchParams({ name: requested })}`);
  if (page.status === "unknown" || page.status === "none") {
    showInvalid("reservoir-unknown");
    return;
  }
  if (page.status !== "found") {
    const name = page.status === "held" ? page.notice.name : page.name;
    showInvalid("reservoir-not-published", reservoirPageHref(name));
    return;
  }
  const { reservoir, label } = page;
  const href = reservoirPageHref(label);
  describePage(`What is above ${label}`,
    `${label}: water stored now, and the stored water in the published reservoirs upstream of it.`);
  /* The rows below are read on different days; the date that holds for all
   * of them is the day the data was published. */
  setFooter(`Published ${formatDate(payload.generated_at.slice(0, 10))}`, href);

  const view = describeReservoir(
    reservoir, storageColor(headlinePercent(reservoir)),
    payload.default_baseline ?? "recent", baselineChoices(payload),
    payload.climate_normals?.minimum_years ?? 0);
  const heading = text("h1", "story-title", label);
  const stored = view.rows.find((row) => row.label === "Stored now");
  const date = view.rows.find((row) => row.label === "Reading date");
  const figures = document.createElement("div");
  figures.className = "story-reservoir";
  if (stored) {
    const figure = document.createElement("p");
    figure.className = "story-figure";
    figure.append(text("span", "", stored.label), text("strong", "", stored.value));
    figures.append(figure);
  }
  const percent = document.createElement("p");
  percent.className = "detail-headline story-figure";
  percent.style.setProperty("--detail-class-color", view.color);
  percent.append(text("strong", "", view.percent), text("span", "", view.basis));
  figures.append(percent);
  if (date) figures.append(text("p", "story-date-line", `${date.label}: ${date.value}`));
  const late = view.late ? text("p", "detail-late", view.late) : null;

  const section = document.createElement("section");
  section.className = "story-upstream";
  section.setAttribute("aria-busy", "true");
  section.append(text("p", "reservoir-note", "Loading what is above this reservoir."));
  content.replaceChildren(...[heading, figures, late, section].filter((node): node is HTMLElement => node !== null));

  let index: Awaited<ReturnType<typeof loadUpstreamIndex>>;
  try {
    index = await loadUpstreamIndex();
  } catch (error) {
    console.error("The upstream index could not be read:", error);
    section.replaceChildren(text("p", "reservoir-note", "What is above this reservoir could not load just now."));
    section.setAttribute("aria-busy", "false");
    finish("failed", { reservoir: "found" });
    return;
  }
  const station = reservoir.source_station_id;
  const trace = station === null ? undefined : index.traces[station];
  const built = trace && station
    ? upstreamSection(trace, payload.reservoirs, station, { newTab: true, groupRows: true })
    : [text("p", "reservoir-note", "No list of what is above this reservoir is published.")];
  const more = text("p", "reservoir-note story-more", "");
  more.hidden = true;
  section.replaceChildren(...built, more);
  section.setAttribute("aria-busy", "false");
  const lead = [...section.querySelectorAll<HTMLElement>(":scope > .reservoir-links")];
  plan = upstreamPlan(lead, section, more);
  finish("ready", {
    reservoir: "found",
    upstreamItems: section.querySelectorAll(".upstream-list > li").length
  });
}

/* ---- Start ---------------------------------------------------------------- */

async function run(current: StoryRequest): Promise<void> {
  if (!current.ok) {
    showInvalid(current.reason);
    return;
  }
  try {
    if (current.view === "upstream") await showUpstream(current.reservoir);
    else await showPrecipitation(current.view, current.place);
  } catch (error) {
    console.error("The story view could not load:", error);
    showFailure("The published data could not be read just now. Try again later.",
      current.view === "upstream" ? null : snowPageHref(current.place));
  }
}

void run(request);
