/*
 * The words and rows the terminal-lakes page is made of (ADR-118).
 *
 * Pure, like every other `*-model.ts`: a lake record in, sentences and
 * labelled rows out, nothing rendered. The rank and the change intervals
 * reach for the details panel's helpers so a lake's "third-lowest of twelve"
 * reads exactly as a reservoir's does. What is not borrowed is deliberate:
 * there is no percent full, no colour class and no full-level basis here,
 * because a natural terminal lake has none of them (ADR-112).
 */
import type { DetailMonth } from "./state/detail";
import { changeLabel, ordinal } from "./state/detail";
import type { LakeMeasurement, LakeVolume, TerminalLake, WithdrawnLake } from "./types";
import { formatAcreFeet, formatDate } from "./viz/format";

export interface LakeRow {
  label: string;
  value: string;
}

export interface LakeMeasurementView {
  heading: string;
  /** The current value with its unit, said once, large. */
  headline: string;
  /** What the headline is measured above or on, said small beside it. */
  basis: string;
  rows: LakeRow[];
}

export interface LakeView {
  name: string;
  /** What kind of water this is, and why it has no percent full. */
  statement: string;
  late: string | null;
  level: LakeMeasurementView;
  volume: LakeMeasurementView;
  months: DetailMonth[];
  targets: string;
  source: LakeRow[];
  note: string;
}

const STATE_NAMES: Record<string, string> = {
  AZ: "Arizona", CA: "California", CO: "Colorado", ID: "Idaho", MT: "Montana",
  NV: "Nevada", NM: "New Mexico", OR: "Oregon", UT: "Utah", WA: "Washington",
  WY: "Wyoming"
};

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
 * pairs the ordinal with a percentile once ten years stand behind it; a lake
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

function signed(value: number, format: (value: number) => string): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${format(Math.abs(value))}`;
}

function changeRows(
  measure: LakeMeasurement, unit: string, format: (value: number) => string,
  pct?: Pick<LakeVolume, "change_7d_pct" | "change_30d_pct" | "change_365d_pct">
): LakeRow[] {
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

function extremes(measure: LakeMeasurement, unit: string,
  format: (value: number) => string): LakeRow[] {
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

export function lateMessage(lake: TerminalLake): string | null {
  if (!lake.is_stale) return null;
  return lake.days_stale === 1
    ? "This reading is late by one day."
    : `This reading is late by ${lake.days_stale} days.`;
}

export function lakeStatement(lake: TerminalLake): string {
  const where = lake.state && STATE_NAMES[lake.state] ? ` in ${STATE_NAMES[lake.state]}` : "";
  return `${lake.name} is a natural terminal lake${where}. Water leaves its closed basin `
    + "by evaporation. It has no dam and no full level, so this site shows no percent "
    + "full for it.";
}

export function targetsSentence(lake: TerminalLake): string {
  if (lake.targets.length === 0) {
    return "No restoration or regulatory target is published for this lake.";
  }
  return lake.targets.map((target) =>
    `${target.name}: ${formatFeet(target.elevation_ft)} feet, set by ${target.authority} `
    + `on ${formatDate(target.set_on)}. A target is a goal, not a full level.`).join(" ");
}

/** The twelve months of volume, shaped for the shared trend chart. */
export function lakeMonths(lake: TerminalLake, color: string): DetailMonth[] {
  return lake.volume.monthly.map((entry) => {
    const storage = entry.mean_af !== null && Number.isFinite(entry.mean_af) ? entry.mean_af : null;
    const normal = entry.normal_af !== null && Number.isFinite(entry.normal_af) ? entry.normal_af : null;
    const [year, month] = entry.month.split("-");
    const label = `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct",
      "Nov", "Dec"][Number(month) - 1] ?? entry.month} ${year ?? ""}`.trim();
    return {
      key: entry.month,
      label,
      storageAf: storage,
      /* No full level, so no share of one: the chart draws a bar and no
       * percentage, and the hover text says only the volume (ADR-112). */
      percent: null,
      normalAf: normal,
      normalYears: typeof entry.normal_years === "number" ? entry.normal_years : null,
      changeFromNormal: storage !== null && normal ? ((storage - normal) / normal) * 100 : null,
      color
    };
  });
}

export function describeLake(lake: TerminalLake, chartColor: string): LakeView {
  const feet = (value: number): string => formatFeet(value);
  const acreFeet = (value: number): string => formatAcreFeet(value);
  const datum = datumName(lake.elevation.vertical_datum);
  return {
    name: lake.name,
    statement: lakeStatement(lake),
    late: lateMessage(lake),
    level: {
      heading: "Surface level",
      headline: `${formatFeet(lake.elevation.current)} feet`,
      basis: `above the ${datum}`,
      rows: [...extremes(lake.elevation, "feet", feet), ...changeRows(lake.elevation, "feet", feet)]
    },
    volume: {
      heading: "Volume",
      headline: `${formatAcreFeet(lake.volume.current)} acre-feet`,
      basis: "on the published table that turns a water level into a volume",
      rows: [...extremes(lake.volume, "acre-feet", acreFeet),
        ...changeRows(lake.volume, "acre-feet", acreFeet, lake.volume)]
    },
    months: lakeMonths(lake, chartColor),
    targets: targetsSentence(lake),
    source: [
      { label: "Publisher", value: lake.source_label },
      { label: "Station", value: lake.source_station_id },
      { label: "Level datum", value: datum },
      { label: "Volume table", value: lake.volume.relation.in_use_from
        ? `${lake.volume.relation.name}, in use from ${formatDate(lake.volume.relation.in_use_from)}`
        : lake.volume.relation.name },
      { label: "Record starts", value: formatDate(lake.first_obs) },
      { label: "Readings held",
        value: `${lake.volume.n_obs} readings over ${lake.years_of_record} years` }
    ],
    note: "History rank compares this value with one value from each earlier year near "
      + "the same date. “Third-lowest of twelve” places it among those years and "
      + "this one. The years start in 2015, so the rank rests on a small sample."
  };
}

/** What the page says about a lake the payload withdrew (ADR-056). */
export function withdrawnSentence(notice: WithdrawnLake): string {
  return `${notice.name} is not in the current published data. Its feed went quiet for `
    + `longer than the publication window. It was last read ${formatDate(notice.as_of)}.`;
}
