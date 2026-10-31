/*
 * The precipitation map's classes, in one table (ADR-131).
 *
 * Same rule as the storage, drought and snow tables (ADR-008): the area
 * fills, the site markers and the key read these rows, so a break cannot
 * move on one surface and not another.
 *
 * **The colours are the snow map's six, in the same order** (`SNOW_CLASSES`,
 * Crameri roma): dry earth through pale olive to water. Blue means wet on
 * every map on this site, and a reader who has learned the snow map reads
 * this one without its key. Taken from that table rather than copied, so
 * the two cannot drift. The ramp is colour-vision-deficiency safe and reads
 * in greyscale, which is why it was chosen there.
 *
 * The National Weather Service's own precipitation scale was tried first
 * and refused: fifteen radar-style classes with red beside green at one
 * lightness, the opposite of the moisture direction every other map here
 * uses.
 *
 * One set of breaks for one, three and seven days, so changing the window
 * changes the amounts and never what a colour means. They are amounts, not
 * a comparison with normal: this site publishes no normal for a few days'
 * precipitation.
 */
import { SNOW_CLASSES } from "./snow-classes";

export interface PrecipClass {
  /** Inclusive lower bound, inches. */
  min: number;
  /** Exclusive upper bound, or null for the open top class. */
  max: number | null;
  label: string;
  color: string;
}

const BREAKS = [0, 0.1, 0.25, 0.5, 1, 2] as const;

export const PRECIP_CLASSES: readonly PrecipClass[] = BREAKS.map((min, index) => {
  const max = BREAKS[index + 1] ?? null;
  return {
    min,
    max,
    label: index === 0 ? `Under ${max} in` : max === null ? `${min} in or more` : `${min} to ${max} in`,
    color: SNOW_CLASSES[index]!.color
  };
});

/** A site with no total for the window, or an area with too few. */
export const PRECIP_NO_VALUE_COLOR = "#8a949c";

/** The class a total falls in, or -1 for no number. */
export function precipClassIndex(inches: number | null | undefined): number {
  if (inches === null || inches === undefined || !(inches >= 0)) return -1;
  for (let index = PRECIP_CLASSES.length - 1; index >= 0; index -= 1) {
    if (inches >= PRECIP_CLASSES[index]!.min) return index;
  }
  return -1;
}
