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

interface PlatedLabel {
  className: string;
  text: string;
  x: number;
  /** The text's baseline. */
  y: number;
  anchor: "start" | "end";
}

const PLATE_PAD = 3;
const LABEL_CHAR_WIDTH = 6.9;

function leastCovering(text: string, lineY: number, chartWidth: number,
  marks: readonly [number, number, number][]): PlatedLabel {
  const width = text.length * LABEL_CHAR_WIDTH + PLATE_PAD * 2;
  const right = chartWidth - PAD_RIGHT - 4;
  const left = PAD_LEFT + 4 + width;
  const middle = (PAD_LEFT + chartWidth - PAD_RIGHT + width) / 2;
  const above = lineY < PAD_TOP + 14 ? lineY + 13 : lineY - 4;
  const below = lineY + 15 > HEIGHT - PAD_BOTTOM ? above : lineY + 15;
  let best: PlatedLabel | null = null;
  let bestCost = Infinity;
  for (const baseline of [above, below]) {
    for (const end of [right, left, middle]) {
      const top = baseline - 12.5;
      const cost = marks.reduce((sum, [mx, my, weight]) =>
        sum + (mx >= end - width && mx <= end && my >= top && my <= top + 16 ? weight : 0), 0);
      if (cost < bestCost) {
        bestCost = cost;
        best = { className: "elevation-reference-label", text, x: end, y: baseline, anchor: "end" };
      }
    }
  }
  return best!;
}

/**
 * A label on a plate of the page colour. Lines and labels cross wherever a
 * year passes a reference level, and text drawn over a line is read as part
 * of it; the plate hides the few pixels of line behind the words instead.
 */
function drawPlatedLabel(svg: SVGSVGElement, label: PlatedLabel
): { plate: SVGRectElement; text: SVGTextElement } {
  const estimate = label.text.length * LABEL_CHAR_WIDTH;
  const left = label.anchor === "end" ? label.x - estimate : label.x;
  const plate = element("rect", {
    class: "elevation-label-plate", x: (left - PLATE_PAD).toFixed(1),
    y: (label.y - 12.5).toFixed(1), width: (estimate + PLATE_PAD * 2).toFixed(1),
    height: 16, rx: 3
  });
  const text = element("text", {
    class: label.className, x: label.x.toFixed(1), y: label.y.toFixed(1), "text-anchor": label.anchor
  });
  text.textContent = label.text;
  svg.append(plate, text);
  return { plate, text };
}

function fitPlate(plate: SVGRectElement, text: SVGTextElement): void {
  try {
    const box = text.getBBox();
    if (!(box.width > 0)) return;
    plate.setAttribute("x", (box.x - PLATE_PAD).toFixed(1));
    plate.setAttribute("y", (box.y - 1).toFixed(1));
    plate.setAttribute("width", (box.width + PLATE_PAD * 2).toFixed(1));
    plate.setAttribute("height", (box.height + 2).toFixed(1));
  } catch {
    /* A host not yet laid out keeps the estimate. */
  }
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

    /* Every drawn reading, in chart units, weighted by how much it matters:
     * a label may cover a muted year's line before the current year's. */
    const marks: [number, number, number][] = chart.lines.flatMap((line) => line.points
      .filter((point): point is [number, number] => point[1] !== null)
      .map(([day, feet]) => [x(day), y(feet), line.tier === "earlier" ? 1 : 4]));
    const labels: PlatedLabel[] = [];
    for (const level of chart.drawn) {
      const lineY = y(level.elevation_ft);
      svg.append(element("line", {
        class: "elevation-reference", x1: PAD_LEFT, y1: lineY.toFixed(1),
        x2: chartWidth - PAD_RIGHT, y2: lineY.toFixed(1)
      }));
      /* Drawn last, over a plate, so no line runs through the words; placed
       * where it hides the fewest readings, at the right end above the line
       * when nothing is better. */
      labels.push(leastCovering(chartLevelLabel(level), lineY, chartWidth, marks));
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
      labels.push({
        className: "elevation-end-label", text: current.label,
        x: flip ? dotX - 8 : dotX + 8, y: dotY - 8, anchor: flip ? "end" : "start"
      });
    }

    const plated = labels.map((label) => drawPlatedLabel(svg, label));
    host.replaceChildren(svg);
    /* Once on the page the text can be measured; the estimate only had to
     * be close enough to draw before then. */
    for (const { plate, text } of plated) fitPlate(plate, text);
    return true;
  }, { fallbackWidth: FALLBACK_WIDTH, minimumWidth: MINIMUM_WIDTH });
  return true;
}
