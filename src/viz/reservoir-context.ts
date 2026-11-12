import type { ReservoirContext } from "../reservoir-context-model";
import { formatDate } from "./format";
import { renderResponsiveChart } from "./responsive";

const SVG = "http://www.w3.org/2000/svg";
function node<K extends keyof SVGElementTagNameMap>(tag: K, attributes: Record<string, string | number>, text?: string): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text) element.textContent = text;
  return element;
}

/** Aligned small charts: one calendar axis, independent values and named units. */
export function renderReservoirContext(host: HTMLElement, context: ReservoirContext): void {
  host.replaceChildren();
  for (const row of context.rows) {
    const section = document.createElement("section");
    const heading = document.createElement("h3");
    heading.className = "reservoir-minorhead";
    heading.textContent = `${row.label} (${row.unit})`;
    const plot = document.createElement("div");
    const source = document.createElement("a");
    source.href = row.source;
    source.textContent = "Source";
    const details = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "Daily values";
    const list = document.createElement("dl");
    list.className = "detail-rows";
    row.values.forEach((value, index) => {
      const day = document.createElement("dt");
      day.textContent = formatDate(context.dates[index]!);
      const amount = document.createElement("dd");
      amount.textContent = value === null ? "No reading" : value.toLocaleString("en-US", { maximumFractionDigits: 2 })
        + (row.reportingSites ? ` at ${row.reportingSites[index]} reporting sites` : "");
      list.append(day, amount);
    });
    details.append(summary, list);
    section.append(heading, plot, source, details);
    host.append(section);
    const values = row.values.filter((value): value is number => value !== null);
    if (!values.length) {
      const empty = document.createElement("p");
      empty.textContent = "No readings are available for these dates.";
      plot.append(empty);
      continue;
    }
    renderResponsiveChart(plot, (width) => {
      const left = 48, right = width - 8, top = 12, bottom = 94, height = 122;
      const min = Math.min(...values), max = Math.max(...values);
      const room = Math.max((max - min) * .08, max * .005, .1);
      const low = min - room, high = max + room;
      const x = (i: number): number => left + i / 29 * (right - left);
      const y = (value: number): number => bottom - (value - low) / (high - low) * (bottom - top);
      const svg = node("svg", { viewBox: `0 0 ${width} ${height}`, role: "img",
        "aria-label": `${row.label}, ${row.unit}, from ${formatDate(context.dates[0]!)} to ${formatDate(context.dates[29]!)}. Daily values are in the list below.` });
      for (const value of new Set([min, max])) {
        svg.append(node("line", { class: "elevation-grid", x1: left, x2: right, y1: y(value), y2: y(value) }),
          node("text", { class: "elevation-axis", x: left - 5, y: y(value) + 4, "text-anchor": "end" },
            new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)));
      }
      let points: string[] = [];
      const flush = (): void => {
        if (points.length > 1) svg.append(node("polyline", { class: "elevation-line elevation-line-current", points: points.join(" ") }));
        points = [];
      };
      row.values.forEach((value, i) => {
        if (value === null) { flush(); return; }
        points.push(`${x(i)},${y(value)}`);
        svg.append(node("circle", { class: "elevation-point-current", cx: x(i), cy: y(value), r: 1.8 }));
      });
      flush();
      for (const index of [0, 14, 29]) svg.append(node("text", { class: "elevation-axis", x: x(index), y: height - 6,
        "text-anchor": index === 0 ? "start" : index === 29 ? "end" : "middle" }, formatDate(context.dates[index]!).replace(/, \d{4}$/, "")));
      plot.replaceChildren(svg);
    }, { fallbackWidth: 640, minimumWidth: 240 });
  }
}
