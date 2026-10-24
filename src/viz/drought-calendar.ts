/*
 * A decade of weeks for every drainage area in view, one row each.
 *
 * Each week is coloured by one stated rule: the most severe class that at
 * least half of the area's measured land is in, or worse (`calendarClass`).
 * Read across, a row is one area's decade; read down, a column is one week
 * across the west, and a drought that covered a region shows as a block.
 *
 * The colours are the monitor's own, from `DROUGHT_CLASSES`, so a cell means
 * here what the same colour means on the map (ADR-008, ADR-032). A week with
 * less than half the land even abnormally dry wears the page's "no drought"
 * hatch, and a week with no share at all -- no map, or no measured land --
 * is a flat grey that is neither: not measured is not no drought (ADR-059).
 * The severity index is not drawn here or anywhere with a ramp (ADR-082).
 *
 * HTML rows around one small SVG strip each, rather than one large SVG: the
 * names wrap and stack at phone width the way text does, each name is a
 * real button a keyboard reaches, and the strips stretch to the width they
 * are given because a week is a rectangle with no type in it to distort.
 */
import type { CalendarRow } from "../drought-history-model";
import { calendarCounts, calendarRuns } from "../drought-history-model";
import { WELL_MEASURED_PERCENT } from "../drought-model";
import { DROUGHT_CLASSES, NO_DROUGHT_LABEL } from "./drought-classes";
import { formatPercent } from "./format";

const SVG = "http://www.w3.org/2000/svg";

/** What a cell with no share is called on the key and in every summary. */
export const NO_SHARE_LABEL = "No map or no measured land";

function svgElement<K extends keyof SVGElementTagNameMap>(
  name: K, attributes: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function isThinlyMeasured(row: CalendarRow): boolean {
  return row.measuredPercent !== null && row.measuredPercent < WELL_MEASURED_PERCENT;
}

/** A row's weeks in words, for its strip's accessible name and the table. */
export function calendarRowSummary(row: CalendarRow): string {
  const counts = calendarCounts(row.cells);
  const parts = [
    `${counts.none} with less than half the land abnormally dry`,
    ...DROUGHT_CLASSES.map((entry) => `${counts[entry.key]} at ${entry.code}`)
  ];
  if (counts.missing > 0) parts.push(`${counts.missing} with no share`);
  return `${row.name}, ${row.cells.length} weeks: ${parts.join(", ")}.` +
    (isThinlyMeasured(row)
      ? ` Measured over ${formatPercent(row.measuredPercent)} of the area.` : "");
}

export interface DroughtCalendarOptions {
  dates: readonly string[];
  /** The week to mark as this week, as a position in `dates`. */
  current: number | null;
  /** The area the chart above is showing, marked as chosen. */
  chosen: string | null;
  onChoose: (code: string) => void;
}

/** Draws the calendar into `host` and returns the number of rows. */
export function renderDroughtCalendar(
  host: HTMLElement,
  rows: readonly CalendarRow[],
  options: DroughtCalendarOptions
): number {
  const weeks = options.dates.length;
  const yearStarts = options.dates
    .map((date, index) => ({ year: date.slice(0, 4), index }))
    .filter(({ year, index }) => index > 0 && year !== options.dates[index - 1]!.slice(0, 4));

  /* The year scale, in the same two-column grid as the rows so its labels
   * sit over the weeks they name. Hidden from assistive technology: the
   * strips and the table carry the dates in words. */
  const axis = document.createElement("div");
  axis.className = "drought-calendar-row drought-calendar-axis";
  axis.setAttribute("aria-hidden", "true");
  const axisSpacer = document.createElement("span");
  const axisLane = document.createElement("span");
  axisLane.className = "drought-calendar-years";
  yearStarts.forEach(({ year, index }) => {
    const label = document.createElement("span");
    label.textContent = year;
    label.style.insetInlineStart = `${(index / weeks) * 100}%`;
    axisLane.append(label);
  });
  if (options.current !== null) {
    const now = document.createElement("span");
    now.className = "drought-calendar-now-label";
    now.textContent = "This week";
    axisLane.append(now);
  }
  axis.append(axisSpacer, axisLane);

  const list = document.createElement("ol");
  list.className = "drought-calendar-rows";
  for (const row of rows) {
    const item = document.createElement("li");
    item.className = "drought-calendar-row";
    const thin = isThinlyMeasured(row);

    const name = document.createElement("button");
    name.type = "button";
    name.className = "drought-calendar-name";
    name.dataset.code = row.code;
    name.textContent = thin ? `${row.name} *` : row.name;
    name.setAttribute("aria-pressed", String(row.code === options.chosen));
    name.title = "Show this area in the chart above";
    name.addEventListener("click", () => options.onChoose(row.code));

    const strip = svgElement("svg", {
      viewBox: `0 0 ${weeks} 1`,
      preserveAspectRatio: "none",
      class: "drought-calendar-strip drought-segment-none",
      role: "img",
      "aria-label": calendarRowSummary(row)
    });
    for (const run of calendarRuns(row.cells)) {
      if (run.cell === "none") continue;
      const entry = DROUGHT_CLASSES.find((candidate) => candidate.key === run.cell);
      strip.append(svgElement("rect", {
        x: run.start, y: 0, width: run.length, height: 1,
        class: entry ? "drought-calendar-cell" : "drought-calendar-missing",
        ...(entry ? { fill: entry.color } : {})
      }));
    }
    for (const { index } of yearStarts) {
      strip.append(svgElement("line", {
        x1: index, x2: index, y1: 0, y2: 1,
        class: "drought-calendar-year", "vector-effect": "non-scaling-stroke"
      }));
    }
    if (options.current !== null) {
      strip.append(svgElement("rect", {
        x: options.current, y: 0, width: 1, height: 1,
        class: "drought-calendar-now", "vector-effect": "non-scaling-stroke"
      }));
    }

    item.append(name, strip);
    list.append(item);
  }

  host.replaceChildren(axis, list);
  return rows.length;
}

/** The key under the calendar: the no-drought hatch, the five classes and
 * the grey for weeks with no share. */
export function calendarKeyItems(): HTMLLIElement[] {
  const entries: { label: string; className: string; color: string | null }[] = [
    { label: `${NO_DROUGHT_LABEL}: less than half the land abnormally dry`,
      className: "drought-segment-none", color: null },
    ...DROUGHT_CLASSES.map((entry) => ({
      label: `${entry.label} (${entry.code})`, className: "", color: entry.color
    })),
    { label: NO_SHARE_LABEL, className: "drought-calendar-missing-swatch", color: null }
  ];
  return entries.map((entry) => {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = `drought-swatch ${entry.className}`.trim();
    if (entry.color) swatch.style.background = entry.color;
    const text = document.createElement("span");
    text.textContent = entry.label;
    item.append(swatch, text);
    return item;
  });
}
