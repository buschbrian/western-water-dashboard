/*
 * The words and rows the terminal-lakes page is made of (ADR-119).
 *
 * Pure, like every other `*-model.ts`: a lake record in, sentences and
 * labelled rows out, nothing rendered. The rank and the change intervals
 * reach for the details panel's helpers so a lake's "third-lowest of twelve"
 * reads exactly as a reservoir's does. What is not borrowed is deliberate:
 * there is no percent full, no colour class and no full-level basis here,
 * because a natural terminal lake has none of them (ADR-112).
 */
import type { DetailMonth } from "./state/detail";
import {
  changeRows, datumName, extremeRows, formatFeet, levelCard
} from "./measurement-model";
import type { MeasurementRow, MeasurementView } from "./measurement-model";
import type { LakeGauge, LakeVolume, TerminalLake, WithdrawnLake } from "./types";
import { formatAcreFeet, formatDate } from "./viz/format";

export { datumName, formatFeet, rankSentence } from "./measurement-model";

export type LakeRow = MeasurementRow;
export type LakeMeasurementView = MeasurementView;

/**
 * One station's part of the page: the whole lake when it has one station, or
 * one arm of a lake the survey measures apart (ADR-161).
 */
export interface LakeGaugeView {
  /** The arm's name, or null for a lake measured at one station. */
  heading: string | null;
  gauge: LakeGauge;
  late: string | null;
  level: LakeMeasurementView;
  volume: LakeMeasurementView | null;
  /** Why no volume is shown, when none is published. */
  noVolume: string | null;
  months: DetailMonth[];
  source: LakeRow[];
}

export interface LakeView {
  name: string;
  /** What kind of water this is, and why it has no percent full. */
  statement: string;
  late: string | null;
  gauges: LakeGaugeView[];
  targets: string;
  /** Rows about the whole lake: the publisher, and for a lake with one
   * station, that station's rows as well. */
  source: LakeRow[];
  note: string;
}

const STATE_NAMES: Record<string, string> = {
  AZ: "Arizona", CA: "California", CO: "Colorado", ID: "Idaho", MT: "Montana",
  NV: "Nevada", NM: "New Mexico", OR: "Oregon", UT: "Utah", WA: "Washington",
  WY: "Wyoming"
};

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six"];

function lateBy(subject: string, days: number): string {
  return days === 1
    ? `${subject} is late by one day.`
    : `${subject} is late by ${days} days.`;
}

export function lateMessage(lake: { is_stale: boolean; days_stale: number }): string | null {
  if (!lake.is_stale) return null;
  return lateBy("This reading", lake.days_stale);
}

export function lakeStatement(lake: TerminalLake): string {
  const where = lake.state && STATE_NAMES[lake.state] ? ` in ${STATE_NAMES[lake.state]}` : "";
  const base = `${lake.name} is a natural terminal lake${where}. Water leaves its closed basin `
    + "by evaporation. It has no dam and no full level, so this site shows no percent "
    + "full for it.";
  if (!lake.arms) return base;
  const count = COUNT_WORDS[lake.arms.length] ?? String(lake.arms.length);
  return `${base} The ${lake.source_label} measures this lake in ${count} arms, each at `
    + "its own station. The arms can have different levels, so this site shows each arm "
    + "separately and does not combine them into one level.";
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
export function lakeMonths(gauge: LakeGauge, color: string): DetailMonth[] {
  return (gauge.volume?.monthly ?? []).map((entry) => {
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

function volumeCard(volume: LakeVolume): LakeMeasurementView {
  const acreFeet = (value: number): string => formatAcreFeet(value);
  const shares: Pick<LakeVolume, "change_7d_pct" | "change_30d_pct" | "change_365d_pct"> = volume;
  return {
    heading: "Volume",
    headline: `${formatAcreFeet(volume.current)} acre-feet`,
    basis: "on the published table that turns a water level into a volume",
    rows: [...extremeRows(volume, "acre-feet", acreFeet),
      ...changeRows(volume, "acre-feet", acreFeet, shares)]
  };
}

function gaugeRows(gauge: LakeGauge): LakeRow[] {
  const rows: LakeRow[] = [
    { label: "Station", value: gauge.source_station_id },
    { label: "Level datum", value: datumName(gauge.elevation.vertical_datum) }
  ];
  if (gauge.volume) {
    const relation = gauge.volume.relation;
    rows.push({ label: "Volume table", value: relation.in_use_from
      ? `${relation.name}, in use from ${formatDate(relation.in_use_from)}`
      : relation.name });
  }
  const held = gauge.volume ?? gauge.elevation;
  rows.push(
    { label: "Record starts", value: formatDate(gauge.first_obs) },
    { label: "Readings held", value: `${held.n_obs} readings over ${gauge.years_of_record} years` });
  return rows;
}

function describeGauge(gauge: LakeGauge, heading: string | null, publisher: string,
  chartColor: string): LakeGaugeView {
  const part = heading === null ? "lake" : "arm";
  return {
    heading,
    gauge,
    late: heading === null || !gauge.is_stale
      ? null
      : lateBy(`The reading for the ${heading.toLowerCase()}`, gauge.days_stale),
    level: levelCard(gauge.elevation, gauge.elevation.vertical_datum),
    volume: gauge.volume ? volumeCard(gauge.volume) : null,
    noVolume: gauge.volume ? null
      : `The ${publisher} publishes no daily volume for this ${part}, so this site shows `
        + "its surface level only.",
    months: lakeMonths(gauge, chartColor),
    source: gaugeRows(gauge)
  };
}

export function describeLake(lake: TerminalLake, chartColor: string): LakeView {
  const publisher = { label: "Publisher", value: lake.source_label };
  const gauges = lake.arms
    ? lake.arms.map((arm) => describeGauge(arm, arm.arm, lake.source_label, chartColor))
    : [describeGauge(lake, null, lake.source_label, chartColor)];
  return {
    name: lake.name,
    statement: lakeStatement(lake),
    late: lake.arms ? null : lateMessage(lake),
    gauges,
    targets: targetsSentence(lake),
    source: lake.arms ? [publisher] : [publisher, ...gauges[0]!.source],
    note: "History rank compares this value with one value from each earlier year near "
      + "the same date. “Third-lowest of twelve” places it among those years and "
      + `this one. The years start in ${lake.first_obs.slice(0, 4)}, so the rank rests `
      + "on a small sample."
  };
}

/** What the page says about a lake the payload withdrew (ADR-056). */
export function withdrawnSentence(notice: WithdrawnLake): string {
  return `${notice.name} is not in the current published data. Its feed went quiet for `
    + `longer than the publication window. It was last read ${formatDate(notice.as_of)}.`;
}
