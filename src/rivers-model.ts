/*
 * The words and rows the river-flow page is made of (ADR-136, ADR-144, ADR-145).
 *
 * Pure: a gauge record in, sentences and labelled rows out. A gauge has no
 * full level and no rank. A shaped gauge has no normal; a natural gauge's
 * newest flow is worded against the day's normal range from the payload,
 * never one computed here. Nothing adds two gauges together or calls one a
 * reservoir's inflow.
 */
import { serializeCsv } from "./data/export";
import { FULL_RECORD_YEARS } from "./data/rivers-validate";
import type {
  NaturalRiverGauge, RiverDay, RiverFlowClass, RiverGauge, RiverPayload, WithdrawnGauge
} from "./types";
import { formatDate } from "./viz/format";

export interface RiverRow {
  label: string;
  value: string;
}

export interface RiverDayView {
  date: string;
  /** "Oct 26" for the axis; `fullLabel` carries the year for the table. */
  label: string;
  fullLabel: string;
  cfs: number | null;
  value: string;
  status: string;
}

/** A natural gauge's comparison: the class in words and what it rests on. */
export interface RiverComparison {
  label: string;
  detail: string;
  /** Said beside the comparison when the band rests on fewer than 30 years. */
  shortRecord: string | null;
}

export interface RiverView {
  name: string;
  where: string;
  tier: RiverGauge["tier"];
  /** Why this gauge is or is not compared with normal. */
  tierNote: string;
  comparison: RiverComparison | null;
  /** A natural gauge's reason for no comparison today, or null. */
  withheld: string | null;
  late: string | null;
  headline: string;
  basis: string;
  status: string;
  rows: RiverRow[];
  days: RiverDayView[];
  source: RiverRow[];
  pageUrl: string;
}

const STATE_NAMES: Record<string, string> = {
  AZ: "Arizona", CO: "Colorado", NM: "New Mexico", UT: "Utah", WY: "Wyoming"
};

export const FLOW_UNIT = "cubic feet per second";

/** 33,800 and 179 and 0.25: the survey's own precision, no trailing zeros. */
export function formatFlow(value: number | null): string {
  return value === null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** The rivers page's reading and normal range, at three significant figures
 * (ADR-145): 101, 15.4, 7.62, 33.8, 0.05. A value of 100 or more is a whole
 * number with separators. No trailing zero is added; the payload keeps full
 * precision. */
export function formatFlowFigures(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return Math.abs(value) >= 100
    ? value.toLocaleString("en-US", { maximumFractionDigits: 0 })
    : value.toLocaleString("en-US", { maximumSignificantDigits: 3 });
}

function signed(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${formatFlow(Math.abs(value))}`;
}

/** The sentence every shaped gauge carries, true whether dams store the
 * water or canals take it out (decision R8 is still open). */
export const SHAPED_SENTENCE =
  "Dams upstream store and release water, so this flow is not compared with normal.";

/** The sentence every natural gauge carries (ADR-144). */
export const NATURAL_SENTENCE =
  "Little or no water is stored upstream, so this flow is compared with normal for the date.";

/** WaterWatch's five class names. */
export const FLOW_CLASS_WORDS: Record<RiverFlowClass, string> = {
  much_below_normal: "Much below normal",
  below_normal: "Below normal",
  normal: "Normal",
  above_normal: "Above normal",
  much_above_normal: "Much above normal"
};

/** "October 30": the calendar day a band belongs to, with no year. */
export function calendarDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-US", {
    month: "long", day: "numeric", timeZone: "UTC"
  });
}

function cfsText(value: number): string {
  return `${formatFlowFigures(value)} ${FLOW_UNIT}`;
}

/** "The U.S. Geological Survey has 22 years of record for this date, fewer
 * than the usual 30." */
export function shortRecordSentence(years: number): string {
  return `The U.S. Geological Survey has ${years} years of record for this date, `
    + `fewer than the usual ${FULL_RECORD_YEARS}.`;
}

/** What a natural gauge says about today against normal, or why it says nothing. */
export function describeComparison(gauge: NaturalRiverGauge): {
  comparison: RiverComparison | null; withheld: string | null; rows: RiverRow[]; source: RiverRow[];
} {
  const day = calendarDay(gauge.as_of);
  if (!gauge.compared_with_normal) {
    const why = gauge.normal_withheld === "ten_years_or_fewer"
      ? "the U.S. Geological Survey has 10 or fewer years of record for this date"
      : "the U.S. Geological Survey gives no normal range for this date";
    return { comparison: null, withheld: `This flow is not compared with normal for ${day}: ${why}.`,
      rows: [], source: [] };
  }
  const band = gauge.normal_band;
  const short = gauge.short_record ? ` (fewer than the usual ${FULL_RECORD_YEARS})` : "";
  return {
    comparison: {
      label: `${FLOW_CLASS_WORDS[gauge.flow_class]} for ${day}`,
      detail: `Normal for this date is ${formatFlowFigures(band.p25)} to ${cfsText(band.p75)}: `
        + `the middle half of the approved daily values in ${band.years} years of record.`,
      shortRecord: gauge.short_record ? shortRecordSentence(band.years) : null
    },
    withheld: null,
    rows: [
      { label: `Normal range for ${day}`,
        value: `${formatFlowFigures(band.p25)} to ${cfsText(band.p75)}` },
      { label: `Median for ${day}`, value: cfsText(band.p50) },
      { label: "Much below normal", value: `Under ${cfsText(band.p10)}` },
      { label: "Much above normal", value: `Over ${cfsText(band.p90)}` },
      { label: "Years compared",
        value: `${band.years} years with an approved value on this date${short}` }
    ],
    source: [
      { label: "Normal range", value: "Daily values the U.S. Geological Survey approved, "
        + `for each date in the record. Read ${formatDate(band.retrieved)}.` }
    ]
  };
}

export function whereSentence(gauge: RiverGauge): string {
  const state = STATE_NAMES[gauge.state];
  const place = state ? `This gauge is in ${state}.` : "";
  const toward = gauge.flows_toward
    ? ` The river flows on toward ${gauge.flows_toward}.`
    : "";
  return `${place}${toward}`.trim();
}

/** What the survey says about a value's review, in words. */
export function approvalText(approval: string | null): string {
  switch (approval) {
    case "Provisional":
      return "Provisional. The U.S. Geological Survey can still revise this value.";
    case "Approved":
      return "Approved by the U.S. Geological Survey.";
    case null:
      return "The U.S. Geological Survey gives no review status for this value.";
    default:
      return `Review status from the U.S. Geological Survey: ${approval}.`;
  }
}

function shortApproval(day: RiverDay): string {
  if (day.cfs === null && day.approval === null) return "No value";
  const status = day.approval === "Provisional" ? "Provisional"
    : day.approval === "Approved" ? "Approved"
      : day.approval ?? "No status";
  const flags = day.qualifiers.map((q) => (q === "ESTIMATED" ? "estimated" : q));
  return flags.length ? `${status}, ${flags.join(", ")}` : status;
}

export function qualifierText(qualifiers: readonly string[]): string | null {
  if (qualifiers.length === 0) return null;
  const words = qualifiers.map((q) => (q === "ESTIMATED" ? "estimated" : q));
  return `The U.S. Geological Survey marks this value as ${words.join(", ")}.`;
}

export function lateMessage(gauge: RiverGauge): string | null {
  const parts: string[] = [];
  if (gauge.is_stale) {
    parts.push(gauge.days_stale === 1
      ? "This reading is late by one day."
      : `This reading is late by ${gauge.days_stale} days.`);
  }
  if (!gauge.fetch_ok) {
    parts.push("The newest request for this gauge failed, so this is the last "
      + "reading this site received.");
  }
  return parts.length ? parts.join(" ") : null;
}

function dayLabel(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("en-US", {
    month: "short", day: "numeric", timeZone: "UTC"
  });
}

export function riverDays(gauge: RiverGauge): RiverDayView[] {
  return gauge.daily.map((day) => ({
    date: day.date,
    label: dayLabel(day.date),
    fullLabel: formatDate(day.date),
    cfs: day.cfs,
    value: day.cfs === null ? "No value" : formatFlow(day.cfs),
    status: shortApproval(day)
  }));
}

export function describeGauge(gauge: RiverGauge): RiverView {
  const change = gauge.change_7d_cfs === null || gauge.change_7d_reference_date === null
    ? "No reading 7 days earlier to compare with."
    : `${signed(gauge.change_7d_cfs)} ${FLOW_UNIT} since ${formatDate(gauge.change_7d_reference_date)}`;
  const status = [approvalText(gauge.current_approval), qualifierText(gauge.current_qualifiers)]
    .filter((part): part is string => part !== null).join(" ");
  const area = gauge.drainage_area_sq_mi === null
    ? null : `${gauge.drainage_area_sq_mi.toLocaleString("en-US")} square miles`;
  const normal = gauge.tier === "natural" ? describeComparison(gauge)
    : { comparison: null, withheld: null, rows: [], source: [] };
  return {
    name: gauge.name,
    where: whereSentence(gauge),
    tier: gauge.tier,
    tierNote: gauge.tier === "natural" ? NATURAL_SENTENCE : SHAPED_SENTENCE,
    comparison: normal.comparison,
    withheld: normal.withheld,
    late: lateMessage(gauge),
    headline: `${formatFlowFigures(gauge.current_cfs)} ${FLOW_UNIT}`,
    basis: `mean flow on ${formatDate(gauge.as_of)}`,
    status,
    rows: [
      { label: "Reading date", value: formatDate(gauge.as_of) },
      ...normal.rows,
      { label: "Change in 7 days", value: change },
      { label: "Highest in 30 days",
        value: `${formatFlow(gauge.window_high_cfs)} ${FLOW_UNIT} on ${formatDate(gauge.window_high_date)}` },
      { label: "Lowest in 30 days",
        value: `${formatFlow(gauge.window_low_cfs)} ${FLOW_UNIT} on ${formatDate(gauge.window_low_date)}` },
      { label: "Days with a value", value: `${gauge.reported_days} of ${gauge.daily.length}` },
      { label: "Provisional values",
        value: `${gauge.provisional_days} of ${gauge.reported_days}` }
    ],
    days: riverDays(gauge),
    source: [
      { label: "Publisher", value: gauge.source_label },
      { label: "Station", value: gauge.source_station_id },
      { label: "Station name at the publisher", value: gauge.usgs_name },
      { label: "Measurement", value: "Daily mean flow, in cubic feet per second" },
      ...(area ? [{ label: "Drainage area", value: area }] : []),
      { label: "Subbasin", value: `${gauge.huc8_name} (${gauge.huc8})` },
      ...normal.source
    ],
    pageUrl: gauge.usgs_page
  };
}

/** What the page says about a gauge the payload withdrew (ADR-056). */
export function withdrawnSentence(notice: WithdrawnGauge): string {
  return `${notice.name} is not in the current published data. Its feed went quiet for `
    + `longer than the publication window. It was last read ${formatDate(notice.as_of)}.`;
}

interface CsvRow {
  gauge: RiverGauge;
  day: RiverDay;
}

/** One row per gauge and day: the exact values and flags the page draws. */
export function riversCsv(payload: RiverPayload): string {
  const rows: CsvRow[] = payload.gauges.flatMap((gauge) =>
    gauge.daily.map((day) => ({ gauge, day })));
  return serializeCsv(rows, [
    { header: "station", value: (row) => row.gauge.source_station_id },
    { header: "name", value: (row) => row.gauge.name },
    { header: "publisher_station_name", value: (row) => row.gauge.usgs_name },
    { header: "date", value: (row) => row.day.date },
    { header: "daily_mean_cfs", value: (row) => row.day.cfs },
    { header: "approval_status", value: (row) => row.day.approval },
    { header: "qualifiers", value: (row) => row.day.qualifiers.join(";") },
    { header: "compared_with_normal", value: (row) => row.gauge.compared_with_normal },
    { header: "source_url", value: (row) => row.gauge.source_url }
  ]);
}

export function riversCsvFilename(runDate: string): string {
  return `river-flow-${runDate.slice(0, 10)}.csv`;
}
