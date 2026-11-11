/*
 * The words and rows the terminal-lakes page is made of (ADR-119).
 *
 * Pure, like every other `*-model.ts`: a lake record in, sentences and
 * labelled rows out, nothing rendered. The rank and the change intervals
 * reach for the details panel's helpers so a lake's "third-lowest of twelve"
 * reads exactly as a reservoir's does. What is not borrowed is deliberate:
 * there is no percent full, no colour class and no full-level basis here,
 * because a natural terminal lake has none of them (ADR-112).
 *
 * A lake is one gauge or a named list of arms, and a gauge may have a level
 * and no volume (ADR-159). A target is a line with its authority, decision
 * and year, and a gap in feet; nothing here divides by it.
 */
import type { DetailMonth } from "./state/detail";
import {
  changeRows, datumName, extremeRows, formatFeet, levelCard
} from "./measurement-model";
import type { MeasurementRow, MeasurementView } from "./measurement-model";
import type {
  LakeElevation, LakeTarget, LakeVolume, TerminalLake, WithdrawnLake
} from "./types";
import { formatAcreFeet, formatDate } from "./viz/format";

export { datumName, formatFeet, rankSentence } from "./measurement-model";

export type LakeRow = MeasurementRow;
export type LakeMeasurementView = MeasurementView;

/** One gauge: the lake's own, or one arm of a lake measured by arm. */
export interface LakeGaugeView {
  /** The arm's name; null for a lake read at one site. */
  heading: string | null;
  station: string;
  lat: number;
  lon: number;
  level: LakeMeasurementView;
  /** Null where no reviewed volume relation exists; `noVolume` says so. */
  volume: LakeMeasurementView | null;
  noVolume: string | null;
  months: DetailMonth[];
}

export interface LakeView {
  name: string;
  /** What kind of water this is, and why it has no percent full. */
  statement: string;
  /** Why a lake measured by arm shows no level for the whole lake. */
  armsNote: string | null;
  late: string | null;
  gauges: LakeGaugeView[];
  targets: string[];
  source: LakeRow[];
  note: string;
}

const STATE_NAMES: Record<string, string> = {
  AZ: "Arizona", CA: "California", CO: "Colorado", ID: "Idaho", MT: "Montana",
  NV: "Nevada", NM: "New Mexico", OR: "Oregon", UT: "Utah", WA: "Washington",
  WY: "Wyoming"
};

interface Gauge {
  name: string | null;
  station: string;
  lat: number;
  lon: number;
  elevation: LakeElevation;
  volume: LakeVolume | null;
}

/** The lake's gauges in order: its arms, or the lake itself. */
function gaugesOf(lake: TerminalLake): Gauge[] {
  if (lake.arms.length > 0) {
    return lake.arms.map((arm) => ({
      name: arm.name, station: arm.source_station_id, lat: arm.lat, lon: arm.lon,
      elevation: arm.elevation, volume: arm.volume
    }));
  }
  /* The validator holds a lake with no arms to its own site, point and level. */
  return [{
    name: null, station: lake.source_station_id ?? "", lat: lake.lat ?? Number.NaN,
    lon: lake.lon ?? Number.NaN, elevation: lake.elevation!, volume: lake.volume
  }];
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

/** Why a lake measured by arm has no level of its own (ADR-159). */
export function armsSentence(lake: TerminalLake): string | null {
  if (lake.arms.length === 0) return null;
  const names = lake.arms.map((arm) => `the ${arm.name}`);
  const list = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `The survey measures ${list} at different gauges. The parts of the lake stand `
    + "at different levels, so this site shows each part and no level for the whole lake.";
}

/** The plain statement for a gauge with a level and no volume (ADR-159). */
export function noVolumeSentence(armName: string | null): string {
  const what = armName === null ? "this lake" : `the ${armName}`;
  return `No reviewed table that turns a water level into a volume exists for ${what}, `
    + "so this site shows its surface level only.";
}

/** A target's value as a reader says it: 6,392, or 4,198.5 where there are tenths. */
function targetFeet(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * One target as a line, with the gap in feet and never as a share (ADR-159):
 * "Target: 6,392 ft, State Water Resources Control Board Decision 1631 (1994)."
 */
export function targetLine(lake: TerminalLake, target: LakeTarget): string {
  const line = `Target: ${targetFeet(target.elevation_ft)} ft, ${target.authority} `
    + `${target.decision} (${target.set_on.slice(0, 4)}).`;
  const gauge = gaugesOf(lake).find((candidate) =>
    target.arm === undefined ? candidate.name === null : candidate.name === target.arm);
  if (!gauge) return line;
  const subject = gauge.name === null ? "The surface level" : `The ${gauge.name}`;
  if (gauge.elevation.vertical_datum !== target.vertical_datum) {
    return `${line} The target and the reading use different datums, so no gap is shown.`;
  }
  const gap = Math.round((gauge.elevation.current - target.elevation_ft) * 100) / 100;
  if (gap === 0) return `${line} ${subject} is at the target.`;
  return `${line} ${subject} is ${formatFeet(Math.abs(gap))} feet `
    + `${gap < 0 ? "below" : "above"} the target.`;
}

export function targetLines(lake: TerminalLake): string[] {
  if (lake.targets.length === 0) {
    return ["No restoration or regulatory target is published for this lake."];
  }
  return lake.targets.map((target) => targetLine(lake, target));
}

/** The twelve months of a volume, shaped for the shared trend chart. */
export function volumeMonths(volume: LakeVolume | null, color: string): DetailMonth[] {
  if (volume === null) return [];
  return volume.monthly.map((entry) => {
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

/** The lake's own twelve months of volume; none where it has no volume. */
export function lakeMonths(lake: TerminalLake, color: string): DetailMonth[] {
  return volumeMonths(lake.volume, color);
}

function volumeCard(volume: LakeVolume): LakeMeasurementView {
  const acreFeet = (value: number): string => formatAcreFeet(value);
  return {
    heading: "Volume",
    headline: `${formatAcreFeet(volume.current)} acre-feet`,
    basis: "on the published table that turns a water level into a volume",
    rows: [...extremeRows(volume, "acre-feet", acreFeet),
      ...changeRows(volume, "acre-feet", acreFeet, volume)]
  };
}

function sourceRows(lake: TerminalLake, gauges: Gauge[]): LakeRow[] {
  const armed = lake.arms.length > 0;
  const datums = [...new Set(gauges.map((gauge) => datumName(gauge.elevation.vertical_datum)))];
  const tables = gauges.flatMap((gauge) => gauge.volume === null ? [] : [gauge.volume.relation]);
  const held = armed
    ? `${gauges.map((gauge) => `${gauge.name}: ${gauge.elevation.n_obs} readings`).join("; ")}, `
      + `over ${lake.years_of_record} years`
    : `${(gauges[0]!.volume ?? gauges[0]!.elevation).n_obs} readings over `
      + `${lake.years_of_record} years`;
  return [
    { label: "Publisher", value: lake.source_label },
    { label: armed ? "Stations" : "Station",
      value: armed
        ? gauges.map((gauge) => `${gauge.name} ${gauge.station}`).join(", ")
        : gauges[0]!.station },
    { label: "Level datum", value: datums.join("; ") },
    { label: "Volume table", value: tables.length === 0
      ? "None reviewed"
      : tables.map((relation) => relation.in_use_from
        ? `${relation.name}, in use from ${formatDate(relation.in_use_from)}`
        : relation.name).join("; ") },
    { label: "Record starts", value: formatDate(lake.first_obs) },
    { label: "Readings held", value: held }
  ];
}

export function describeLake(lake: TerminalLake, chartColor: string): LakeView {
  const gauges = gaugesOf(lake);
  return {
    name: lake.name,
    statement: lakeStatement(lake),
    armsNote: armsSentence(lake),
    late: lateMessage(lake),
    gauges: gauges.map((gauge) => ({
      heading: gauge.name,
      station: gauge.station,
      lat: gauge.lat,
      lon: gauge.lon,
      level: levelCard(gauge.elevation, gauge.elevation.vertical_datum),
      volume: gauge.volume === null ? null : volumeCard(gauge.volume),
      noVolume: gauge.volume === null ? noVolumeSentence(gauge.name) : null,
      months: volumeMonths(gauge.volume, chartColor)
    })),
    targets: targetLines(lake),
    source: sourceRows(lake, gauges),
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
