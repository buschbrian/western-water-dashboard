/*
 * The words around a combined storage figure compared with normal, shared by
 * the storage map and the storage charts (ADR-153).
 *
 * Both pages total the same rows with `rollupOfScoped` and print the same
 * comparison. Written once here, so the two pages cannot drift into two
 * sentences for one number. The period named is always the one the figure
 * was measured against (`normalBaseline`), never the one a page would prefer
 * (ADR-041).
 */
import { asScoped, rollupOfScoped, type ScopedReservoirs, type StatewideRollup }
  from "../data/rollup";
import { monthlyRollup, type MonthKey } from "../data/months";
import { matchesFilter, type FilterState } from "./filters";
import { periodLabel } from "./baseline";
import { formatPercent } from "../viz/format";
import type { BaselineChoice, BaselineId } from "../types";

/** The four rollup fields a comparison with normal is made of. */
export type NormalComparison = Pick<
  StatewideRollup, "percentOfNormal" | "normalCovers" | "count" | "normalBaseline"
>;

/** What the map says in place of a normal while the slider is on a past month. */
export const PAST_MONTH_NORMAL = "The map compares only the newest reading with normal.";

/**
 * "of the usual storage for this date, 1991 through 2020", and how many of
 * the reservoirs it covers whenever that is not all of them.
 */
export function usualStorageClause(
  rollup: NormalComparison, choices: readonly BaselineChoice[]
): string {
  const years = periodLabel(choices, rollup.normalBaseline);
  return rollup.normalCovers === rollup.count
    ? `of the usual storage for this date, ${years}`
    : `of the usual storage for this date, ${years}, for ${rollup.normalCovers} `
      + `of ${rollup.count} reservoirs`;
}

/** The note under a percent-of-normal figure: the clause as its own line. */
export function describeUsualStorage(
  rollup: NormalComparison, choices: readonly BaselineChoice[]
): string {
  const clause = usualStorageClause(rollup, choices);
  return `${clause.charAt(0).toUpperCase()}${clause.slice(1)}`;
}

/** The filtered rows' own figures, beside the wider headline. */
export interface Subtotal {
  /** Reservoirs the analysis controls left, which the table lists. */
  count: number;
  /** Percent full, of today or of the month on the slider. */
  percentFull: number | null;
  /** Null on a past month: the map compares only the newest reading. */
  normal: NormalComparison | null;
  /** The month on the slider, or null for the newest reading. */
  month: MonthKey | null;
  /** How many of `count` reported the month; `count` for the newest reading. */
  reporting: number;
}

export interface SubtotalOptions {
  baseline: BaselineId;
  minimumBaselineYears: number;
  month: MonthKey | null;
}

/**
 * The subtotal for the rows the analysis controls leave, or null when they
 * leave every row.
 *
 * The headline stays the wider total (ADR-029, ADR-095). This is the second
 * figure, made from exactly the rows the list keeps bright and the table
 * lists: `matchesFilter` over the scoped rows, the same predicate both use.
 */
export function filteredSubtotal(
  rows: ScopedReservoirs, filter: FilterState, options: SubtotalOptions
): Subtotal | null {
  const shown = rows.filter((reservoir) => matchesFilter(reservoir, filter));
  if (shown.length === rows.length) return null;
  /* A group split out of a scoped set is still scoped: no dominant-reservoir
   * question is asked a second time. */
  const scoped = asScoped(shown);
  if (options.month !== null) {
    const monthly = monthlyRollup(scoped, options.month);
    return {
      count: shown.length,
      percentFull: monthly.percentFull,
      normal: null,
      month: options.month,
      reporting: monthly.reporting
    };
  }
  const rollup = rollupOfScoped(scoped, {
    baseline: options.baseline,
    minimumBaselineYears: options.minimumBaselineYears
  });
  return {
    count: rollup.count,
    percentFull: rollup.percentFull,
    normal: rollup,
    month: null,
    reporting: rollup.count
  };
}

/** The subtotal in sentences, each short enough to read in one pass. */
export function describeSubtotal(
  subtotal: Subtotal, choices: readonly BaselineChoice[], monthName: string | null
): string {
  const { count } = subtotal;
  if (count === 0) return "No reservoir matches the analysis controls.";
  const one = count === 1;
  const these = one ? "This reservoir" : `These ${count} reservoirs`;
  if (subtotal.month !== null) {
    const name = monthName ?? subtotal.month;
    if (subtotal.percentFull === null) {
      const none = one ? `This reservoir did not report in ${name}.`
        : `None of these ${count} reservoirs reported in ${name}.`;
      return `${none} ${PAST_MONTH_NORMAL}`;
    }
    const reported = subtotal.reporting < count
      ? ` ${subtotal.reporting} of them reported that month.` : "";
    return `${these} ${one ? "was" : "were"} ${formatPercent(subtotal.percentFull)} full `
      + `on average through ${name}.${reported} ${PAST_MONTH_NORMAL}`;
  }
  const full = subtotal.percentFull === null
    ? `${these} ${one ? "has" : "have"} no percent full.`
    : `${these} ${one ? "is" : "are"} ${formatPercent(subtotal.percentFull)} full.`;
  const normal = subtotal.normal;
  if (normal === null) return full;
  if (normal.percentOfNormal === null) {
    const years = periodLabel(choices, normal.normalBaseline);
    return `${full} ${one ? `It has no normal for ${years}.`
      : `None of them has a normal for ${years}.`}`;
  }
  return `${full} ${one ? "It holds" : "They hold"} ${formatPercent(normal.percentOfNormal)} `
    + `${usualStorageClause(normal, choices)}.`;
}

/**
 * The phone's one control over the map: two or three short lines, and what
 * pressing it does. The control's name is its own text, lines then action,
 * because a separate label that is not the visible text fails the
 * accessibility audit (label-content-name-mismatch).
 */
export interface MapSummaryText {
  lines: string[];
  action: string;
}

export interface MapSummaryInput {
  place: string;
  count: number;
  percentFull: number | null;
  /** Null on a past month, and when no reservoir has the asked period. */
  percentOfNormal: number | null;
  /** The month on the slider in words, or null for the newest reading. */
  monthName: string | null;
  /** The filtered rows' own figure, or null when the controls leave every row.
   * A shared link to one drainage area opens on a phone with only this
   * control in view, so the wider total cannot stand there alone. */
  subtotal: { count: number; percentFull: number | null } | null;
}

function reservoirCount(count: number): string {
  return `${count} ${count === 1 ? "reservoir" : "reservoirs"}`;
}

export function mapSummaryText(input: MapSummaryInput): MapSummaryText {
  const first = `${input.place}, ${reservoirCount(input.count)}`;
  const full = `${formatPercent(input.percentFull)} full`;
  const second = input.monthName !== null
    ? `${full}, ${input.monthName}`
    : input.percentOfNormal === null
      ? full
      : `${full}, ${formatPercent(input.percentOfNormal)} of normal`;
  const lines = [first, second];
  if (input.subtotal !== null) {
    const { count, percentFull } = input.subtotal;
    lines.push(`Subtotal: ${reservoirCount(count)}`
      + (percentFull === null ? "" : `, ${formatPercent(percentFull)} full`));
  }
  return { lines, action: "Open the storage summary." };
}
