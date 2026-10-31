/*
 * The words of one measurement card: a current value, its dated record
 * readings, its dated changes and its history rank.
 *
 * Shared by the terminal-lakes page (ADR-119) and the surface level on a
 * reservoir's page (ADR-135), so a level reads the same on both. Pure: a
 * summary in, labelled rows out. A level carries no percentage of anything
 * (ADR-112); only a caller that passes the shares gets them.
 */
import { changeLabel, ordinal } from "./state/detail";
import type { MeasurementSummary, NullableNumber } from "./types";
import { formatDate } from "./viz/format";

export interface MeasurementRow {
  label: string;
  value: string;
}

export interface MeasurementView {
  heading: string;
  /** The current value with its unit, said once, large. */
  headline: string;
  /** What the headline is measured above or on, said small beside it. */
  basis: string;
  rows: MeasurementRow[];
}

export type ChangeShares = Record<
  "change_7d_pct" | "change_30d_pct" | "change_365d_pct", NullableNumber>;

/** The vertical datum as a reader meets it, never as its initials alone. */
export function datumName(code: string): string {
  switch (code) {
    case "NGVD29": return "National Geodetic Vertical Datum of 1929";
    case "NAVD88": return "North American Vertical Datum of 1988";
    default: return `${code} datum`;
  }
}

/**
 * The history rank as a position: "3rd-lowest of 12". The details panel
 * pairs the ordinal with a percentile once ten years stand behind it; a level
 * publishes no percentile, so the position stands alone (ADR-112).
 */
export function rankSentence(rank: number | null, rankOf: number | null): string {
  if (rank === null || rankOf === null || rankOf <= 1) {
    return "No earlier years to compare with.";
  }
  return `${ordinal(rank)}-lowest of ${rankOf}`;
}

/** Feet to hundredths, with a thousands separator: 3,914.96. */
export function formatFeet(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function signed(value: number, format: (value: number) => string): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${format(Math.abs(value))}`;
}

export function changeRows(
  measure: MeasurementSummary, unit: string, format: (value: number) => string,
  pct?: ChangeShares
): MeasurementRow[] {
  const windows: readonly [string, "7d" | "30d" | "365d"][] = [
    ["Change in 7 days", "7d"], ["Change in 30 days", "30d"], ["Change in 1 year", "365d"]
  ];
  return windows.map(([base, window]) => {
    const change = measure[`change_${window}`];
    const reference = measure[`change_${window}_reference_date`];
    const elapsed = measure[`change_${window}_elapsed_days`];
    if (change === null || reference === null) {
      return { label: base, value: "No earlier reading to compare with." };
    }
    const share = pct ? pct[`change_${window}_pct`] : null;
    const shareText = share === null || share === undefined ? "" : ` (${signed(share, (v) => `${v.toFixed(1)}%`)})`;
    return {
      label: changeLabel(base, elapsed),
      value: `${signed(change, format)} ${unit}${shareText} since ${formatDate(reference)}`
    };
  });
}

export function extremeRows(measure: MeasurementSummary, unit: string,
  format: (value: number) => string): MeasurementRow[] {
  return [
    { label: "Reading date", value: formatDate(measure.as_of) },
    { label: "Highest reading",
      value: `${format(measure.record_high)} ${unit} on ${formatDate(measure.record_high_date)}` },
    { label: "Lowest reading",
      value: `${format(measure.record_low)} ${unit} on ${formatDate(measure.record_low_date)}` },
    { label: "History rank",
      value: rankSentence(measure.seasonal_rank, measure.seasonal_rank_of) }
  ];
}

/** The surface-level card: feet above a datum named in full, no share of it. */
export function levelCard(measure: MeasurementSummary, datumCode: string): MeasurementView {
  const feet = (value: number): string => formatFeet(value);
  return {
    heading: "Surface level",
    headline: `${formatFeet(measure.current)} feet`,
    basis: `above the ${datumName(datumCode)}`,
    rows: [...extremeRows(measure, "feet", feet), ...changeRows(measure, "feet", feet)]
  };
}
