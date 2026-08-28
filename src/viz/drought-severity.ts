/*
 * How many drainage areas sit at each severity, all of them at once.
 *
 * The page reported this as a single number -- "areas in extreme drought or
 * worse: N of 14" -- which is a threshold count, and a threshold count hides
 * the shape behind it. A week where the other nine areas are clear and a week
 * where all nine are sitting one class below the line produce the same
 * headline and are not the same week.
 *
 * Each area is counted once, at its own worst class, so the bars sum to the
 * number of areas. That is the difference between this and the coverage bars
 * further down the page: those describe how one area is divided, this
 * describes how the areas are divided.
 *
 * Every level is drawn whether or not any area is at it. Dropping the empty
 * ones would give a chart with different bars every week, which cannot be
 * compared with last week's by eye -- and the empty levels are themselves the
 * finding in a good year.
 *
 * Colour comes from `DROUGHT_CLASSES`, the monitor's own palette and the same
 * table the map and every other chart here read (ADR-008).
 */
import type { WorstClassCount } from "../drought-model";

const SVG = "http://www.w3.org/2000/svg";

const WIDTH = 640;
const HEIGHT = 220;
const PAD_TOP = 16;
const PAD_BOTTOM = 52;
const PAD_LEFT = 34;
const PAD_RIGHT = 14;

/** The grey the "no drought" bar takes -- the absence of a class, not a class. */
const NO_CLASS_COLOR = "#9aa5ad";

/* Whole numbers only: an area is counted or it is not, so a step of 2.5 areas
 * would offer a reading that cannot happen. */
const AXIS_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500] as const;

/** Gridline count the ladder aims to stay under. */
const MOST_TICKS = 8;

/**
 * The axis top and the whole-area step for the tallest bar.
 *
 * A step of one was right for fourteen drainage areas and wrong the moment
 * the roster went west. The tick loop drew a gridline and a label for every
 * whole area, so 23 basins at their worst class put 24 labels into 152
 * pixels of axis -- the numbers ran together into a grey smear and the plot
 * behind them read as hatching. At the subbasin size it drew 153.
 *
 * Picking the step from this ladder keeps the label count near eight however
 * many areas are in view, and every step on it is a whole number of areas, so
 * the reason the old step existed survives. The top is rounded up to a
 * multiple of the step so the axis ends on a drawn gridline, which also gives
 * the tallest bar's own figure room above it.
 */
export function severityAxisScale(highest: number): { top: number; step: number } {
  const areas = Math.max(1, Math.ceil(highest));
  for (const step of AXIS_STEPS) {
    const top = Math.ceil(areas / step) * step;
    if (top / step <= MOST_TICKS) return { top, step };
  }
  const step = AXIS_STEPS[AXIS_STEPS.length - 1]!;
  return { top: Math.ceil(areas / step) * step, step };
}

function element<K extends keyof SVGElementTagNameMap>(
  name: K, attributes: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

/**
 * Draws the distribution. Returns how many areas it accounted for, which the
 * page reports: a chart that silently dropped an area would otherwise look
 * exactly like one that had fewer to draw.
 */
export function renderDroughtSeverity(
  host: HTMLElement,
  counts: readonly WorstClassCount[],
  ariaLabel: string
): number {
  host.replaceChildren();
  const total = counts.reduce((sum, entry) => sum + entry.count, 0);
  if (counts.length === 0) return 0;

  const svg = element("svg", {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    class: "drought-severity-chart",
    role: "img",
    "aria-label": ariaLabel
  });
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  /* The axis is a whole number of areas, so the ticks are whole areas too:
   * a count of areas has no fractional values and an axis that offers them
   * invites a reading that cannot happen. How many areas one tick is worth
   * comes from `severityAxisScale`, because at one area a tick the labels
   * collided as soon as the roster grew. */
  const { top, step: tickStep } =
    severityAxisScale(Math.max(1, ...counts.map((entry) => entry.count)));
  const step = plotWidth / counts.length;
  const barWidth = Math.min(64, step * 0.62);
  const y = (count: number): number =>
    PAD_TOP + plotHeight - (count / top) * plotHeight;

  for (let tick = 0; tick <= top; tick += tickStep) {
    svg.append(element("line", {
      x1: PAD_LEFT, x2: WIDTH - PAD_RIGHT, y1: y(tick), y2: y(tick),
      class: "drought-severity-grid"
    }));
    const label = element("text", {
      x: PAD_LEFT - 8, y: y(tick) + 4, class: "drought-severity-axis",
      "text-anchor": "end"
    });
    label.textContent = String(tick);
    svg.append(label);
  }

  counts.forEach((entry, index) => {
    const centre = PAD_LEFT + step * index + step / 2;
    const group = element("g", { class: "drought-severity-bar" });

    const title = element("title", {});
    const areas = entry.count === 1 ? "1 drainage area" : `${entry.count} drainage areas`;
    title.textContent = `${entry.label}: ${areas}.`;
    group.append(title);

    /* A bar of zero still gets its label and its place on the axis, and no
     * rectangle. Drawing a hairline instead would read as a small value. */
    if (entry.count > 0) {
      group.append(element("rect", {
        x: centre - barWidth / 2, y: y(entry.count),
        width: barWidth, height: PAD_TOP + plotHeight - y(entry.count),
        fill: entry.color ?? NO_CLASS_COLOR,
        class: "drought-severity-rect"
      }));
      const value = element("text", {
        x: centre, y: y(entry.count) - 6, class: "drought-severity-value",
        "text-anchor": "middle"
      });
      value.textContent = String(entry.count);
      group.append(value);
    }

    /* The class code under the bar, and its full name in the key beside the
     * chart -- five full names across 640 pixels overlap at every width. */
    const tick = element("text", {
      x: centre, y: HEIGHT - PAD_BOTTOM + 20, class: "drought-severity-tick",
      "text-anchor": "middle"
    });
    tick.textContent = entry.entry ? entry.entry.code : "None";
    group.append(tick);

    svg.append(group);
  });

  const caption = element("text", {
    x: PAD_LEFT, y: HEIGHT - 10, class: "drought-severity-caption"
  });
  caption.textContent = `${total} drainage areas, each counted at its own worst class`;
  svg.append(caption);

  host.append(svg);
  return total;
}
