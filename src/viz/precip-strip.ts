/*
 * Where this year stands on one date: every past water year as a dot at its
 * precipitation since 1 October on the same day, and this year as the large
 * dot (ADR-125). It answers "is this a good year so far?" before a reader has
 * to read the chart below, and it shows the history rank instead of only
 * stating it.
 *
 * Each past year takes the colour of the history region it falls in on the
 * chart, so the two views share one key. Dots that would overlap stack
 * upward, in value order, so every year stays visible and countable. The
 * driest and wettest years carry their year, which is the thing a reader
 * asks next.
 */
import type { BandStep } from "../precip-model";
import { HISTORY_REGIONS } from "./precip-curve";
import { renderResponsiveChart, stopResponsiveChart } from "./responsive";

const SVG = "http://www.w3.org/2000/svg";
const FALLBACK_WIDTH = 640;
const PAD_X = 16;
const DOT = 5;
const ROW = 11;
const THIS_DOT = 8;

export interface StripYear {
  waterYear: number;
  inches: number;
}

function element<K extends keyof SVGElementTagNameMap>(
  name: K, attributes: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/** The history region a value sits in on one day, by the chart's own edges. */
export function regionOf(value: number, band: BandStep): (typeof HISTORY_REGIONS)[number] {
  return HISTORY_REGIONS.find((region) => value <= band[region.upper]) ?? HISTORY_REGIONS[4];
}

/**
 * Rows for dots that would overlap: each dot, in value order, goes in the
 * lowest row where it clears the last dot by `gap` pixels. Deterministic, so
 * the same data always draws the same picture.
 */
export function stackRows(xs: readonly number[], gap: number): number[] {
  const order = xs.map((x, index) => ({ x, index })).sort((a, b) => a.x - b.x);
  const lastInRow: number[] = [];
  const rows = new Array<number>(xs.length).fill(0);
  for (const { x, index } of order) {
    let row = lastInRow.findIndex((last) => x - last >= gap);
    if (row === -1) row = lastInRow.length;
    lastInRow[row] = x;
    rows[index] = row;
  }
  return rows;
}

export function renderPrecipitationStrip(
  host: HTMLElement, years: readonly StripYear[], thisYear: number, band: BandStep, ariaLabel: string
): boolean {
  if (years.length === 0) {
    stopResponsiveChart(host);
    host.replaceChildren();
    return false;
  }
  return renderResponsiveChart(host, (width) => {
    const chartWidth = Math.max(220, width);
    const top = Math.max(thisYear, ...years.map((year) => year.inches)) * 1.04 || 1;
    const x = (inches: number): number => PAD_X + (inches / top) * (chartWidth - PAD_X * 2);
    const rows = stackRows(years.map((year) => x(year.inches)), DOT * 2 + 1);
    const rowCount = Math.max(1, ...rows.map((row) => row + 1));
    const baseline = 30 + rowCount * ROW;
    const height = baseline + 34;

    const svg = element("svg", {
      class: "precip-strip", viewBox: `0 0 ${chartWidth} ${height}`, role: "img", "aria-label": ariaLabel
    });
    svg.append(element("line", {
      class: "precip-baseline", x1: PAD_X, y1: baseline, x2: chartWidth - PAD_X, y2: baseline
    }));
    for (const tick of [0, top / 2, top / 1.04].map((value) => Math.round(value * 10) / 10)) {
      const label = element("text", {
        class: "precip-axis", x: x(tick).toFixed(1), y: baseline + 16,
        "text-anchor": tick === 0 ? "start" : tick >= top / 1.05 ? "end" : "middle"
      });
      label.textContent = `${tick.toFixed(tick >= 10 ? 0 : 1)} in`;
      svg.append(label);
    }

    years.forEach((year, index) => {
      const dot = element("circle", {
        class: `precip-strip-dot precip-region ${regionOf(year.inches, band).className}`,
        cx: x(year.inches).toFixed(1), cy: (baseline - DOT - 2 - rows[index]! * ROW).toFixed(1), r: DOT
      });
      const title = document.createElementNS(SVG, "title");
      title.textContent = `Water year ${year.waterYear}: ${year.inches.toFixed(1)} in`;
      dot.append(title);
      svg.append(dot);
    });

    const sorted = [...years].sort((a, b) => a.inches - b.inches);
    const ends = [
      { year: sorted[0]!, anchor: "start" as const, name: "Driest" },
      { year: sorted[sorted.length - 1]!, anchor: "end" as const, name: "Wettest" }
    ];
    for (const end of ends) {
      const label = element("text", {
        class: "precip-note-label", x: x(end.year.inches).toFixed(1), y: baseline + 30,
        "text-anchor": end.anchor
      });
      label.textContent = `${end.name}: ${end.year.waterYear}`;
      svg.append(label);
    }

    const thisX = x(thisYear);
    svg.append(element("line", {
      class: "precip-strip-rule", x1: thisX.toFixed(1), y1: 18, x2: thisX.toFixed(1), y2: baseline
    }));
    svg.append(element("circle", {
      class: "precip-latest", cx: thisX.toFixed(1), cy: (baseline - THIS_DOT - 1).toFixed(1), r: THIS_DOT
    }));
    const flip = thisX > chartWidth * 0.6;
    const label = element("text", {
      class: "precip-end-label precip-end-precip", x: (thisX + (flip ? -6 : 6)).toFixed(1), y: 14,
      "text-anchor": flip ? "end" : "start"
    });
    label.textContent = `This year · ${thisYear.toFixed(1)} in`;
    svg.append(label);

    host.replaceChildren(svg);
    return true;
  }, { fallbackWidth: FALLBACK_WIDTH, minimumWidth: 220 });
}
