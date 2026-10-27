/*
 * A reservoir's surface level, one line per water year (ADR-135).
 *
 * Hand-built SVG measured from its host, like the snow curve and the
 * precipitation chart (ADR-075): one SVG unit is one CSS pixel at every
 * width, so the type stays its size on a phone. Each line runs from
 * 1 October to 30 September so the years lie over one another. The current
 * year is the strong line, the year before it a lighter one, and earlier
 * years are muted. Reference levels are dashed lines named, with their
 * height, at the right end.
 *
 * Every colour comes from CSS, and none is a storage-class colour (ADR-008):
 * a level has no percent full to be coloured by.
 */
import type { ElevationChart } from "../reservoir-elevation-model";
import { chartLevelLabel } from "../reservoir-elevation-model";
import { renderResponsiveChart, stopResponsiveChart } from "./responsive";

const SVG = "http://www.w3.org/2000/svg";
const FALLBACK_WIDTH = 640;
const HEIGHT = 300;
const PAD_LEFT = 48;
const PAD_RIGHT = 10;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const MINIMUM_WIDTH = PAD_LEFT + PAD_RIGHT + 120;
const YEAR_DAYS = 365;
/* Day of the water year each month starts on, in a year with no 29 February. */
const MONTH_STARTS: readonly [number, string][] = [
  [0, "Oct"], [31, "Nov"], [61, "Dec"], [92, "Jan"], [123, "Feb"], [151, "Mar"],
  [182, "Apr"], [212, "May"], [243, "Jun"], [273, "Jul"], [304, "Aug"], [335, "Sep"]
];
const MONTH_LABEL_LANE = 34;
const TIER_ORDER = { earlier: 0, previous: 1, current: 2 } as const;

function element<K extends keyof SVGElementTagNameMap>(
  name: K, attributes: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/** A gridline step that keeps about five lines over the range. */
export function feetStep(range: number): number {
  for (const step of [1, 2, 5, 10, 20, 25, 50, 100, 200]) {
    if (range / step <= 6) return step;
  }
  return 500;
}

export function renderElevationYears(host: HTMLElement, chart: ElevationChart | null): boolean {
  if (!chart || chart.lines.length === 0) {
    stopResponsiveChart(host);
    host.replaceChildren();
    return false;
  }
  renderResponsiveChart(host, (width) => {
    const chartWidth = Math.max(MINIMUM_WIDTH, width);
    const plotWidth = chartWidth - PAD_LEFT - PAD_RIGHT;
    const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const plotBottom = PAD_TOP + plotHeight;
    const x = (day: number): number => PAD_LEFT + (Math.min(day, YEAR_DAYS) / YEAR_DAYS) * plotWidth;
    const y = (feet: number): number =>
      PAD_TOP + plotHeight - ((feet - chart.low) / (chart.high - chart.low)) * plotHeight;

    const svg = element("svg", {
      class: "elevation-years", viewBox: `0 0 ${chartWidth} ${HEIGHT}`,
      role: "img", "aria-label": chart.ariaLabel
    });

    const step = feetStep(chart.high - chart.low);
    for (let level = Math.ceil(chart.low / step) * step; level <= chart.high; level += step) {
      const lineY = y(level).toFixed(1);
      svg.append(element("line", {
        class: "elevation-grid", x1: PAD_LEFT, y1: lineY, x2: chartWidth - PAD_RIGHT, y2: lineY
      }));
      const label = element("text", {
        class: "elevation-axis", x: PAD_LEFT - 6, y: (Number(lineY) + 4).toFixed(1),
        "text-anchor": "end"
      });
      label.textContent = level.toLocaleString("en-US");
      svg.append(label);
    }

    const every = MONTH_STARTS.findIndex((_, index) =>
      Math.ceil(MONTH_STARTS.length / (index + 1)) * MONTH_LABEL_LANE <= plotWidth) + 1 || 12;
    MONTH_STARTS.forEach(([day, name], index) => {
      const tickX = x(day).toFixed(1);
      svg.append(element("line", {
        class: "elevation-tick", x1: tickX, y1: plotBottom, x2: tickX, y2: plotBottom + 4
      }));
      if (index % every !== 0) return;
      const label = element("text", {
        class: "elevation-axis", x: (x(day) + 2).toFixed(1), y: HEIGHT - 8, "text-anchor": "start"
      });
      label.textContent = name;
      svg.append(label);
    });

    for (const level of chart.drawn) {
      const lineY = y(level.elevation_ft);
      svg.append(element("line", {
        class: "elevation-reference", x1: PAD_LEFT, y1: lineY.toFixed(1),
        x2: chartWidth - PAD_RIGHT, y2: lineY.toFixed(1)
      }));
      /* At the right end: the current year starts on the left each October,
       * where a label would sit on its newest readings. */
      const label = element("text", {
        class: "elevation-reference-label", x: chartWidth - PAD_RIGHT - 4,
        y: (lineY < PAD_TOP + 14 ? lineY + 13 : lineY - 4).toFixed(1), "text-anchor": "end"
      });
      label.textContent = chartLevelLabel(level);
      svg.append(label);
    }

    const ordered = [...chart.lines].sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);
    for (const line of ordered) {
      let points: string[] = [];
      const flush = (): void => {
        if (points.length > 1) {
          svg.append(element("polyline", {
            class: `elevation-line elevation-line-${line.tier}`, points: points.join(" ")
          }));
        }
        points = [];
      };
      for (const [day, feet] of line.points) {
        if (feet === null) { flush(); continue; }
        points.push(`${x(day).toFixed(1)},${y(feet).toFixed(1)}`);
      }
      flush();
    }

    const current = chart.lines.find((line) => line.tier === "current");
    const lastPoint = current ? [...current.points].reverse().find(([, feet]) => feet !== null) : undefined;
    if (current && lastPoint && lastPoint[1] !== null) {
      const dotX = x(lastPoint[0]);
      const dotY = y(lastPoint[1]);
      svg.append(element("circle", {
        class: "elevation-latest", cx: dotX.toFixed(1), cy: dotY.toFixed(1), r: 4
      }));
      const flip = dotX > chartWidth - PAD_RIGHT - 70;
      const label = element("text", {
        class: "elevation-end-label", x: (flip ? dotX - 8 : dotX + 8).toFixed(1),
        y: (dotY - 8).toFixed(1), "text-anchor": flip ? "end" : "start"
      });
      label.textContent = current.label;
      svg.append(label);
    }

    host.replaceChildren(svg);
    return true;
  }, { fallbackWidth: FALLBACK_WIDTH, minimumWidth: MINIMUM_WIDTH });
  return true;
}
