/*
 * The runtime validator for `rivers.json` (ADR-136, ADR-144, ADR-145).
 *
 * The pipeline's rules, held again in the browser: a payload that does not
 * say what the page needs is refused whole, and so is one carrying a rank, a
 * total across gauges, an inflow, a withdrawal notice with a measurement in
 * it, a normal on a shaped gauge, or a natural gauge's class that does not
 * follow from its flow and its band.
 */
import type {
  RiverDay, RiverFlowClass, RiverGauge, RiverNormalBand, RiverPayload, WithdrawnGauge
} from "../types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isHttps(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("https://");
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

const DAY_MS = 86_400_000;

/** Fields neither a gauge nor the envelope may carry (ADR-124, ADR-136). */
export const REFUSED_RIVER_FIELDS = [
  "normal_cfs", "pct_of_normal", "seasonal_rank", "seasonal_rank_of", "percentile",
  "total_cfs", "combined_cfs", "sum_cfs", "inflow_cfs", "inflow",
  "capacity_af", "pct_of_capacity"
] as const;

/** What a natural record carries and a shaped record never does. */
const NORMAL_FIELDS = ["normal_band", "flow_class", "normal_withheld", "short_record"] as const;
const BAND_KEYS = ["p10", "p25", "p50", "p75", "p90"] as const;
const BAND_FIELDS = new Set(["day", ...BAND_KEYS, "years", "retrieved", "source_url"]);
const WITHHELD = new Set(["ten_years_or_fewer", "percentile_missing"]);
/** More than 10 years: the pipeline's `RIVER_NORMAL_MIN_YEARS` (ADR-145). */
export const MIN_NORMAL_YEARS = 11;
/** WaterWatch's usual record, the pipeline's `RIVER_NORMAL_FULL_YEARS`; a
 * band on fewer years carries `short_record: true`. */
export const FULL_RECORD_YEARS = 30;
/** The structure version this page reads, the pipeline's `RIVER_SCHEMA_VERSION`. */
export const RIVER_SCHEMA_VERSION = 3;

/** WaterWatch's class for a flow against one day's band; a value on a
 * boundary takes the class nearer normal, on both sides alike. */
export function flowClass(cfs: number, band: RiverNormalBand): RiverFlowClass {
  if (cfs < band.p10) return "much_below_normal";
  if (cfs < band.p25) return "below_normal";
  if (cfs <= band.p75) return "normal";
  if (cfs <= band.p90) return "above_normal";
  return "much_above_normal";
}

function isBand(value: unknown): value is RiverNormalBand {
  if (!isObject(value) || Object.keys(value).length !== BAND_FIELDS.size
      || !Object.keys(value).every((key) => BAND_FIELDS.has(key))) return false;
  const numbers = BAND_KEYS.map((key) => value[key]);
  return typeof value.day === "string" && /^\d{2}-\d{2}$/.test(value.day)
    && numbers.every(hasNumber) && (numbers as number[]).every((n, i, all) =>
      n >= 0 && (i === 0 || all[i - 1]! <= n))
    && hasNumber(value.years) && value.years >= MIN_NORMAL_YEARS
    && isDate(value.retrieved) && isHttps(value.source_url);
}

function checkComparison(value: Record<string, unknown>, name: string): void {
  if (value.tier === "shaped") {
    if (value.compared_with_normal !== false || NORMAL_FIELDS.some((field) => field in value)) {
      throw new Error(`${name}: a shaped gauge is never compared with normal`);
    }
    return;
  }
  if (value.tier !== "natural") throw new Error(`${name}: unknown tier`);
  if (!NORMAL_FIELDS.every((field) => field in value)) {
    throw new Error(`${name}: a natural gauge says whether it is compared with normal`);
  }
  if (value.compared_with_normal === false) {
    if (value.normal_band !== null || value.flow_class !== null || value.short_record !== null
        || typeof value.normal_withheld !== "string" || !WITHHELD.has(value.normal_withheld)) {
      throw new Error(`${name}: a natural gauge without a comparison says why, alone`);
    }
    return;
  }
  if (value.compared_with_normal !== true || value.normal_withheld !== null
      || !isBand(value.normal_band)) {
    throw new Error(`${name}: the normal band is malformed`);
  }
  if (value.short_record !== (value.normal_band.years < FULL_RECORD_YEARS)) {
    throw new Error(`${name}: short_record does not match the band's years`);
  }
  if (typeof value.as_of !== "string" || value.normal_band.day !== value.as_of.slice(5)) {
    throw new Error(`${name}: the normal band is not for the reading's date`);
  }
  if (!hasNumber(value.current_cfs)
      || value.flow_class !== flowClass(value.current_cfs, value.normal_band)) {
    throw new Error(`${name}: the class does not follow from the flow and the band`);
  }
}

const NOTICE_FIELDS = new Set([
  "name", "as_of", "days_stale", "source_label", "reason", "source_station_id"
]);

function refuse(record: Record<string, unknown>, label: string): void {
  for (const field of REFUSED_RIVER_FIELDS) {
    if (field in record) throw new Error(`${label}: refusing ${field}`);
  }
}

function isDay(value: unknown): value is RiverDay {
  return isObject(value) && isDate(value.date)
    && (value.cfs === null || (hasNumber(value.cfs) && value.cfs >= 0))
    && (value.approval === null || typeof value.approval === "string")
    && isTextList(value.qualifiers);
}

function validateGauge(value: unknown, index: number, windowDays: number): RiverGauge {
  if (!isObject(value)) throw new Error(`gauge ${index} is not an object`);
  const name = typeof value.name === "string" && value.name ? value.name : `gauge ${index}`;
  refuse(value, name);
  if (value.measurement !== "daily_mean_flow") {
    throw new Error(`${name}: a river record must say what it measures`);
  }
  checkComparison(value, name);
  if (typeof value.usgs_name !== "string" || !value.usgs_name
      || value.source_key !== "usgs" || typeof value.source_label !== "string"
      || typeof value.source_station_id !== "string" || !isHttps(value.source_url)
      || !isHttps(value.usgs_page) || typeof value.time_series_id !== "string"
      || value.unit !== "ft^3/s") {
    throw new Error(`${name}: provenance is incomplete`);
  }
  if (!hasNumber(value.lat) || !hasNumber(value.lon)) throw new Error(`${name}: no point`);
  if (value.flows_toward !== null && typeof value.flows_toward !== "string") {
    throw new Error(`${name}: flows_toward must be text or null`);
  }
  if (!isDate(value.as_of) || !hasNumber(value.days_stale)
      || typeof value.is_stale !== "boolean" || typeof value.fetch_ok !== "boolean"
      || !hasNumber(value.stale_after_days)) {
    throw new Error(`${name}: freshness fields are incomplete`);
  }
  if (!hasNumber(value.current_cfs) || value.current_cfs < 0
      || !(value.current_approval === null || typeof value.current_approval === "string")
      || !isTextList(value.current_qualifiers)) {
    throw new Error(`${name}: the current flow is malformed`);
  }
  if (!(value.change_7d_cfs === null || hasNumber(value.change_7d_cfs))
      || !(value.change_7d_reference_date === null || isDate(value.change_7d_reference_date))
      || (value.change_7d_cfs === null) !== (value.change_7d_reference_date === null)) {
    throw new Error(`${name}: the 7-day change is malformed`);
  }
  if (!hasNumber(value.window_high_cfs) || !isDate(value.window_high_date)
      || !hasNumber(value.window_low_cfs) || !isDate(value.window_low_date)
      || !hasNumber(value.reported_days) || !hasNumber(value.provisional_days)) {
    throw new Error(`${name}: the window summary is malformed`);
  }
  const daily = value.daily;
  if (!Array.isArray(daily) || daily.length !== windowDays || !daily.every(isDay)) {
    throw new Error(`${name}: the window must hold ${windowDays} readable days`);
  }
  for (let i = 1; i < daily.length; i += 1) {
    const gap = Date.parse(`${daily[i]!.date}T00:00:00Z`) - Date.parse(`${daily[i - 1]!.date}T00:00:00Z`);
    if (gap !== DAY_MS) throw new Error(`${name}: the window's days are not consecutive`);
  }
  const last = daily[daily.length - 1]!;
  if (last.date !== value.as_of || last.cfs !== value.current_cfs
      || value.window_end !== value.as_of || value.window_start !== daily[0]!.date) {
    throw new Error(`${name}: the window does not end on the current reading`);
  }
  if (daily.filter((day) => day.cfs !== null).length !== value.reported_days) {
    throw new Error(`${name}: reported_days does not match the window`);
  }
  return value as unknown as RiverGauge;
}

function validateNotice(value: unknown, index: number): WithdrawnGauge {
  if (!isObject(value)) throw new Error(`withdrawn gauge ${index} is not an object`);
  if (typeof value.name !== "string" || !isDate(value.as_of) || !hasNumber(value.days_stale)
      || typeof value.reason !== "string") {
    throw new Error("a withdrawn gauge is missing its name, date, age or reason");
  }
  for (const field of Object.keys(value)) {
    if (!NOTICE_FIELDS.has(field)) {
      throw new Error(`${value.name}: a withdrawal notice carries no measurement (${field})`);
    }
  }
  return value as unknown as WithdrawnGauge;
}

export function validateRiverPayload(value: unknown): RiverPayload {
  if (!isObject(value)) throw new Error("rivers payload is not an object");
  if (value.schema_version !== RIVER_SCHEMA_VERSION) {
    throw new Error(`unsupported rivers structure version ${String(value.schema_version)}`);
  }
  refuse(value, "rivers payload");
  if (value.measurement !== "daily_mean_flow" || typeof value.fetched_at !== "string"
      || !isDate(value.run_date) || !hasNumber(value.window_days)
      || !hasNumber(value.stale_after_days) || !hasNumber(value.withdraw_after_days)) {
    throw new Error("rivers payload header is incomplete");
  }
  if (!Array.isArray(value.gauges) || !Array.isArray(value.withdrawn)) {
    throw new Error("rivers payload is missing its lists");
  }
  const windowDays = value.window_days;
  const gauges = value.gauges.map((gauge, index) => validateGauge(gauge, index, windowDays));
  const withdrawn = value.withdrawn.map(validateNotice);
  if (value.gauge_count !== gauges.length) throw new Error("gauge_count does not match");
  if (value.withdrawn_count !== withdrawn.length) throw new Error("withdrawn_count does not match");
  if (value.stale_count !== gauges.filter((gauge) => gauge.is_stale).length) {
    throw new Error("stale_count does not match the gauges");
  }
  for (const notice of withdrawn) {
    if (notice.days_stale <= value.withdraw_after_days) {
      throw new Error(`${notice.name}: a withdrawn gauge is inside the publication window`);
    }
  }
  const stations = new Set<string>();
  for (const station of [...gauges.map((g) => g.source_station_id),
    ...withdrawn.map((w) => w.source_station_id ?? w.name)]) {
    if (stations.has(station)) throw new Error(`${station} appears twice`);
    stations.add(station);
  }
  return { ...value, gauges, withdrawn } as RiverPayload;
}
