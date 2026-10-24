/*
 * The weekly drought archive at one level, read into one row per week.
 *
 * Every week is measured from the monitor's own archived map of that week,
 * by `tools/compute_drought_coverage.py` each Thursday and, for the weeks
 * before the weekly run, by `tools/backfill_drought_history.py` with the same
 * engine (ADR-122). The file holds the cumulative shares only, keyed by each
 * area's code.
 *
 * Read here into a calendar with a slot for every Tuesday from the first map
 * to the last, whether or not the file holds a map for it. A week the archive
 * could not supply is a hole in that calendar, never a copy of its neighbour,
 * and an area with no measured land in a week has no share that week rather
 * than a share of zero (ADR-059).
 */
import type { DroughtAtLeast } from "../types";
import { isAtLeast } from "./drought-validate";
import { fetchWithin } from "./fetch";
import { HUC_CODE } from "./huc";

/** The levels that keep an archive. HUC-8 publishes this week only (ADR-088). */
export const DROUGHT_HISTORY_LEVELS: ReadonlySet<number> = new Set([2, 4, 6]);

/** A decade of weekly maps is larger than the weekly file, so it gets the
 * longer of the two deadlines a reader would still wait for. */
export const DROUGHT_HISTORY_TIMEOUT_MS = 30000;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export interface DroughtHistory {
  level: number;
  /** Every weekly map date from the first held to the last, oldest first. */
  dates: readonly string[];
  /** Whether the file holds a map for each of `dates`. */
  held: readonly boolean[];
  /** Per area code, the cumulative shares for each of `dates`; null where no
   * map is held for the week or the area had no measured land in it. */
  series: ReadonlyMap<string, readonly (DroughtAtLeast | null)[]>;
  /** Weeks the archive could not supply, each with the reason it gave. */
  skipped: readonly { mapDate: string; reason: string }[];
}

export function droughtHistoryUrl(level: number): string {
  return `./data/drought/usdm-huc${level}-history.json`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dayNumber(date: string): number {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : Number.NaN;
}

function isoDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

export function validateDroughtHistory(value: unknown, level: number): DroughtHistory {
  if (!isObject(value) || !Array.isArray(value.weeks) || value.weeks.length === 0) {
    throw new Error("drought history must be an object with a weeks array");
  }
  if (value.level !== level) {
    throw new Error(`drought history is HUC-${String(value.level)}, expected HUC-${level}`);
  }
  const field = `huc${level}`;
  const first = isObject(value.weeks[0]) ? dayNumber(String(value.weeks[0].map_date)) : Number.NaN;
  if (!Number.isFinite(first)) throw new Error("drought history has no usable first week");

  const byOffset = new Map<number, Record<string, unknown>>();
  let last = first;
  value.weeks.forEach((week, index) => {
    if (!isObject(week) || !Array.isArray(week.units)) {
      throw new Error(`drought history week ${index} is not a week`);
    }
    const time = dayNumber(String(week.map_date));
    /* Strictly later and a whole number of weeks on: a file that repeats or
     * reorders a week, or holds a map dated off the weekly schedule, cannot
     * be placed on the calendar without guessing. */
    if (!Number.isFinite(time) || (index > 0 && time <= last) || (time - first) % WEEK_MS !== 0) {
      throw new Error(`drought history week ${index} is out of order or off the weekly schedule`);
    }
    if (week.release_date !== null && typeof week.release_date !== "string") {
      throw new Error(`drought history week ${index} has an invalid release date`);
    }
    for (const unit of week.units) {
      if (!isObject(unit) || typeof unit[field] !== "string" ||
          !HUC_CODE.test(unit[field] as string) || (unit[field] as string).length !== level ||
          !isAtLeast(unit.percent_of_area_at_least)) {
        throw new Error(`drought history week ${index} holds an invalid area`);
      }
    }
    byOffset.set((time - first) / WEEK_MS, week);
    last = time;
  });

  const count = (last - first) / WEEK_MS + 1;
  const dates = Array.from({ length: count }, (_, offset) => isoDay(first + offset * WEEK_MS));
  const held = dates.map((_, offset) => byOffset.has(offset));
  const series = new Map<string, (DroughtAtLeast | null)[]>();
  for (const [offset, week] of byOffset) {
    for (const unit of week.units as Record<string, unknown>[]) {
      const code = unit[field] as string;
      let row = series.get(code);
      if (!row) {
        row = new Array<DroughtAtLeast | null>(count).fill(null);
        series.set(code, row);
      }
      row[offset] = unit.percent_of_area_at_least as DroughtAtLeast;
    }
  }

  const backfill = isObject(value.backfill) ? value.backfill : null;
  const skipped = backfill && Array.isArray(backfill.skipped)
    ? backfill.skipped.filter(isObject).map((item) => ({
      mapDate: String(item.map_date), reason: String(item.reason)
    }))
    : [];
  return { level, dates, held, series, skipped };
}

/** The archive at one level. Fetched only when its chart is about to be seen:
 * a decade is the largest drought file this page reads. */
export async function loadDroughtHistory(
  level: number, url = droughtHistoryUrl(level)
): Promise<DroughtHistory> {
  const response = await fetchWithin(url, DROUGHT_HISTORY_TIMEOUT_MS);
  return validateDroughtHistory(await response.json() as unknown, level);
}
