/*
 * The precipitation map's "against past years" classes, in one table
 * (ADR-170). Same rule as every other table here (ADR-008): the area fills,
 * the site markers and the key read these rows.
 *
 * Five classes, the U.S. National Centers for Environmental Information's
 * ranking classes, and five colours taken from the soil table
 * (`SOIL_CLASSES`): its two ends, its neutral and the step on either side.
 * The map's other two modes already use them, so brown is dry and blue is
 * wet in every mode, and the measured separation the soil table holds
 * carries over. A station wetter or drier than every past year keeps its
 * class's colour and gets a dark ring, so a record never needs a colour of
 * its own.
 */
import type { StandingClass } from "../precip-standing-model";
import { SOIL_CLASSES } from "./soil-classes";

export interface StandingClassRow {
  id: StandingClass;
  label: string;
  color: string;
}

export const STANDING_CLASSES: readonly StandingClassRow[] = [
  { id: "much-below", label: "Much drier than usual: lowest tenth of years", color: SOIL_CLASSES[0]!.color },
  { id: "below", label: "Drier than usual: lowest third", color: SOIL_CLASSES[1]!.color },
  { id: "near", label: "Near usual: middle third", color: SOIL_CLASSES[2]!.color },
  { id: "above", label: "Wetter than usual: highest third", color: SOIL_CLASSES[3]!.color },
  { id: "much-above", label: "Much wetter than usual: highest tenth of years", color: SOIL_CLASSES[5]!.color }
];

/** The ring on a station wetter or drier than every past year compared. */
export const STANDING_RECORD_RING = "#1f2933";

export const STANDING_TOO_EARLY_LABEL = "Too little usual precipitation by this date to compare";

export function standingClassRow(id: StandingClass | null | undefined): StandingClassRow | null {
  return STANDING_CLASSES.find((row) => row.id === id) ?? null;
}

/** "Much wetter than usual" without the explanation, for a list or a table. */
export function standingShortLabel(id: StandingClass | null | undefined): string {
  return standingClassRow(id)?.label.split(":")[0] ?? "No class";
}
