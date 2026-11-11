import { loadPrecipitation } from "../data/precip-load";
import { loadSnowpack } from "../data/snow-load";
import { loadElevationHistory, loadRivers } from "../data/load";
import { loadReservoirFlowHistory } from "../data/reservoir-flow-history";
import { reservoirContext } from "../reservoir-context-model";
import { renderReservoirContext } from "../viz/reservoir-context";
import type { Reservoir, UpstreamTrace } from "../types";
import { upstreamConditions, UPSTREAM_CAUTION, type UpstreamReading } from "../upstream-conditions-model";
import { formatDate } from "../viz/format";

function text<K extends keyof HTMLElementTagNameMap>(tag: K, content: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.textContent = content;
  return node;
}

export function reservoirFlowSection(reservoir: Reservoir, runDate: string): HTMLElement | null {
  const flow = reservoir.water_flow;
  if (!flow) return null;
  const section = document.createElement("section");
  section.id = "reservoir-water-flow";
  const heading = text("h2", "Water in and out");
  heading.className = "reservoir-subhead";
  section.append(heading, text("p", "Daily average flow, in cubic feet per second. Reclamation's figures are provisional and may change."));
  for (const [key, label] of [["inflow", "Inflow"], ["release", "Total release"]] as const) {
    const reading = flow[key];
    if (!reading) {
      section.append(text("p", key === "inflow" && flow.inflow_unavailable
        ? flow.inflow_unavailable : `${label} could not be loaded just now.`));
      if (key === "inflow" && flow.inflow_review_url) {
        const link = text("a", "Reclamation's inflow catalog review");
        link.href = flow.inflow_review_url;
        section.append(link);
      }
      continue;
    }
    const age = Math.round((Date.parse(runDate.slice(0, 10)) - Date.parse(reading.as_of)) / 86400000);
    const figure = text("p", `${label}: ${new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 }).format(reading.current)} `
      + `cubic feet per second on ${formatDate(reading.as_of)}.`
      + (age > reservoir.stale_after_days ? ` This reading is ${age} days old and is late.` : ""));
    const definition = text("p", reading.definition);
    const source = text("a", `${label} source`);
    source.href = reading.source_url;
    const method = text("a", `How Reclamation defines ${label.toLowerCase()}`);
    method.href = reading.definition_url;
    section.append(figure, definition, source, document.createTextNode(" · "), method);
  }
  return section;
}

export function mountUpstreamConditions(host: HTMLElement, trace: UpstreamTrace, station: string,
  changed: (state: "waiting" | "loaded" | "unavailable") => void): void {
  if (trace.screen != null || trace.upstream_snow_sites.length === 0) return;
  const section = document.createElement("section");
  section.id = "reservoir-upstream-conditions";
  const heading = text("h2", "Rain and snow upstream");
  heading.className = "reservoir-subhead";
  section.append(heading, text("p", "Mean readings at mountain sites in the committed upstream set. "
    + "Each figure names the sites that reported; it is not an average over all the land."), text("p", UPSTREAM_CAUTION));
  const content = text("div", "The measurements load when this card comes near the screen.");
  section.append(content);
  host.append(section);
  const load = async (): Promise<void> => {
    content.setAttribute("aria-busy", "true");
    try {
      const [rain, snow] = await Promise.all([loadPrecipitation(), loadSnowpack()]);
      const view = upstreamConditions(trace.upstream_snow_sites, rain, snow);
      const reading = (label: string, value: UpstreamReading | null): HTMLParagraphElement => text("p", value
        ? `${label}: ${value.inches.toFixed(1)} inches, at ${value.sites} of ${view.indexed} upstream sites, to ${formatDate(value.date)}.`
        : `${label}: no current figure is available.`);
      content.replaceChildren(reading("Rain and snow caught in the last 7 days", view.week),
        reading("Rain and snow caught since October 1", view.season), reading("Water held in the snow", view.snow),
        text("p", `${view.rainMissing} upstream sites are absent from the current precipitation data; `
          + `${view.snowMissing} are absent from the current snow data.`));
      changed("loaded");
    } catch (error) {
      console.warn("The upstream conditions could not load:", error);
      content.replaceChildren(text("p", "The upstream measurements could not be loaded just now."));
      changed("unavailable");
    } finally { content.setAttribute("aria-busy", "false"); }
  };
  changed("waiting");
  const rain = text("a", "See precipitation upstream of this reservoir");
  rain.href = `./precipitation.html?state=all&upstream=${encodeURIComponent(station)}`;
  section.append(rain);
  if (!("IntersectionObserver" in window)) { void load(); return; }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    void load();
  }, { rootMargin: "600px 0px" });
  observer.observe(section);
}

export function mountReservoirContext(host: HTMLElement, trace: UpstreamTrace, station: string, runDate: string,
  changed: (state: "waiting" | "drawn" | "unavailable") => void): void {
  if (!["509", "6124"].includes(station) || trace.screen != null) return;
  const section = document.createElement("section");
  section.id = "reservoir-context";
  const heading = text("h2", "The last 30 days together");
  heading.className = "reservoir-subhead";
  section.append(heading, text("p", "These charts use the same dates and separate value scales. "
    + "The four rivers flow toward Lake Powell; their gauges are not reservoir inflow. "
    + "A gap is not a zero. No cause or travel time is shown."), text("p", UPSTREAM_CAUTION));
  const content = text("div", "The daily charts load when this card comes near the screen.");
  section.append(content);
  host.append(section);
  const report = (context: "waiting" | "drawn" | "unavailable"): void => {
    changed(context);
  };
  report("waiting");
  const load = async (): Promise<void> => {
    content.setAttribute("aria-busy", "true");
    try {
      const [rain, rivers, levels, flow] = await Promise.all([
        loadPrecipitation(), loadRivers().catch(() => null), loadElevationHistory().catch(() => null),
        loadReservoirFlowHistory(station).catch(() => null)
      ]);
      const level = levels?.reservoirs.find((row) => row.source_station_id === station) ?? null;
      const view = reservoirContext(trace.upstream_snow_sites, rain, rivers, level, flow ?? {}, runDate);
      content.replaceChildren();
      renderReservoirContext(content, view);
      if (!rivers || !level || !flow) content.prepend(text("p", "Some daily histories could not be loaded. The charts show only the readings that are available."));
      report("drawn");
    } catch (error) {
      console.warn("The daily context could not load:", error);
      content.replaceChildren(text("p", "The daily charts could not be loaded just now."));
      report("unavailable");
    } finally { content.setAttribute("aria-busy", "false"); }
  };
  if (!("IntersectionObserver" in window)) { void load(); return; }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    void load();
  }, { rootMargin: "600px 0px" });
  observer.observe(section);
}
