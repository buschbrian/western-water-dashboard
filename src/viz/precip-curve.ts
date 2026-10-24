/*
 * Precipitation since 1 October against the same stations' own history, with
 * the snow water they hold now (ADR-122).
 *
 * Hand-built SVG, measured from its host, the way the snow curve is. The
 * history is three bands and a median: the highest and lowest year, eight
 * years in ten, and the middle half. This year is two lines over them, one
 * for what has fallen and one for what is in the snow now; the space between
 * them is hatched, because that is water that fell and is not stored as snow.
 *
 * Every colour that is not data comes from CSS, so the dark theme keeps the
 * axis readable. The two series colours are tokens in `snow.css`, validated
 * for colour-vision separation in both themes, and each line also carries its
 * name at its end so identity never rests on colour alone.
 */
import type { BandStep, DayValue } from "../precip-model";
import { valueOnDate } from "../precip-model";
import { formatDate } from "./format";
import { renderResponsiveChart, stopResponsiveChart } from "./responsive";

const SVG = "http://www.w3.org/2000/svg";
const FALLBACK_WIDTH = 640;
const HEIGHT = 340;
const PAD_LEFT = 40;
const PAD_RIGHT = 92;
const PAD_TOP = 12;
const PAD_BOTTOM = 24;
const MINIMUM_WIDTH = PAD_LEFT + PAD_RIGHT + 80;
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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

function isoDay(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** A gridline step from 1, 2 and 5 times a power of ten, keeping lines near six. */
export function inchAxisScale(maxInches: number): { top: number; step: number } {
  const raw = Math.max(1, maxInches * 1.05);
  for (let power = 0.1; ; power *= 10) {
    for (const multiple of [1, 2, 5]) {
      const step = multiple * power;
      if (raw / step <= 7) return { top: Math.ceil(raw / step) * step, step };
    }
  }
}

function inches(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)} in`;
}

export function renderPrecipitationCurve(
  host: HTMLElement, bands: readonly BandStep[], precipitation: readonly DayValue[],
  snowWater: readonly DayValue[], ariaLabel: string
): boolean {
  const drawn = precipitation.filter((day) => day.inches !== null);
  if (bands.length < 2 || drawn.length === 0) {
    stopResponsiveChart(host);
    host.replaceChildren();
    return false;
  }
  const bandDates = bands.map((band) => band.date);
  const curve = (pick: (band: BandStep) => number): number[] => bands.map(pick);

  renderResponsiveChart(host, (width) => {
    const chartWidth = Math.max(MINIMUM_WIDTH, width);
    const first = dayNumber(bands[0]!.date);
    const last = dayNumber(bands[bands.length - 1]!.date);
    const plotWidth = chartWidth - PAD_LEFT - PAD_RIGHT;
    const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const highest = Math.max(...bands.map((band) => band.highest),
      ...drawn.map((day) => day.inches as number));
    const { top, step } = inchAxisScale(highest);
    const x = (date: string): number => PAD_LEFT + ((dayNumber(date) - first) / (last - first)) * plotWidth;
    const y = (value: number): number => PAD_TOP + plotHeight - (value / top) * plotHeight;
    const at = (date: string, value: number): string => `${x(date).toFixed(1)},${y(value).toFixed(1)}`;

    const svg = element("svg", {
      class: "precip-curve", viewBox: `0 0 ${chartWidth} ${HEIGHT}`,
      role: "img", "aria-label": ariaLabel, tabindex: 0
    });
    const defs = element("defs", {});
    const hatch = element("pattern", {
      id: "precip-gap-hatch", width: 6, height: 6,
      patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)"
    });
    hatch.append(element("line", { class: "precip-gap-stroke", x1: 0, y1: 0, x2: 0, y2: 6 }));
    defs.append(hatch);
    svg.append(defs);

    for (let level = 0; level <= top + 1e-9; level += step) {
      const lineY = y(level).toFixed(1);
      svg.append(element("line", {
        class: "snow-grid", x1: PAD_LEFT, y1: lineY, x2: chartWidth - PAD_RIGHT, y2: lineY
      }));
      const label = element("text", {
        class: "snow-axis", x: PAD_LEFT - 6, y: (Number(lineY) + 3.5).toFixed(1), "text-anchor": "end"
      });
      label.textContent = step < 1 ? level.toFixed(1) : String(Math.round(level));
      svg.append(label);
    }
    for (let day = first; day <= last; day += 1) {
      const date = isoDay(day);
      if (!date.endsWith("-01")) continue;
      const tickX = x(date).toFixed(1);
      svg.append(element("line", {
        class: "snow-grid snow-month-tick",
        x1: tickX, y1: PAD_TOP + plotHeight, x2: tickX, y2: PAD_TOP + plotHeight + 4
      }));
      const label = element("text", { class: "snow-axis", x: tickX, y: HEIGHT - 8, "text-anchor": "middle" });
      label.textContent = MONTH_SHORT[Number(date.slice(5, 7)) - 1] ?? "";
      svg.append(label);
    }

    const band = (className: string, upper: (b: BandStep) => number, lower: (b: BandStep) => number): void => {
      const points = [
        ...bands.map((b) => at(b.date, upper(b))),
        ...[...bands].reverse().map((b) => at(b.date, lower(b)))
      ];
      svg.append(element("polygon", { class: className, points: points.join(" ") }));
    };
    band("precip-band precip-band-range", (b) => b.highest, (b) => b.lowest);
    band("precip-band precip-band-eight", (b) => b.high90, (b) => b.low10);
    band("precip-band precip-band-half", (b) => b.high75, (b) => b.low25);
    svg.append(element("polyline", {
      class: "precip-median", points: bands.map((b) => at(b.date, b.median)).join(" ")
    }));

    /* The hatch between the two lines, one polygon per run of days on which
     * both have a value. */
    const snowByDate = new Map(snowWater.map((day) => [day.date, day.inches]));
    let run: { date: string; rain: number; snow: number }[] = [];
    const flushGap = (): void => {
      if (run.length > 1) {
        const points = [
          ...run.map((day) => at(day.date, day.rain)),
          ...[...run].reverse().map((day) => at(day.date, day.snow))
        ];
        svg.append(element("polygon", { class: "precip-gap", points: points.join(" ") }));
      }
      run = [];
    };
    for (const day of precipitation) {
      const snow = snowByDate.get(day.date) ?? null;
      if (day.inches === null || snow === null) { flushGap(); continue; }
      run.push({ date: day.date, rain: day.inches, snow: Math.min(snow, day.inches) });
    }
    flushGap();

    const line = (series: readonly DayValue[], className: string): void => {
      let points: string[] = [];
      const flush = (): void => {
        if (points.length > 1) svg.append(element("polyline", { class: className, points: points.join(" ") }));
        points = [];
      };
      for (const day of series) {
        if (day.inches === null) { flush(); continue; }
        points.push(at(day.date, day.inches));
      }
      flush();
    };
    line(snowWater, "precip-snow-line");
    line(precipitation, "precip-line");

    /* Names at the line ends, nudged apart when the two ends are close. */
    /* Kept above the month labels: a line at zero would otherwise put its
     * name on the axis. */
    const lowestLabelY = PAD_TOP + plotHeight - 8;
    const newest = [...precipitation].reverse().find((day) => day.inches !== null)!;
    const newestSnow = [...snowWater].reverse().find((day) => day.inches !== null);
    const precipY = y(newest.inches as number);
    let snowY = newestSnow ? y(newestSnow.inches as number) : null;
    let labelPrecipY = precipY;
    if (snowY !== null) snowY = Math.min(snowY, lowestLabelY);
    if (snowY !== null && Math.abs(snowY - precipY) < 13) {
      labelPrecipY = Math.min(precipY, snowY) - 7;
      snowY = labelPrecipY + 13;
    }
    const endLabel = (text: string, lineX: number, lineY: number, className: string): void => {
      const labelY = Math.min(lineY, lowestLabelY);
      const label = element("text", { class: `precip-end-label ${className}`, x: (lineX + 6).toFixed(1), y: (labelY + 3.5).toFixed(1) });
      label.textContent = text;
      svg.append(label);
    };
    endLabel("Precipitation", x(newest.date), labelPrecipY, "precip-end-precip");
    if (newestSnow && snowY !== null) endLabel("Snow water", x(newestSnow.date), snowY, "precip-end-snow");
    svg.append(element("circle", { class: "precip-latest", cx: x(newest.date).toFixed(1), cy: precipY.toFixed(1), r: 4 }));
    const medianEnd = bands[bands.length - 1]!;
    endLabel("Median year", x(medianEnd.date) - 4, y(medianEnd.median), "precip-end-median");

    /* The hover layer: a crosshair and a readout for the day under the
     * pointer, and the same for the arrow keys once the chart has focus. */
    const crosshair = element("line", {
      class: "precip-crosshair", x1: 0, y1: PAD_TOP, x2: 0, y2: PAD_TOP + plotHeight, visibility: "hidden"
    });
    svg.append(crosshair);
    const tip = document.createElement("div");
    tip.className = "precip-tooltip";
    tip.hidden = true;
    const precipByDate = new Map(precipitation.map((day) => [day.date, day.inches]));
    let focusDay = dayNumber(newest.date);
    const show = (day: number): void => {
      focusDay = Math.min(last, Math.max(first, Math.round(day)));
      const date = isoDay(focusDay);
      const lineX = x(date);
      crosshair.setAttribute("x1", lineX.toFixed(1));
      crosshair.setAttribute("x2", lineX.toFixed(1));
      crosshair.setAttribute("visibility", "visible");
      const median = valueOnDate(curve((b) => b.median), bandDates, date);
      const low = valueOnDate(curve((b) => b.low25), bandDates, date);
      const high = valueOnDate(curve((b) => b.high75), bandDates, date);
      const rows: [string, string][] = [];
      if (precipByDate.has(date)) {
        rows.push(["Precipitation", inches(precipByDate.get(date) ?? null)]);
        rows.push(["Snow water", inches(snowByDate.get(date) ?? null)]);
      }
      rows.push(["Median year", inches(median)]);
      if (low !== null && high !== null) rows.push(["Middle half of years", `${low.toFixed(1)}–${high.toFixed(1)} in`]);
      const title = document.createElement("strong");
      title.textContent = formatDate(date);
      tip.replaceChildren(title, ...rows.map(([label, value]) => {
        const row = document.createElement("span");
        row.textContent = `${label}: ${value}`;
        return row;
      }));
      tip.hidden = false;
      const fraction = lineX / chartWidth;
      tip.style.left = `${(fraction * 100).toFixed(2)}%`;
      tip.style.transform = fraction > 0.6 ? "translateX(calc(-100% - 10px))" : "translateX(10px)";
    };
    const hide = (): void => {
      crosshair.setAttribute("visibility", "hidden");
      tip.hidden = true;
    };
    svg.addEventListener("pointermove", (event) => {
      const box = svg.getBoundingClientRect();
      const svgX = ((event.clientX - box.left) / box.width) * chartWidth;
      show(first + ((svgX - PAD_LEFT) / plotWidth) * (last - first));
    });
    svg.addEventListener("pointerleave", hide);
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
