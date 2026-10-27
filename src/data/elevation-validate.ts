/*
 * The runtime checks for a reviewed reservoir level (ADR-135): the block on a
 * reservoir record and the daily history the reservoir page charts.
 *
 * A level is refused whole when it says less than the page shows, and refused
 * for what it carries when it carries a percentage: a share of a height above
 * a datum has no meaning (ADR-112), and the pipeline never writes one.
 */
import type { ElevationHistoryEntry, ElevationHistoryPayload, ReservoirElevation } from "../types";

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

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOffset(value: unknown): boolean {
  return value === null || (isObject(value)
    && isText(value.to_datum) && hasNumber(value.offset_ft)
    && isText(value.usgs_site) && isObject(value.parameters)
    && isHttps(value.source_url) && isDate(value.measured));
}

function isDerivedOffset(value: unknown): boolean {
  return value === undefined || (isObject(value)
    && isText(value.to_datum) && hasNumber(value.offset_ft) && isText(value.basis)
    && isDate(value.checked) && Array.isArray(value.sources) && value.sources.length > 0
    && value.sources.every((source) => isObject(source) && isText(source.citation)
      && isHttps(source.url)));
}

function isReferenceLevel(value: unknown): boolean {
  return isObject(value) && hasNumber(value.elevation_ft)
    && isText(value.label) && isText(value.authority) && isHttps(value.url)
    && (value.source_term === undefined || typeof value.source_term === "string")
    && !("pct" in value) && !("capacity_af" in value) && !("volume_af" in value);
}

export function isReservoirElevation(value: unknown): value is ReservoirElevation {
  if (!isObject(value)) return false;
  if (Object.keys(value).some((key) => key.endsWith("_pct"))) return false;
  if (value.unit !== "ft" || !isText(value.vertical_datum)) return false;
  /* A project datum is published only with its name and its stated relation
   * to a national datum; a national datum carries neither. */
  if (value.vertical_datum === "project") {
    const relation = value.datum_relation;
    if (!isText(value.datum_name) || !isObject(relation) || !isText(relation.datum)
        || !hasNumber(relation.add_ft) || !isText(relation.quote)
        || !isHttps(relation.source_url)) return false;
  } else if (value.datum_name !== undefined || value.datum_relation !== undefined) {
    return false;
  }
  if (!hasNumber(value.source_item_id) || !isHttps(value.source_url)) return false;
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
  const starts = value.record_starts;
  if (starts !== undefined && !(isObject(starts) && isDate(starts.date) && isText(starts.reason)
      && isText(starts.basis) && isText(starts.quote) && isHttps(starts.source_url))) return false;
  if (value.reference_levels_datum_stated !== undefined
      && typeof value.reference_levels_datum_stated !== "boolean") return false;
  return isOffset(value.datum_offset) && isDerivedOffset(value.derived_offset)
    && Array.isArray(value.reference_levels) && value.reference_levels.every(isReferenceLevel);
}

function validateEntry(value: unknown, index: number): ElevationHistoryEntry {
  if (!isObject(value)) throw new Error(`elevation history ${index} is not an object`);
  const name = isText(value.name) ? value.name : `entry ${index}`;
  if (!isText(value.name) || !isText(value.source_station_id) || !hasNumber(value.source_item_id)
      || !isText(value.vertical_datum)) {
    throw new Error(`${name}: the history does not say whose level it is or its datum`);
  }
  if (!isDate(value.start) || !isDate(value.end) || !Array.isArray(value.values)) {
    throw new Error(`${name}: the history has no dated series`);
  }
  const days = Math.round((Date.parse(`${value.end}T00:00:00Z`)
    - Date.parse(`${value.start}T00:00:00Z`)) / 86_400_000) + 1;
  if (value.values.length !== days || !value.values.every(hasNullableNumber)) {
    throw new Error(`${name}: ${value.values.length} values do not fill ${days} days`);
  }
  return value as unknown as ElevationHistoryEntry;
}

export function validateElevationHistory(value: unknown): ElevationHistoryPayload {
  if (!isObject(value)) throw new Error("elevation history is not an object");
  if (value.schema_version !== 1) {
    throw new Error(`unsupported elevation history version ${String(value.schema_version)}`);
  }
  if (value.unit !== "ft" || typeof value.fetched_at !== "string" || !isDate(value.run_date)
      || !Array.isArray(value.reservoirs)) {
    throw new Error("elevation history header is incomplete");
  }
  return { ...value, reservoirs: value.reservoirs.map(validateEntry) } as ElevationHistoryPayload;
}
