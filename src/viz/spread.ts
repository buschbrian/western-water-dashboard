/*
 * The spread of percent full within each drainage area, hand-built.
 *
 * ## Why this is not the charts SDK
 *
 * It was, and the SDK could not colour it. A box plot there draws one series
 * however many categories it has, and every colour API is per series, so
 * `colorMatch` over a unique-value renderer, over a class-breaks renderer and
 * over a continuous visual variable all came back with one flat colour --
 * `seriesLength` never rose above 1, so there was never more than one box's
 * worth of colour to set. `splitByField` does make more series, and also
 * reserves a lane for each of them inside every category, so each box drew at
 * a fifth of its row height: a sliver floating at whatever height its class
 * sorted to. Four approaches, one outcome.
 *
 * Every box carries its own colour here, from the same table the map circles
 * and the bars above are drawn from (ADR-008). What a colour means on this
 * chart is what it means everywhere else on the site.
 *
 * The other three charts on the drought page are hand-built SVG for the same
 * reasons and this one joins them: a few dozen rows need no chart SDK, the
 * label lane is ours to size so a two-line area name cannot collide with its
 * neighbour, and everything that is not data takes its colour from CSS so
 * both themes stay readable.
 *
 * ## What each box is coloured by
 *
 * The area's own middle value -- the line inside the box a reader is looking
 * at -- and not its mean. A box coloured from a statistic the chart never
 * draws would be a third quantity to decode.
 *
 * The whiskers and the outliers are neutral. A whisker is a reach, not a
 * level, and an outlier's own value is already its position on the axis; a
 * class colour on either would be the same claim made twice, in a place where
 * the two could disagree by a pixel.
 */
import type { SpreadBox } from "../overview-model";
import { storageColor } from "./classes";
import { drainageLabel } from "./format";
import { renderResponsiveChart, stopResponsiveChart } from "./responsive";

const SVG = "http://www.w3.org/2000/svg";

const FALLBACK_WIDTH = 640;
/* Two lines of area name and the leading between them, which is what the
 * SDK version could not give a row: at one line per row "Southern Oregon
 * Coastal" and "Northern California Coastal" ran together. */
const ROW_HEIGHT = 26;
const PAD_TOP = 26;
const PAD_BOTTOM = 38;
/* The measured lane the drought page's ranked charts use, for the longest
 * drainage-area name this data carries. */
const PAD_LEFT = 162;
/* Wide enough for the right-aligned sample count beside each row, which is
 * the one number a reader needs to weigh a box on a chart whose subject is
 * its outliers: a three-reservoir box and a forty-reservoir box are drawn
 * identically, and the count is the difference. */
const PAD_RIGHT = 40;
const BOX_HEIGHT = 13;
const OUTLIER_RADIUS = 3;

/** Percent full runs 0 to 100 whatever is on the chart, so a box's width
 * means the same thing on every render and between one filter and the next.
 * A reservoir operating a surcharge above its conservation pool keeps it and
 * publishes just above 100 (ADR-072); over-range marks are drawn as
 * over-range below rather than given axis headroom. */
const AXIS_MAX = 100;

function element<K extends keyof SVGElementTagNameMap>(
  name: K, attributes: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, String(value));
  }
  return node;
}

export interface SpreadOptions {
  ariaLabel: string;
}

/**
 * Returns the number of areas drawn. Nothing is drawn for an empty list, so
 * the caller says why in words rather than framing an empty box.
 */
export function renderSpread(
  host: HTMLElement,
  boxes: readonly SpreadBox[],
  options: SpreadOptions
): number {
  if (boxes.length === 0) {
    stopResponsiveChart(host);
    host.replaceChildren();
    return 0;
  }

  return renderResponsiveChart(host, (width) => {
  const chartWidth = Math.max(PAD_LEFT + PAD_RIGHT + 80, width);
  const height = PAD_TOP + boxes.length * ROW_HEIGHT + PAD_BOTTOM;
  const plotWidth = chartWidth - PAD_LEFT - PAD_RIGHT;
  const x = (percent: number): number =>
    PAD_LEFT + (Math.min(AXIS_MAX, Math.max(0, percent)) / AXIS_MAX) * plotWidth;

  const svg = element("svg", {
    viewBox: `0 0 ${chartWidth} ${height}`,
    class: "spread-chart",
    role: "img",
    "aria-label": options.ariaLabel
  });
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  /* Gridlines every 25 points with their labels under them, drawn first so
   * every box and dot sits over them. */
  for (const tick of [0, 25, 50, 75, 100]) {
    svg.append(element("line", {
      x1: x(tick), x2: x(tick), y1: PAD_TOP - 8, y2: height - PAD_BOTTOM + 4,
      class: "spread-grid"
    }));
    const label = element("text", {
      x: x(tick), y: height - PAD_BOTTOM + 20, class: "spread-axis",
      "text-anchor": "middle"
    });
    label.textContent = `${tick}%`;
    svg.append(label);
  }
  const axisTitle = element("text", {
    x: PAD_LEFT + plotWidth / 2, y: height - PAD_BOTTOM + 33,
    class: "spread-axis", "text-anchor": "middle"
  });
  axisTitle.textContent = "Percent full";
  svg.append(axisTitle);

  boxes.forEach((box, index) => {
    const y = PAD_TOP + index * ROW_HEIGHT + ROW_HEIGHT / 2;
    /* One group per row with its own `title` inside it: a `title` on the root
     * becomes the whole chart's accessible name and every later one is
     * ignored, so every row would share one description. */
    const group = element("g", { class: "spread-row" });

    /* The whisker first, so the box and the caps draw over its ends. An
     * over-range high keeps its whisker at the axis edge and gets a chevron
     * instead of a flat cap: a flat cap on the axis maximum is
     * indistinguishable from one ending at 100.0, and three of the five
     * surcharges published today sit in one such row. */
    group.append(element("line", {
      x1: x(box.low), x2: x(box.high), y1: y, y2: y, class: "spread-whisker"
    }));
    if (box.high > AXIS_MAX) {
      const edge = x(AXIS_MAX);
      const cap = BOX_HEIGHT / 3;
      group.append(element("polyline", {
        points: `${edge},${y - cap} ${edge + 6},${y} ${edge},${y + cap}`,
        class: "spread-cap spread-cap-over",
        fill: "none"
      }));
    } else {
      group.append(element("line", {
        x1: x(box.high), x2: x(box.high),
        y1: y - BOX_HEIGHT / 3, y2: y + BOX_HEIGHT / 3,
        class: "spread-cap"
      }));
    }
    group.append(element("line", {
      x1: x(box.low), x2: x(box.low), y1: y - BOX_HEIGHT / 3,
      y2: y + BOX_HEIGHT / 3, class: "spread-cap"
    }));

    group.append(element("rect", {
      x: x(box.p25), y: y - BOX_HEIGHT / 2,
      /* A box whose quartiles coincide is still a mark rather than nothing:
         an area where every reservoir sits at the same level is a real
         answer and a reader has to be able to see it. */
      width: Math.max(x(box.p75) - x(box.p25), 1.5), height: BOX_HEIGHT,
      fill: storageColor(box.median),
      class: "spread-box"
    }));
    group.append(element("line", {
      x1: x(box.median), x2: x(box.median),
      y1: y - BOX_HEIGHT / 2, y2: y + BOX_HEIGHT / 2,
      class: "spread-median"
    }));

    for (const outlier of box.outliers) {
      const over = outlier.value > AXIS_MAX;
      /* An over-range outlier reads as clipped: a triangle at the axis edge
       * rather than a circle identical to an in-range one. The `<title>`
       * carries the true figure either way. */
      const dot = over
        ? element("polygon", {
            points: [
              `${x(AXIS_MAX) + OUTLIER_RADIUS},${y - OUTLIER_RADIUS}`,
              `${x(AXIS_MAX) + OUTLIER_RADIUS},${y + OUTLIER_RADIUS}`,
              `${x(AXIS_MAX) - OUTLIER_RADIUS * 0.6},${y}`
            ].join(" "),
            class: "spread-outlier"
          })
        : element("circle", {
            cx: x(outlier.value), cy: y, r: OUTLIER_RADIUS, class: "spread-outlier"
          });
      /* Its own name, because an outlier is a reservoir a reader is meant to
         go and look at rather than a stray mark. */
      const dotTitle = element("title", {});
      dotTitle.textContent = `${outlier.label}: ${outlier.value.toFixed(1)}% full`;
      dot.append(dotTitle);
      group.append(dot);
    }

    /* The sample count in its own margin, right-aligned: the count is what a
     * reader weighs an outlier chart against, and putting it inside the name
     * would overflow the lane on long names. What it is is said in the
     * page's copy beside the chart. */
    const countLabel = element("text", {
      x: chartWidth - 4, y: y + 3.5, class: "spread-count", "text-anchor": "end"
    });
    countLabel.textContent = String(box.count);
    group.append(countLabel);

    const name = element("text", {
      x: PAD_LEFT - 10, y: y + 4, class: "spread-name", "text-anchor": "end"
    });
    name.textContent = drainageLabel(box.group, box.groupStates);

    const title = element("title", {});
    const outlierWords = box.outliers.length === 0 ? ""
      : ` ${box.outliers.length} outside the whiskers: `
        + `${box.outliers.map((entry) => entry.label).join(", ")}.`;
    title.textContent =
      `${drainageLabel(box.group, box.groupStates)}: middle value ${box.median.toFixed(1)}% full `
      + `across ${box.count} ${box.count === 1 ? "reservoir" : "reservoirs"}. `
      + `Middle half ${box.p25.toFixed(1)}% to ${box.p75.toFixed(1)}%. `
      + `Range ${box.low.toFixed(1)}% to ${box.high.toFixed(1)}%.${outlierWords}`;
    group.prepend(title);
    group.append(name);
    svg.append(group);
  });

  host.replaceChildren(svg);
  return boxes.length;
  }, { fallbackWidth: FALLBACK_WIDTH, minimumWidth: PAD_LEFT + PAD_RIGHT + 80 });
}
