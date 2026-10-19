/*
 * Ten years of weekly drought, reduced to what the two decade charts draw.
 *
 * Pure arithmetic over the archive's published shares: no DOM and no fetch,
 * so every rule here is unit-tested (ADR-123).
 */
import type { DroughtHistory } from "./data/drought-history";
import type { DroughtAtLeast } from "./types";
import type { DroughtClass } from "./viz/drought-classes";
import { DROUGHT_CLASSES } from "./viz/drought-classes";

/**
 * The calendar's rule: a week takes the most severe class that at least half
 * of the measured land is in, or worse.
 *
 * Half, because it is the one share that makes the answer the area's typical
 * ground rather than its worst corner: a week coloured D2 had most of its
 * land at severe drought or worse. A lower bar would let a small dry pocket
 * colour a whole basin; a higher one would hide most droughts entirely.
 */
export const CALENDAR_SHARE = 50;

export type CalendarCell = DroughtClass["key"] | "none" | null;

/** The calendar class for one week, "none" when less than half the measured
 * land is even abnormally dry, and null when there is no share to read. */
export function calendarClass(shares: DroughtAtLeast | null): CalendarCell {
  if (shares === null) return null;
  for (let index = DROUGHT_CLASSES.length - 1; index >= 0; index -= 1) {
    const entry = DROUGHT_CLASSES[index]!;
    if (shares[entry.key] >= CALENDAR_SHARE) return entry.key;
  }
  return "none";
}

export interface CalendarRun {
  /** The first week of the run, as a position in the history's dates. */
  start: number;
  length: number;
  cell: CalendarCell;
}

/** Consecutive weeks of the same class as one run, so a decade draws as a
 * few dozen rectangles per area rather than five hundred. */
export function calendarRuns(cells: readonly CalendarCell[]): CalendarRun[] {
  const runs: CalendarRun[] = [];
  cells.forEach((cell, index) => {
    const last = runs[runs.length - 1];
    if (last && last.cell === cell) last.length += 1;
    else runs.push({ start: index, length: 1, cell });
  });
  return runs;
}

/** Weeks at each calendar class, plus the weeks with no share at all. */
export function calendarCounts(
  cells: readonly CalendarCell[]
): Record<DroughtClass["key"] | "none" | "missing", number> {
  const counts = { none: 0, d0: 0, d1: 0, d2: 0, d3: 0, d4: 0, missing: 0 };
  for (const cell of cells) counts[cell ?? "missing"] += 1;
  return counts;
}

export interface CalendarRow {
  code: string;
  name: string;
  cells: CalendarCell[];
  /** Null for an area wholly measured; otherwise how much of it is. */
  measuredPercent: number | null;
}

/**
 * One row per area in view, in drainage-code order.
 *
 * Code order rather than severity: the codes are assigned down each river
 * system, so neighbouring areas sit together and a drought that crosses a
 * region reads as one block down the rows. An order by this week's severity
 * would scatter that block and rank a decade by its last week.
 */
export function calendarRows(
  history: DroughtHistory,
  areas: readonly { code: string; name: string; measuredPercent: number | null }[]
): CalendarRow[] {
  return [...areas]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((area) => {
      const series = history.series.get(area.code);
      return {
        code: area.code,
        name: area.name,
        measuredPercent: area.measuredPercent,
        cells: series ? series.map(calendarClass) : history.dates.map(() => null)
      };
    });
}

export interface YearSummary {
  year: string;
  /** Weeks in this year the archive holds a share for. */
  weeks: number;
  /** The highest weekly share at each class or worse during the year. */
  highest: DroughtAtLeast;
}

/**
 * The text alternative to the stacked chart: one row per calendar year, with
 * the highest share each class or worse reached in it. Highest rather than
 * an average, because a week is a published measurement and an average of
 * fifty-two of them is a figure no one measured.
 */
export function yearSummaries(
  dates: readonly string[],
  series: readonly (DroughtAtLeast | null)[]
): YearSummary[] {
  const years = new Map<string, YearSummary>();
  series.forEach((shares, index) => {
    if (shares === null) return;
    const year = dates[index]!.slice(0, 4);
    const summary = years.get(year) ?? {
      year, weeks: 0, highest: { d0: 0, d1: 0, d2: 0, d3: 0, d4: 0 }
    };
    summary.weeks += 1;
    for (const entry of DROUGHT_CLASSES) {
      summary.highest[entry.key] = Math.max(summary.highest[entry.key], shares[entry.key]);
    }
    years.set(year, summary);
  });
  return [...years.values()];
}

/** The most recent week with a share, for the chart's current-week mark. */
export function latestHeld(series: readonly (DroughtAtLeast | null)[]): number | null {
  for (let index = series.length - 1; index >= 0; index -= 1) {
    if (series[index] !== null) return index;
  }
  return null;
}
