/*
 * Thirty days of daily mean flow at one gauge (ADR-136).
 *
 * Hand-built SVG like the storage trend (ADR-075), measured to its host so
 * one unit is one CSS pixel. The axis starts at zero: a storm rise on a cut
 * axis looks the same as a flood. Every bar is one colour from CSS, because
 * a flow has no storage class to be coloured by; a day with no value is a
 * gap, never a zero.
 */
import type { RiverDayView } from "../rivers-model";
import { FLOW_UNIT } from "../rivers-model";
import { renderResponsiveChart, stopResponsiveChart } from "./responsive";

const SVG = "http://www.w3.org/2000/svg";
const FALLBACK_WIDTH = 320;
const HEIGHT = 150;
const PAD_LEFT = 46;
const PAD_RIGHT = 8;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

function element<K extends keyof SVGElementTagNameMap>(
  name: K, attributes: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/** A round top for the axis: 1, 2 or 5 times a power of ten. */
export function flowAxisTop(highest: number): number {
  if (!(highest > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(highest));
  for (const step of [1, 2, 5, 10]) {
    if (step * power >= highest) return step * power;
  }
  return 10 * power;
}

function compact(value: number): string {
  if (value >= 1_000) return `${(value / 1_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function buildFlowChart(days: readonly RiverDayView[], name: string, width: number): SVGSVGElement {
  const values = days.map((day) => day.cfs).filter((v): v is number => v !== null);
  const top = flowAxisTop(Math.max(0, ...values));
  const chartWidth = Math.max(PAD_LEFT + PAD_RIGHT + 90, width);
  const plotWidth = chartWidth - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slot = plotWidth / days.length;
  const x = (index: number): number => PAD_LEFT + (index + 0.5) * slot;
  const y = (value: number): number => PAD_TOP + plotHeight - (value / top) * plotHeight;
  const first = days[0];
  const last = days[days.length - 1];

  const svg = element("svg", {
    class: "trend-chart flow-chart",
    viewBox: `0 0 ${chartWidth} ${HEIGHT}`,
    width: "100%",
    role: "img",
    "aria-label": `Daily mean flow for ${name} from ${first?.label ?? ""} to ${last?.label ?? ""}, `
      + `in ${FLOW_UNIT}. Each bar is one day. A gap is a day with no value. `
      + "The table below lists every value."
  });

  for (const fraction of [0, 0.5, 1]) {
    const at = y(top * fraction);
    svg.append(element("line", {
      class: "trend-grid", x1: PAD_LEFT, y1: at.toFixed(1), x2: chartWidth - PAD_RIGHT, y2: at.toFixed(1)
    }));
    const label = element("text", {
      class: "trend-axis", x: PAD_LEFT - 5, y: (at + 3.5).toFixed(1), "text-anchor": "end"
    });
    label.textContent = compact(top * fraction);
    svg.append(label);
  }

  const barWidth = Math.max(2, slot - 2);
  days.forEach((day, index) => {
    if (day.cfs === null) return;
    const barTop = y(day.cfs);
    const bar = element("rect", {
      class: "flow-bar",
      x: (x(index) - barWidth / 2).toFixed(1),
      y: barTop.toFixed(1),
      width: barWidth.toFixed(1),
      height: Math.max(0, PAD_TOP + plotHeight - barTop).toFixed(1),
      rx: 1
    });
    const title = document.createElementNS(SVG, "title");
    title.textContent = `${day.fullLabel}: ${day.value} ${FLOW_UNIT}. ${day.status}.`;
    bar.append(title);
    svg.append(bar);
  });

  /* The first and last days, and the middle one where there is room. */
  const labelled = slot * days.length >= 240
    ? [0, Math.floor((days.length - 1) / 2), days.length - 1] : [0, days.length - 1];
  for (const index of labelled) {
    const day = days[index];
    if (!day) continue;
    const anchor = index === 0 ? "start" : index === days.length - 1 ? "end" : "middle";
    const at = index === 0 ? PAD_LEFT : index === days.length - 1 ? chartWidth - PAD_RIGHT : x(index);
    const label = element("text", {
      class: "trend-axis", x: at.toFixed(1), y: HEIGHT - 7, "text-anchor": anchor
    });
    label.textContent = day.label;
    svg.append(label);
  }
  return svg;
}

/** Draw the window at its real host width and keep it fitted. */
export function renderFlowChart(host: HTMLElement, days: readonly RiverDayView[], name: string): boolean {
  if (!days.some((day) => day.cfs !== null)) {
    stopResponsiveChart(host);
    host.replaceChildren();
    return false;
  }
  renderResponsiveChart(host, (width) => host.replaceChildren(buildFlowChart(days, name, width)), {
    fallbackWidth: FALLBACK_WIDTH,
    minimumWidth: PAD_LEFT + PAD_RIGHT + 90
  });
  return true;
}

/** Every value behind the chart, newest first, collapsed. */
export function renderFlowTable(days: readonly RiverDayView[]): HTMLElement {
  const wrapper = document.createElement("details");
  wrapper.className = "trend-details";
  const summary = document.createElement("summary");
  summary.textContent = "Values for each day";
  wrapper.append(summary);
  const scroller = document.createElement("div");
  scroller.className = "trend-table-scroll";
  const table = document.createElement("table");
  table.className = "trend-table";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const [label, numeric] of [["Day", false], ["Cubic feet per second", true],
    ["Review status", false]] as const) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = label;
    if (numeric) cell.className = "trend-num";
    headRow.append(cell);
  }
  head.append(headRow);
  const body = document.createElement("tbody");
  for (const day of [...days].reverse()) {
    const row = document.createElement("tr");
    const date = document.createElement("th");
    date.scope = "row";
    date.textContent = day.fullLabel;
    const value = document.createElement("td");
    value.className = "trend-num";
    value.textContent = day.value;
    const status = document.createElement("td");
    status.textContent = day.status;
    row.append(date, value, status);
    body.append(row);
  }
  table.append(head, body);
  scroller.append(table);
  wrapper.append(scroller);
  return wrapper;
}
