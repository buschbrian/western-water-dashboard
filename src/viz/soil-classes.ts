/*
 * The soil-moisture map's classes, in one table (ADR-142).
 *
 * Same rule as every other table here (ADR-008): the area fills, the site
 * markers and the key read these rows, so a break cannot move on one
 * surface and not another.
 *
 * The figure is a change, the week's difference in percentage points at
 * the same sensors, so the table diverges: brown drier, a pale neutral for
 * steady, blue wetter. **The two ends are the snow table's two ends**
 * (`SNOW_CLASSES`, Crameri roma), taken from it rather than copied, so the
 * precipitation map keeps one colour language in both of its modes: blue
 * is wet on every map on this site. The four colours between were chosen
 * and then measured, not picked by eye: lightness rises from each end to
 * the neutral, no two neighbours are hard to tell apart under the three
 * common colour-vision deficiencies, every class stays visible as a
 * translucent fill, and none is near a storage, drought or drought-change
 * colour. `soil-classes.test.ts` holds each of those.
 *
 * The breaks are the ones decided for phase one (decision R6): drier by 5
 * or more and by 2 to 5, within 2, then wetter by 2 to 5, 5 to 10 and 10
 * or more. Wetter has one class more than drier because soil wets fast in
 * a storm and dries slowly after it: a week rarely dries a sensor by ten
 * points. Within 2 points is steady: smaller moves are the daily noise of
 * these sensors.
 */
import { SNOW_CLASSES } from "./snow-classes";

export interface SoilClass {
  /** -1 drier, 0 steady, 1 wetter. */
  direction: -1 | 0 | 1;
  /** Inclusive lower bound of the size of the change, in points. */
  min: number;
  /** Exclusive upper bound, or null for an open end. */
  max: number | null;
  label: string;
  color: string;
}

/** A change smaller than this, either way, is steady. */
export const SOIL_STEADY_POINTS = 2;

export const SOIL_CLASSES: readonly SoilClass[] = [
  { direction: -1, min: 5, max: null, label: "Drier by 5 points or more", color: SNOW_CLASSES[0]!.color },
  { direction: -1, min: SOIL_STEADY_POINTS, max: 5, label: "Drier by 2 to 5 points", color: "#c4955a" },
  { direction: 0, min: 0, max: SOIL_STEADY_POINTS, label: "Within 2 points: steady", color: "#e6e0d4" },
  { direction: 1, min: SOIL_STEADY_POINTS, max: 5, label: "Wetter by 2 to 5 points", color: "#8fcbd3" },
  { direction: 1, min: 5, max: 10, label: "Wetter by 5 to 10 points", color: "#4fa3c9" },
  { direction: 1, min: 10, max: null, label: "Wetter by 10 points or more", color: SNOW_CLASSES[SNOW_CLASSES.length - 1]!.color }
];

/** A station with no change for the week, or an area with too few. The
 * precipitation map's own grey, so "no value" looks the same in both modes. */
export { PRECIP_NO_VALUE_COLOR as SOIL_NO_VALUE_COLOR } from "./precip-classes";

/** The class a change in points falls in, or -1 for no number. */
export function soilClassIndex(points: number | null | undefined): number {
  if (points === null || points === undefined || !Number.isFinite(points)) return -1;
  const size = Math.abs(points);
  const direction = size < SOIL_STEADY_POINTS ? 0 : points < 0 ? -1 : 1;
  return SOIL_CLASSES.findIndex((entry) => entry.direction === direction
    && size >= entry.min && (entry.max === null || size < entry.max));
}

/** The change in words, the direction carried by a word rather than a sign:
 * "3.2 points wetter" reads aloud correctly and "+3.2" does not. */
export function soilChangeText(points: number | null | undefined): string {
  if (points === null || points === undefined || !Number.isFinite(points)) return "No change measured";
  const size = Math.abs(points);
  if (size < 0.05) return "No change";
  return `${size.toFixed(1)} point${size === 1 ? "" : "s"} ${points < 0 ? "drier" : "wetter"}`;
}
