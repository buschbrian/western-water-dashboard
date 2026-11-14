/*
 * The soil-moisture map's classes when it compares each station with its own
 * past years (ADR-169): the river map's five classes (ADR-144) in words for
 * soil, in one table that the fills, the points and the key all read.
 *
 * No new colour. The five are taken from the week's-change table
 * (`SOIL_CLASSES`): its two browns, its neutral, its palest blue and its
 * blue end, so drier is brown and wetter is blue on both views of the one
 * map, and every colour here has already passed that table's measured checks
 * (lightness order, colour-vision separation, translucent-fill visibility).
 * `soil-history-classes.test.ts` holds them to those rows.
 */
import type { SoilHistoryClass } from "../types";
import { SOIL_CLASSES } from "./soil-classes";

export interface SoilHistoryClassRow {
  id: SoilHistoryClass;
  /** Key and table words. */
  label: string;
  /** The range in words, for the key. */
  range: string;
  color: string;
}

export const SOIL_HISTORY_CLASSES: readonly SoilHistoryClassRow[] = [
  { id: "much_drier", label: "Much drier than normal", range: "drier than 9 in 10 past years", color: SOIL_CLASSES[0]!.color },
  { id: "drier", label: "Drier than normal", range: "drier than 3 in 4 past years", color: SOIL_CLASSES[1]!.color },
  { id: "normal", label: "Normal", range: "the middle half of past years", color: SOIL_CLASSES[2]!.color },
  { id: "wetter", label: "Wetter than normal", range: "wetter than 3 in 4 past years", color: SOIL_CLASSES[3]!.color },
  { id: "much_wetter", label: "Much wetter than normal", range: "wetter than 9 in 10 past years", color: SOIL_CLASSES[SOIL_CLASSES.length - 1]!.color }
];

/** The row for a class, or -1 for none. */
export function soilHistoryClassIndex(cls: SoilHistoryClass | null | undefined): number {
  return cls ? SOIL_HISTORY_CLASSES.findIndex((row) => row.id === cls) : -1;
}

export function soilHistoryLabel(cls: SoilHistoryClass | null | undefined): string {
  const index = soilHistoryClassIndex(cls);
  return index < 0 ? "Not compared with past years" : SOIL_HISTORY_CLASSES[index]!.label;
}
