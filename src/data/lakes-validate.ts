/*
 * The runtime validator for `lakes.json` (ADR-117).
 *
 * The same posture as the reservoir validator: a payload that does not say
 * what the page needs is refused whole, because a lake drawn from a half-read
 * record is a wrong number on a public page. What is particular here is what
 * is *refused for being present*: a lake record carrying a capacity or a
 * percent full, and a withdrawal notice carrying a level or a volume. Both
 * are the pipeline's own rules (ADR-112, ADR-056) and the client holds them
 * too, so a payload written by something other than the pipeline cannot
 * smuggle a full level onto a lake.
 */
import type {
  LakeElevation, LakeMeasurement, LakePayload, LakeTarget, LakeVolume,
  MonthlyRecord, TerminalLake, WithdrawnLake
} from "../types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasNullableNumber(value: unknown): value is number | null {
  return value === null || hasNumber(value);
}

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function hasNullableDate(value: unknown): value is string | null {
  return value === null || isDate(value);
}

function isHttps(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("https://");
}

/** Reservoir fields a lake record must never carry (ADR-112). */
const RESERVOIR_ONLY = [
  "capacity_af", "capacity_basis", "pct_of_capacity", "physical_capacity_af",
  "capacity_history", "current_storage_af", "seasonal_normal_af", "baselines",
  "pct_of_record_max", "pct_of_peak_this_year", "dam_lat", "dam_lon", "nid_id"
] as const;

const NOTICE_FIELDS = new Set(["name", "as_of", "days_stale", "source_label", "reason"]);

function isMeasurement(value: unknown): value is LakeMeasurement {
  if (!isObject(value)) return false;
  if (!hasNumber(value.current) || !isDate(value.as_of)) return false;
  if (!hasNumber(value.record_high) || !isDate(value.record_high_date)) return false;
  if (!hasNumber(value.record_low) || !isDate(value.record_low_date)) return false;
  if (!isDate(value.first_obs) || !hasNumber(value.n_obs)) return false;
  for (const window of ["7d", "30d", "365d"]) {
    if (!hasNullableNumber(value[`change_${window}`])) return false;
    if (!hasNullableDate(value[`change_${window}_reference_date`])) return false;
    if (!hasNullableNumber(value[`change_${window}_elapsed_days`])) return false;
  }
  if (!hasNullableNumber(value.seasonal_rank) || !hasNullableNumber(value.seasonal_rank_of)) {
    return false;
  }
  return typeof value.parameter_code === "string" && typeof value.statistic_id === "string";
}

function isElevation(value: unknown): value is LakeElevation {
  if (!isObject(value) || !isMeasurement(value)) return false;
  const record: Record<string, unknown> = value;
  return record.unit === "ft"
    && typeof record.vertical_datum === "string" && record.vertical_datum.length > 0
    /* A level above a datum has no percentage; one arriving here is a
     * reservoir field wearing a lake's name (ADR-112). */
    && !("change_365d_pct" in record);
}

function isMonthly(value: unknown): value is MonthlyRecord[] {
  return Array.isArray(value) && value.every((entry) =>
    isObject(entry) && typeof entry.month === "string"
    && hasNullableNumber(entry.mean_af) && hasNullableNumber(entry.min_af)
    && hasNullableNumber(entry.max_af) && hasNullableNumber(entry.end_af)
    && hasNumber(entry.days) && hasNullableNumber(entry.normal_af));
}

function isVolume(value: unknown): value is LakeVolume {
  if (!isObject(value) || !isMeasurement(value)) return false;
  const record: Record<string, unknown> = value;
  if (record.unit !== "acre_feet") return false;
  const relation = record.relation;
  if (!isObject(relation) || typeof relation.name !== "string" || !relation.name
      || !isHttps(relation.source_url) || !hasNullableDate(relation.in_use_from ?? null)) {
    return false;
  }
  for (const window of ["7d", "30d", "365d"]) {
    if (!hasNullableNumber(record[`change_${window}_pct`])) return false;
  }
  return isMonthly(record.monthly);
}

function isTarget(value: unknown): value is LakeTarget {
  return isObject(value) && typeof value.name === "string" && value.name.length > 0
    && typeof value.authority === "string" && value.authority.length > 0
    && isHttps(value.source_url) && isDate(value.set_on)
    && hasNumber(value.elevation_ft)
    /* A target spelled as a capacity or a share is refused, not ignored. */
    && !("capacity_af" in value) && !("volume_af" in value) && !("pct" in value);
}

function validateLake(value: unknown, index: number): TerminalLake {
  if (!isObject(value)) throw new Error(`lake ${index} is not an object`);
  const name = typeof value.name === "string" ? value.name : `lake ${index}`;
  if (value.water_type !== "natural_terminal_lake") {
    throw new Error(`${name}: a lake record must say what it is`);
  }
  for (const field of RESERVOIR_ONLY) {
    if (field in value) throw new Error(`${name}: a terminal lake has no full level (${field})`);
  }
  if (typeof value.name !== "string" || !value.name) throw new Error(`lake ${index} has no name`);
  if (value.source_key !== "usgs" || typeof value.source_label !== "string"
      || !isHttps(value.source_url) || typeof value.source_station_id !== "string") {
    throw new Error(`${name}: provenance is incomplete`);
  }
  if (!hasNumber(value.lat) || !hasNumber(value.lon)) throw new Error(`${name}: no point`);
  if (value.state !== null && typeof value.state !== "string") {
    throw new Error(`${name}: state must be a code or null`);
  }
  if (value.data_frequency !== "daily" || !hasNumber(value.stale_after_days)) {
    throw new Error(`${name}: the series must be daily with a late threshold`);
  }
  if (!isDate(value.as_of) || !hasNumber(value.days_stale)
      || typeof value.is_stale !== "boolean" || typeof value.fetch_ok !== "boolean") {
    throw new Error(`${name}: freshness fields are incomplete`);
  }
  if (!isElevation(value.elevation)) throw new Error(`${name}: the elevation block is malformed`);
  if (!isVolume(value.volume)) throw new Error(`${name}: the volume block is malformed`);
  if (!Array.isArray(value.targets) || !value.targets.every(isTarget)) {
    throw new Error(`${name}: a target is a named level with its authority, source and date`);
  }
  if (!isDate(value.first_obs) || !hasNumber(value.years_of_record)) {
    throw new Error(`${name}: record provenance is incomplete`);
  }
  for (const field of ["huc6", "huc6_name", "huc8", "huc8_name"]) {
    const huc = value[field];
    if (huc !== undefined && huc !== null && typeof huc !== "string") {
      throw new Error(`${name}: ${field} must be text or null`);
    }
  }
  return value as unknown as TerminalLake;
}

function validateNotice(value: unknown, index: number): WithdrawnLake {
  if (!isObject(value)) throw new Error(`withdrawn lake ${index} is not an object`);
  if (typeof value.name !== "string" || !isDate(value.as_of) || !hasNumber(value.days_stale)
      || typeof value.reason !== "string") {
    throw new Error("a withdrawn lake is missing its name, date, age or reason");
  }
  if (value.source_label !== null && typeof value.source_label !== "string") {
    throw new Error(`${value.name}: a notice's source is text or null`);
  }
  for (const field of Object.keys(value)) {
    if (!NOTICE_FIELDS.has(field)) {
      throw new Error(`${value.name}: a withdrawal notice carries no measurement (${field})`);
    }
  }
  return value as unknown as WithdrawnLake;
}

export function validateLakePayload(value: unknown): LakePayload {
  if (!isObject(value)) throw new Error("lakes payload is not an object");
  if (value.schema_version !== 1) {
    throw new Error(`unsupported lakes structure version ${String(value.schema_version)}`);
  }
  if (value.water_type !== "natural_terminal_lake") {
    throw new Error("lakes payload does not declare its water type");
  }
  if (typeof value.method_version !== "string" || typeof value.fetched_at !== "string"
      || !isDate(value.run_date)) {
    throw new Error("lakes payload header is incomplete");
  }
  if (!hasNumber(value.stale_after_days) || !hasNumber(value.withdraw_after_days)) {
    throw new Error("lakes payload has no freshness thresholds");
  }
  if (!Array.isArray(value.lakes) || !Array.isArray(value.withdrawn)) {
    throw new Error("lakes payload is missing its lists");
  }
  const lakes = value.lakes.map(validateLake);
  const withdrawn = value.withdrawn.map(validateNotice);
  if (value.lake_count !== lakes.length) throw new Error("lake_count does not match the lakes array");
  if (value.withdrawn_count !== withdrawn.length) {
    throw new Error("withdrawn_count does not match the withdrawn array");
  }
  const stale = lakes.filter((lake) => lake.is_stale).length;
  if (value.stale_count !== stale) throw new Error("stale_count does not match the lakes");
  for (const notice of withdrawn) {
    if (notice.days_stale <= value.withdraw_after_days) {
      throw new Error(`${notice.name}: a withdrawn lake is inside the publication window`);
    }
  }
  const names = new Set<string>();
  for (const name of [...lakes.map((l) => l.name), ...withdrawn.map((w) => w.name)]) {
    if (names.has(name)) throw new Error(`${name} appears twice`);
    names.add(name);
  }
  return { ...value, lakes, withdrawn } as LakePayload;
}
