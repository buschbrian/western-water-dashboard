import type { SoilMoisturePayload, SoilMoistureRollup, SoilMoistureSite, SoilNoChangeReason } from "../types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const nullableNumber = (value: unknown): value is number | null => value === null || isFiniteNumber(value);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (value: unknown): value is string => typeof value === "string" && ISO_DATE.test(value);
const REASONS: readonly SoilNoChangeReason[] = ["missing_reading", "frozen", "no_temperature"];
/** Volumetric water content cannot leave 0 to 100 percent. */
const isPercent = (value: unknown): boolean => value === null || (isFiniteNumber(value) && value >= 0 && value <= 100);

/**
 * The daily soil-moisture file (ADR-142). A change and its reason are two
 * halves of one fact: a station either has a change and no reason, or a
 * reason and no change. A file that breaks that, or whose change does not
 * equal its own two days, is one this cannot read rather than a row to skip.
 */
export function validateSoilMoisturePayload(value: unknown): SoilMoisturePayload {
  if (!isObject(value)) throw new Error("Soil moisture payload is not an object.");
  if (!Number.isInteger(value.schema_version) || typeof value.generated_at !== "string" || !isDate(value.as_of)
    || !Number.isInteger(value.change_days) || !isCount(value.minimum_reporting_sites)) {
    throw new Error("Soil moisture payload header is not readable.");
  }
  const endDate = value.end_date;
  const startDate = value.start_date;
  if (!(endDate === null && startDate === null) && !(isDate(endDate) && isDate(startDate) && startDate < endDate)) {
    throw new Error("Soil moisture payload has no readable week.");
  }
  if (!Array.isArray(value.sites) || !Array.isArray(value.rollups)) {
    throw new Error("Soil moisture payload has no sites.");
  }
  const seen = new Set<string>();
  const sites: SoilMoistureSite[] = value.sites.map((raw: unknown, index: number) => {
    if (!isObject(raw) || typeof raw.station !== "string" || raw.station.length === 0 || seen.has(raw.station)
      || !(raw.latest_date === null || isDate(raw.latest_date)) || typeof raw.late !== "boolean"
      || !Array.isArray(raw.depths_inches) || raw.depths_inches.length !== 3
      || !raw.depths_inches.every((depth) => isFiniteNumber(depth) && depth >= 0)
      || !isPercent(raw.end_percent) || !isPercent(raw.start_percent) || !nullableNumber(raw.change_points)) {
      throw new Error(`Soil moisture site ${index} is not readable.`);
    }
    seen.add(raw.station);
    const reason = raw.no_change_reason;
    const change = raw.change_points;
    if (change === null ? !REASONS.includes(reason as SoilNoChangeReason) : reason !== null) {
      throw new Error(`Soil moisture site ${raw.station} has a change and a reason that disagree.`);
    }
    if (change !== null) {
      if (endDate === null || raw.end_percent === null || raw.start_percent === null
        || Math.abs((raw.end_percent as number) - (raw.start_percent as number) - change) > 0.051) {
        throw new Error(`Soil moisture site ${raw.station} has a change that is not its two days.`);
      }
    }
    return {
      station: raw.station,
      depths_inches: raw.depths_inches as [number, number, number],
      latest_date: raw.latest_date,
      late: raw.late,
      end_percent: raw.end_percent as number | null,
      start_percent: raw.start_percent as number | null,
      change_points: change,
      no_change_reason: (reason ?? null) as SoilNoChangeReason | null
    };
  });
  const rollups: SoilMoistureRollup[] = value.rollups.map((raw: unknown, index: number) => {
    if (!isObject(raw) || typeof raw.huc6 !== "string" || typeof raw.huc6_name !== "string"
      || !isCount(raw.site_count) || !isCount(raw.measured_site_count) || !isCount(raw.minimum_reporting_sites)
      || raw.measured_site_count > raw.site_count || !nullableNumber(raw.mean_change_points)
      || (raw.mean_change_points !== null) !== (raw.measured_site_count >= raw.minimum_reporting_sites)) {
      throw new Error(`Soil moisture area ${index} is not readable.`);
    }
    return {
      huc6: raw.huc6, huc6_name: raw.huc6_name, site_count: raw.site_count,
      measured_site_count: raw.measured_site_count, minimum_reporting_sites: raw.minimum_reporting_sites,
      mean_change_points: raw.mean_change_points
    };
  });
  const measured = sites.filter((site) => site.change_points !== null).length;
  return {
    schema_version: value.schema_version as number,
    generated_at: value.generated_at,
    as_of: value.as_of,
    change_days: value.change_days as number,
    end_date: endDate as string | null,
    start_date: startDate as string | null,
    minimum_reporting_sites: value.minimum_reporting_sites,
    site_count: sites.length,
    measured_site_count: measured,
    frozen_site_count: sites.filter((site) => site.no_change_reason === "frozen").length,
    late_site_count: sites.filter((site) => site.late).length,
    missing_site_count: isCount(value.missing_site_count) ? value.missing_site_count : 0,
    rollups,
    sites
  };
}
