/*
 * The seasonal snow curve: mean percent of the normal median, day by day
 * across the water year, with a dashed line at 100 for normal.
 *
 * Hand-built SVG like the storage trend chart, and for the same reasons: a
 * daily percent line needs no chart SDK, the page stays light enough to open
 * on a phone, and the colours that are not data come from CSS so the dark
 * theme keeps the axis readable. The line breaks where the reporting floor
 * is not met rather than bridging the gap -- a drawn segment claims there
 * was a value there.
 *
 * The canvas is measured from the host rather than fixed, so one SVG unit is
 * one CSS pixel at every card width. Drawn on a fixed 640-unit canvas scaled
 * to the card, the whole picture stretched: the axis type rendered around
 * 21 pixels on a 1280 desktop and around 5 on a 360 phone, so the chart was
 * oversized where there was room and unreadable where there was not. Now the
 * type, the padding and the axis stay put and only the plot lane spreads --
 * the same rule the drought charts follow.
 */
import type { CurvePoint } from "../snow-model";
import { renderResponsiveChart, stopResponsiveChart } from "./responsive";

const SVG = "http://www.w3.org/2000/svg";

/** The width to draw at before the host has been measured. */
const FALLBACK_WIDTH = 640;
/* Height stays fixed while width is measured, the way the drought scatter
 * sizes itself: a season is a wide plot, and the number that decides how
 * readable it is is the height of the plot rather than its aspect. 340
 * matches that scatter, and replaces the 456 pixels the old canvas happened
 * to reach on a desktop and the 119 it fell to on a phone. */
const HEIGHT = 340;
const PAD_LEFT = 40;
const PAD_RIGHT = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 24;
/** Enough for the axis, its labels, and a plot lane worth drawing. */
const MINIMUM_WIDTH = PAD_LEFT + PAD_RIGHT + 80;

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function element<K extends keyof SVGElementTagNameMap>(
  name: K, attributes: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

/** Candidate gridline steps, small to large. */
const AXIS_STEPS = [25, 50, 100, 250, 500] as const;

/**
 * The axis top and the gridline step for a curve's largest value.
 *
 * The top keeps the old rule -- at least 150, so "just under normal" cannot
 * fill the frame and read as a good year; a genuinely big year extends it.
 * The step is new: a fixed 50 let one autumn point set 29 labels of scale
 * over a winter that peaked at 69%, squeezing the range a reader came for
 * into a tenth of the plot. Picking the step from this ladder keeps the
 * gridline count near eight whatever the range does.
 */
export function snowAxisScale(maxPercent: number): { top: number; step: number } {
  const raw = maxPercent * 1.08;
  for (const step of AXIS_STEPS) {
    const top = Math.max(150, Math.ceil(raw / step) * step);
    if (top / step <= 8) return { top, step };
  }
  return { top: Math.max(150, Math.ceil(raw / 500) * 500), step: 500 };
}

/**
 * Draws the season into `host`, and keeps it fitted as the host resizes.
 *
 * Returns how many days were drawn, and 0 when no day meets the reporting
 * floor -- the caller then says so in words rather than leaving axes around
 * nothing. The host is left empty in that case, never holding a stale curve.
 */
export function renderSnowCurve(
  host: HTMLElement, points: readonly CurvePoint[], ariaLabel: string
): number {
  const drawable = points.filter((point) => point.percent !== null);
  if (drawable.length < 2 || points.length < 2) {
    stopResponsiveChart(host);
    host.replaceChildren();
    return 0;
  }

  return renderResponsiveChart(host, (width) => {
  const chartWidth = Math.max(MINIMUM_WIDTH, width);
  const first = dayNumber(points[0]!.date);
  const span = Math.max(1, dayNumber(points[points.length - 1]!.date) - first);
  const plotWidth = chartWidth - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  /* The axis always reaches 150 so "just under normal" cannot fill the
   * frame and read as a good year; a genuinely big year extends it, with a
   * step that keeps the label count bounded (`snowAxisScale`). */
  const maxPercent = Math.max(...drawable.map((point) => point.percent as number));
  const { top, step } = snowAxisScale(maxPercent);
  const x = (date: string): number =>
    PAD_LEFT + ((dayNumber(date) - first) / span) * plotWidth;
  const y = (value: number): number =>
    PAD_TOP + plotHeight - (value / top) * plotHeight;

  const svg = element("svg", {
    class: "snow-curve",
    viewBox: `0 0 ${chartWidth} ${HEIGHT}`,
    role: "img",
    "aria-label": ariaLabel
  });

  for (let level = 0; level <= top; level += step) {
    const at = y(level);
    /* The line at normal is drawn after the season, not here with the grid:
     * see below. Its axis label still belongs with the other labels. */
    if (level !== 100) {
      svg.append(element("line", {
        class: "snow-grid",
        x1: PAD_LEFT, y1: at.toFixed(1), x2: chartWidth - PAD_RIGHT, y2: at.toFixed(1)
      }));
    }
    const label = element("text", {
      class: "snow-axis", x: PAD_LEFT - 6, y: (at + 3.5).toFixed(1),
      "text-anchor": "end"
    });
    label.textContent = level === 100 ? "Normal" : String(level);
    svg.append(label);
  }

  // A month tick on the first of each month in the series.
  for (const point of points) {
    if (!point.date.endsWith("-01")) continue;
    const at = x(point.date);
    svg.append(element("line", {
      class: "snow-grid snow-month-tick",
      x1: at.toFixed(1), y1: PAD_TOP + plotHeight,
      x2: at.toFixed(1), y2: PAD_TOP + plotHeight + 4
    }));
    const label = element("text", {
      class: "snow-axis", x: at.toFixed(1), y: HEIGHT - 8, "text-anchor": "middle"
    });
    label.textContent = MONTH_SHORT[Number(point.date.slice(5, 7)) - 1] ?? "";
    svg.append(label);
  }

  /* One polyline per unbroken run of values. A null is a day the floor was
   * not met, and the line must not invent a reading across it. */
  let run: string[] = [];
  const flush = (): void => {
    if (run.length > 1) {
      svg.append(element("polyline", { class: "snow-line", points: run.join(" ") }));
    } else if (run.length === 1) {
      const [pointX, pointY] = run[0]!.split(",");
      svg.append(element("circle", {
        class: "snow-line-dot", cx: pointX!, cy: pointY!, r: 1.5
      }));
    }
    run = [];
  };
  for (const point of points) {
    if (point.percent === null) { flush(); continue; }
    run.push(`${x(point.date).toFixed(1)},${y(point.percent).toFixed(1)}`);
  }
  flush();

  /* Normal, over the season rather than under it. This is the line the curve
   * is read against, so it cannot be the one thing the curve hides: drawn
   * with the gridlines it disappeared under the season wherever the two ran
   * together, which is exactly where a reader is asking whether snow is above
   * or below normal. The same rule puts the scatter's "usual level" guide
   * over its dots in `overview-charts.ts`.
   *
   * Drawn only when the gridline loop above reached exactly 100, which is
   * where its "Normal" axis label is written. The wider steps (250, 500) step
   * straight over it, and a line without its label is not a reference. */
  if (100 % step === 0) {
    svg.append(element("line", {
      class: "snow-normal-line",
      x1: PAD_LEFT, y1: y(100).toFixed(1), x2: chartWidth - PAD_RIGHT, y2: y(100).toFixed(1)
    }));
  }

  // The newest reading gets a marker and a spoken value.
  const latest = [...points].reverse().find((point) => point.percent !== null);
  if (latest) {
    const marker = element("circle", {
      class: "snow-latest",
      cx: x(latest.date).toFixed(1),
      cy: y(latest.percent as number).toFixed(1),
      r: 3.5
    });
    const title = document.createElementNS(SVG, "title");
    title.textContent = `Newest value: ${latest.percent}% of normal, ` +
      `from ${latest.reportingSites} sites.`;
    marker.append(title);
    svg.append(marker);
  }

  host.replaceChildren(svg);
  return drawable.length;
  }, { fallbackWidth: FALLBACK_WIDTH, minimumWidth: MINIMUM_WIDTH });
}
