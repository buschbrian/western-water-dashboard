/*
 * Precipitation since 1 October against the same stations' own history
 * (ADR-125).
 *
 * Hand-built SVG, measured from its host, the way the snow curve is. The
 * history is five regions that do not overlap, coloured from dry to wet:
 * driest years, drier years, the middle half, wetter years, wettest years.
 * Stacked translucent bands were tried first; their overlaps made colours the
 * legend could not name. This year is one line over them, with a halo in the
 * card's colour so it reads over every region. Snow water is not on this
 * chart: it is a different measurement, and the card states it beside the
 * headline instead, so one chart reads one thing.
 *
 * The chart draws a window of the water year. It opens on the season so far,
 * where a reader is looking in autumn, and can show the whole year; the
 * vertical scale fits the window shown. A rule marks the newest reading, and
 * the space after it says what it is: past years only.
 *
 * Every colour comes from CSS, so each theme sets its own. The axis title is
 * HTML above the chart (`precipitation-card.ts`), where it can wrap.
 */
import type { BandStep, DayValue } from "../precip-model";
import { formatDate } from "./format";
import { renderResponsiveChart, stopResponsiveChart } from "./responsive";

const SVG = "http://www.w3.org/2000/svg";
const FALLBACK_WIDTH = 640;
const HEIGHT = 320;
/** The shortest a caller may ask the chart to be, so the plot keeps room. */
export const PRECIPITATION_CHART_MIN_HEIGHT = 160;
export const PRECIPITATION_CHART_HEIGHT = HEIGHT;
const PAD_LEFT = 36;
const PAD_RIGHT = 14;
const PAD_TOP = 22;
const PAD_BOTTOM = 26;
const MINIMUM_WIDTH = PAD_LEFT + PAD_RIGHT + 120;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Closest two x labels may sit, in pixels, before every other one is dropped. */
const LABEL_GAP = 56;

/** Days past the newest reading the season view shows, and its least width. */
const SEASON_AHEAD_DAYS = 28;
const SEASON_MINIMUM_DAYS = 56;

export type PrecipitationRange = "season" | "year";

/** The five history regions, bottom to top, with the names the key uses. */
export const HISTORY_REGIONS = [
  { className: "precip-region-driest", label: "Driest years", lower: "lowest", upper: "low10" },
  { className: "precip-region-drier", label: "Drier years", lower: "low10", upper: "low25" },
  { className: "precip-region-middle", label: "Middle half of years", lower: "low25", upper: "high75" },
  { className: "precip-region-wetter", label: "Wetter years", lower: "high75", upper: "high90" },
  { className: "precip-region-wettest", label: "Wettest years", lower: "high90", upper: "highest" }
] as const satisfies readonly {
  className: string; label: string; lower: keyof BandStep; upper: keyof BandStep;
}[];

function element<K extends keyof SVGElementTagNameMap>(
  name: K, attributes: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / 86_400_000;
}

/** "1 Oct", "15 Nov": the day and the month together, so no label repeats. */
export function shortDate(date: string): string {
  return `${Number(date.slice(8))} ${MONTH_SHORT[Number(date.slice(5, 7)) - 1] ?? ""}`;
}

/** A gridline step from 1, 2 and 5 times a power of ten, keeping lines near five. */
export function inchAxisScale(maxInches: number): { top: number; step: number } {
  const raw = Math.max(1, maxInches * 1.05);
  for (let power = 0.1; ; power *= 10) {
    for (const multiple of [1, 2, 5]) {
      const step = multiple * power;
      if (raw / step <= 6) return { top: Math.ceil(raw / step) * step, step };
    }
  }
}

/**
 * The days a range shows. "season" runs from 1 October to four weeks past the
 * newest reading, never less than eight weeks and never past 30 September.
 */
export function rangeDays(
  bands: readonly BandStep[], newest: string, range: PrecipitationRange
): BandStep[] {
  if (range === "year") return [...bands];
  const first = dayNumber(bands[0]!.date);
  const end = Math.max(dayNumber(newest) + SEASON_AHEAD_DAYS, first + SEASON_MINIMUM_DAYS);
  return bands.filter((band) => dayNumber(band.date) <= end);
}

/**
 * Which days carry an x label. A short window labels the 1st and 15th of each
 * month ("1 Oct", "15 Oct"); the whole year labels months by name. Either way
 * every other label is dropped when they would sit closer than `LABEL_GAP`.
 */
export function xLabels(
  bands: readonly BandStep[], plotWidth: number
): { date: string; text: string }[] {
  const span = dayNumber(bands[bands.length - 1]!.date) - dayNumber(bands[0]!.date);
  const short = span < 120;
  const ticks = bands
    .filter((band) => band.date.endsWith("-01") || (short && band.date.endsWith("-15")))
    .map((band) => ({
      date: band.date,
      text: short ? shortDate(band.date) : MONTH_SHORT[Number(band.date.slice(5, 7)) - 1] ?? ""
    }));
  const spacing = ticks.length > 1 ? plotWidth / (ticks.length - 1) : plotWidth;
  return spacing < LABEL_GAP ? ticks.filter((_, index) => index % 2 === 0) : ticks;
}

function inches(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} in`;
}

export function renderPrecipitationCurve(
  host: HTMLElement, allBands: readonly BandStep[], precipitation: readonly DayValue[],
  range: PrecipitationRange, ariaLabel: string, chartHeight: number = HEIGHT
): boolean {
  const height = Math.max(PRECIPITATION_CHART_MIN_HEIGHT, Math.round(chartHeight));
  const newest = [...precipitation].reverse().find((day) => day.inches !== null);
  if (allBands.length < 2 || !newest) {
    stopResponsiveChart(host);
    host.replaceChildren();
    return false;
  }
  const bands = rangeDays(allBands, newest.date, range);
  const bandByDate = new Map(bands.map((band) => [band.date, band]));
  const shown = precipitation.filter((day) => bandByDate.has(day.date));

  renderResponsiveChart(host, (width) => {
    const chartWidth = Math.max(MINIMUM_WIDTH, width);
    const first = dayNumber(bands[0]!.date);
    const last = dayNumber(bands[bands.length - 1]!.date);
    const span = last - first;
    const plotWidth = chartWidth - PAD_LEFT - PAD_RIGHT;
    const plotHeight = height - PAD_TOP - PAD_BOTTOM;
    const plotBottom = PAD_TOP + plotHeight;
    const highest = Math.max(...bands.map((band) => band.highest),
      ...shown.map((day) => day.inches ?? 0));
    const { top, step } = inchAxisScale(highest);
    const x = (date: string): number => PAD_LEFT + ((dayNumber(date) - first) / span) * plotWidth;
    const y = (value: number): number => PAD_TOP + plotHeight - (value / top) * plotHeight;
    const at = (date: string, value: number): string => `${x(date).toFixed(1)},${y(value).toFixed(1)}`;

    const svg = element("svg", {
      class: "precip-curve", viewBox: `0 0 ${chartWidth} ${height}`,
      role: "img", "aria-label": ariaLabel, tabindex: 0
    });

    for (const region of HISTORY_REGIONS) {
      const points = [
        ...bands.map((b) => at(b.date, b[region.upper])),
        ...[...bands].reverse().map((b) => at(b.date, b[region.lower]))
      ];
      svg.append(element("polygon", { class: `precip-region ${region.className}`, points: points.join(" ") }));
    }

    /* Gridlines over the regions, faint, so a value can be read across them. */
    for (let level = 0; level <= top + 1e-9; level += step) {
      const lineY = y(level).toFixed(1);
      svg.append(element("line", {
        class: level === 0 ? "precip-baseline" : "precip-grid",
        x1: PAD_LEFT, y1: lineY, x2: chartWidth - PAD_RIGHT, y2: lineY
      }));
      const label = element("text", {
        class: "precip-axis", x: PAD_LEFT - 6, y: (Number(lineY) + 4).toFixed(1), "text-anchor": "end"
      });
      label.textContent = step < 1 ? level.toFixed(1) : String(Math.round(level));
      svg.append(label);
    }
    for (const tick of xLabels(bands, plotWidth)) {
      const tickX = x(tick.date).toFixed(1);
      svg.append(element("line", {
        class: "precip-tick", x1: tickX, y1: plotBottom, x2: tickX, y2: plotBottom + 4
      }));
      const label = element("text", { class: "precip-axis", x: tickX, y: height - 8, "text-anchor": "middle" });
      label.textContent = tick.text;
      svg.append(label);
    }

    svg.append(element("polyline", {
      class: "precip-median", points: bands.map((b) => at(b.date, b.median)).join(" ")
    }));

    /* The newest reading: a rule, its date, and a name for the space after
     * it, which holds past years only. */
    const latestX = x(newest.date);
    svg.append(element("line", {
      class: "precip-latest-rule", x1: latestX.toFixed(1), y1: PAD_TOP - 6, x2: latestX.toFixed(1), y2: plotBottom
    }));
    const futureWidth = chartWidth - PAD_RIGHT - latestX;
    const latestLabel = element("text", {
      class: "precip-note-label", x: (latestX + (futureWidth > 110 ? 4 : -4)).toFixed(1), y: PAD_TOP - 8,
      "text-anchor": futureWidth > 110 ? "start" : "end"
    });
    latestLabel.textContent = `Latest reading, ${shortDate(newest.date)}`;
    svg.append(latestLabel);
    if (futureWidth > 150) {
      const pastLabel = element("text", {
        class: "precip-note-label", x: (latestX + futureWidth / 2).toFixed(1), y: PAD_TOP + 14, "text-anchor": "middle"
      });
      pastLabel.textContent = "Past years after this date";
      svg.append(pastLabel);
    }

    for (const className of ["precip-line-halo", "precip-line"]) {
      let points: string[] = [];
      const flush = (): void => {
        if (points.length > 1) svg.append(element("polyline", { class: className, points: points.join(" ") }));
        points = [];
      };
      for (const day of shown) {
        if (day.inches === null) { flush(); continue; }
        points.push(at(day.date, day.inches));
      }
      flush();
    }

    /* End labels sit inside the plot, so no right-hand margin is spent on
     * them; each flips to the left of its point near the right edge. Width is
     * estimated from the type size (12px), which is enough to keep the two
     * labels apart: the median's moves below its line, or is left out when
     * that collides too -- the key above names it either way. */
    const textWidth = (text: string): number => text.length * 6.8;
    const placeLabel = (text: string, atX: number, atY: number) => {
      const flip = atX > chartWidth - PAD_RIGHT - textWidth(text) - 12;
      const left = flip ? atX - 8 - textWidth(text) : atX + 8;
      return { text, flip, x: flip ? atX - 8 : atX + 8, y: atY, left, right: left + textWidth(text) };
    };
    type Placed = ReturnType<typeof placeLabel>;
    const overlaps = (a: Placed, b: Placed): boolean =>
      a.left < b.right && b.left < a.right && Math.abs(a.y - b.y) < 15;
    const draw = (placed: Placed, className: string): void => {
      const node = element("text", {
        class: `precip-end-label ${className}`, x: placed.x.toFixed(1), y: placed.y.toFixed(1),
        "text-anchor": placed.flip ? "end" : "start"
      });
      node.textContent = placed.text;
      svg.append(node);
    };
    const precipY = y(newest.inches as number);
    const precipLabel = placeLabel(`This year · ${inches(newest.inches)}`, latestX,
      Math.min(precipY, plotBottom - 10) + 4);
    draw(precipLabel, "precip-end-precip");
    const medianEnd = bands[bands.length - 1]!;
    const medianY = y(medianEnd.median);
    const medianLabel = [medianY - 8, medianY + 16]
      .map((labelY) => placeLabel("Median year", x(medianEnd.date), Math.min(labelY, plotBottom - 6)))
      .find((placed) => !overlaps(placed, precipLabel));
    if (medianLabel) draw(medianLabel, "precip-end-median");
    svg.append(element("circle", {
      class: "precip-latest", cx: latestX.toFixed(1), cy: precipY.toFixed(1), r: 5
    }));

    /* The hover layer: a crosshair and a readout for the day under the
     * pointer, and the same for the arrow keys once the chart has focus. */
    const crosshair = element("line", {
      class: "precip-crosshair", x1: 0, y1: PAD_TOP, x2: 0, y2: plotBottom, visibility: "hidden"
    });
    svg.append(crosshair);
    const tip = document.createElement("div");
    tip.className = "precip-tooltip";
    tip.hidden = true;
    const precipByDate = new Map(shown.map((day) => [day.date, day.inches]));
    let focusDay = dayNumber(newest.date);
    const show = (day: number): void => {
      focusDay = Math.min(last, Math.max(first, Math.round(day)));
      const date = new Date(focusDay * 86_400_000).toISOString().slice(0, 10);
      const lineX = x(date);
      crosshair.setAttribute("x1", lineX.toFixed(1));
      crosshair.setAttribute("x2", lineX.toFixed(1));
      crosshair.setAttribute("visibility", "visible");
      /* The model's own band for the day: the same numbers the headline and
       * the table use, never a second interpolation here. */
      const dayBand = bandByDate.get(date);
      const rows: [string, string][] = [];
      if (precipByDate.has(date)) rows.push(["This year", inches(precipByDate.get(date) ?? null)]);
      if (dayBand) {
        rows.push(["Median year", inches(dayBand.median)]);
        rows.push(["Middle half of years", `${dayBand.low25.toFixed(1)}–${dayBand.high75.toFixed(1)} in`]);
        rows.push(["Driest to wettest year", `${dayBand.lowest.toFixed(1)}–${dayBand.highest.toFixed(1)} in`]);
      }
      const title = document.createElement("strong");
      title.textContent = formatDate(date);
      tip.replaceChildren(title, ...rows.map(([name, value]) => {
        const row = document.createElement("span");
        row.textContent = `${name}: ${value}`;
        return row;
      }));
      tip.hidden = false;
      const fraction = lineX / chartWidth;
      tip.style.left = `${(fraction * 100).toFixed(2)}%`;
      tip.style.transform = fraction > 0.55 ? "translateX(calc(-100% - 10px))" : "translateX(10px)";
    };
    const hide = (): void => {
      crosshair.setAttribute("visibility", "hidden");
      tip.hidden = true;
    };
    const showAt = (event: PointerEvent): void => {
      const box = svg.getBoundingClientRect();
      const svgX = ((event.clientX - box.left) / box.width) * chartWidth;
      show(first + ((svgX - PAD_LEFT) / plotWidth) * span);
    };
    svg.addEventListener("pointermove", showAt);
    /* A tap gives no hover. It reads the day it touched, and the reading
     * stays after the finger lifts, because a touch pointer leaves the
     * chart as soon as it is lifted. */
    svg.addEventListener("pointerdown", showAt);
    svg.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "touch") hide();
    });
    svg.addEventListener("blur", hide);
    svg.addEventListener("focus", () => show(focusDay));
    svg.addEventListener("keydown", (event) => {
      const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, PageUp: -7, PageDown: 7 };
      const move = moves[event.key];
      if (move === undefined) return;
      event.preventDefault();
      show(focusDay + move);
    });

    host.replaceChildren(svg, tip);
    return true;
  }, { fallbackWidth: FALLBACK_WIDTH, minimumWidth: MINIMUM_WIDTH });
  return true;
}
