/*
 * Ten years of one drainage area, week by week, the way the Drought Monitor
 * draws its own time series: the share of the measured land at each class or
 * worse, stacked so D4 sits inside D3 inside D2 and so on down to D0.
 *
 * The shares are cumulative, so each class's band is drawn from zero to its
 * own "this class or worse" figure and the next class is painted over it.
 * What is left showing of each colour is exactly that class's own share, and
 * the top edge of the yellow is the share in any class at all. No arithmetic
 * happens here beyond placing published numbers.
 *
 * Each week is drawn as a step a week wide rather than a point joined to the
 * next: a weekly map describes its week, and a line sloping between two
 * Tuesdays would draw values nobody measured. A week with no map is left as
 * a marked gap, never bridged (ADR-123).
 *
 * Hand-built SVG like every other chart on this page, coloured from
 * `DROUGHT_CLASSES` (ADR-008, ADR-032), with everything that is not data
 * taking its colour from a theme token.
 */
import type { DroughtAtLeast } from "../types";
import { DROUGHT_CLASSES } from "./drought-classes";
import { formatDate, formatPercent } from "./format";

const SVG = "http://www.w3.org/2000/svg";

export const DROUGHT_HISTORY_FALLBACK_WIDTH = 640;
const HEIGHT = 260;
const PAD_LEFT = 42;
const PAD_RIGHT = 12;
const PAD_TOP = 22;
const PAD_BOTTOM = 26;
/** The closest two year labels may sit before every other one is dropped. */
const YEAR_LABEL_SPACING = 38;

function element<K extends keyof SVGElementTagNameMap>(
  name: K, attributes: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

export interface DroughtHistoryInput {
  dates: readonly string[];
  series: readonly (DroughtAtLeast | null)[];
  /** The week to mark as this week, as a position in `dates`. */
  current: number | null;
}

export interface DroughtHistoryChart {
  svg: SVGSVGElement;
  /** The left edge of week `index` and the width of one week, in SVG units,
   * for the page's cursor. */
  weekX: (index: number) => number;
  weekWidth: number;
  plotTop: number;
  plotBottom: number;
}

export function renderDroughtHistory(
  input: DroughtHistoryInput,
  ariaLabel: string,
  width = DROUGHT_HISTORY_FALLBACK_WIDTH
): DroughtHistoryChart {
  const count = input.dates.length;
  const chartWidth = Math.max(PAD_LEFT + PAD_RIGHT + 120, width);
  const plotWidth = chartWidth - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const week = plotWidth / Math.max(1, count);
  const x = (index: number): number => PAD_LEFT + index * week;
  const y = (percent: number): number =>
    PAD_TOP + plotHeight - (Math.min(100, Math.max(0, percent)) / 100) * plotHeight;

  const svg = element("svg", {
    viewBox: `0 0 ${chartWidth} ${HEIGHT}`,
    class: "drought-history-chart",
    role: "img",
    "aria-label": ariaLabel
  });

  for (const tick of [0, 25, 50, 75, 100]) {
    svg.append(element("line", {
      class: "drought-grid", x1: PAD_LEFT, x2: chartWidth - PAD_RIGHT, y1: y(tick), y2: y(tick)
    }));
    const label = element("text", {
      class: "drought-axis", x: PAD_LEFT - 6, y: y(tick) + 3.5, "text-anchor": "end"
    });
    label.textContent = `${tick}%`;
    svg.append(label);
  }

  /* A year label at the first week of each year, every other year when the
   * card is too narrow for all ten. */
  const yearStarts = input.dates
    .map((date, index) => ({ date, index }))
    .filter(({ date, index }) => index > 0 && date.slice(0, 4) !== input.dates[index - 1]!.slice(0, 4));
  const stride = yearStarts.length > 1
    && (x(yearStarts[1]!.index) - x(yearStarts[0]!.index)) < YEAR_LABEL_SPACING ? 2 : 1;
  yearStarts.forEach(({ date, index }, position) => {
    svg.append(element("line", {
      class: "drought-history-year", x1: x(index), x2: x(index),
      y1: PAD_TOP, y2: PAD_TOP + plotHeight + 4
    }));
    if (position % stride !== 0) return;
    const label = element("text", {
      class: "drought-axis", x: x(index) + 3, y: HEIGHT - 8
    });
    label.textContent = date.slice(0, 4);
    svg.append(label);
  });

  /* Weeks with no share: one band each run, drawn under the classes so the
   * gap reads as missing rather than as a week with no drought in it. */
  let gapStart: number | null = null;
  input.series.forEach((shares, index) => {
    if (shares === null && gapStart === null) gapStart = index;
    const ends = gapStart !== null && (shares !== null || index === count - 1);
    if (!ends) return;
    const stop = shares === null ? index + 1 : index;
    const gap = element("rect", {
      class: "drought-history-gap", x: x(gapStart!), y: PAD_TOP,
      width: Math.max(1, x(stop) - x(gapStart!)), height: plotHeight
    });
    const title = element("title", {});
    title.textContent = stop - gapStart! === 1
      ? `No map for the week of ${formatDate(input.dates[gapStart!]!)}`
      : `No map for ${stop - gapStart!} weeks from ${formatDate(input.dates[gapStart!]!)}`;
    gap.append(title);
    svg.append(gap);
    gapStart = null;
  });

  /* One path per class, D0 first so each worse class paints over it. */
  for (const entry of DROUGHT_CLASSES) {
    let path = "";
    let open = false;
    input.series.forEach((shares, index) => {
      if (shares === null) {
        if (open) path += `L${x(index)},${y(0)}Z`;
        open = false;
        return;
      }
      const top = y(shares[entry.key]);
      path += open ? `L${x(index)},${top}` : `M${x(index)},${y(0)}L${x(index)},${top}`;
      path += `L${x(index + 1)},${top}`;
      open = true;
    });
    if (open) path += `L${x(count)},${y(0)}Z`;
    if (path === "") continue;
    const layer = element("path", {
      class: "drought-history-band", d: path, fill: entry.color
    });
    const title = element("title", {});
    title.textContent = `${entry.label} (${entry.code}) or worse`;
    layer.append(title);
    svg.append(layer);
  }

  svg.append(element("line", {
    class: "drought-history-base", x1: PAD_LEFT, x2: chartWidth - PAD_RIGHT,
    y1: y(0), y2: y(0)
  }));

  if (input.current !== null) {
    const middle = x(input.current) + week / 2;
    svg.append(element("line", {
      class: "drought-history-now", x1: middle, x2: middle, y1: PAD_TOP - 6, y2: y(0)
    }));
    const label = element("text", {
      class: "drought-axis-title", x: middle, y: PAD_TOP - 9, "text-anchor": "end"
    });
    label.textContent = "This week";
    svg.append(label);
  }

  return { svg, weekX: x, weekWidth: week, plotTop: PAD_TOP, plotBottom: y(0) };
}

/** One week in words: the readout under the chart and the cursor's text. */
export function describeWeek(date: string, shares: DroughtAtLeast | null): string {
  if (shares === null) return `Week of ${formatDate(date)}: no map for this week.`;
  return `Week of ${formatDate(date)}: ` + DROUGHT_CLASSES.map((entry) =>
    `${formatPercent(shares[entry.key])} ${entry.code} or worse`).join(", ") + ".";
}
