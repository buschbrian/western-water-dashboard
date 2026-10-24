import type { PrecipitationHistory, PrecipitationPayload, PrecipitationSite } from "../types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_DAY = /^\d{2}-\d{2}$/;

/**
 * The daily precipitation file, with each station's positions turned back
 * into dated readings. A position outside the calendar, or out of order, is
 * a file this cannot read rather than a row to skip, the snow validator's
 * rule.
 */
export function validatePrecipitationPayload(value: unknown): PrecipitationPayload {
  if (!isObject(value)) throw new Error("Precipitation payload is not an object.");
  const dates = value.series_dates;
  if (!Array.isArray(dates) || !dates.every((date) => typeof date === "string" && ISO_DATE.test(date))) {
    throw new Error("Precipitation payload has no readable calendar.");
  }
  if (typeof value.as_of !== "string" || !Number.isInteger(value.water_year)
    || !Number.isInteger(value.schema_version) || typeof value.generated_at !== "string") {
    throw new Error("Precipitation payload header is not readable.");
  }
  if (!Array.isArray(value.sites)) throw new Error("Precipitation payload has no sites.");
  const sites: PrecipitationSite[] = value.sites.map((raw: unknown, index: number) => {
    if (!isObject(raw) || typeof raw.station !== "string" || raw.station.length === 0
      || typeof raw.latest_date !== "string" || typeof raw.late !== "boolean"
      || !Array.isArray(raw.series_days) || !Array.isArray(raw.series_values)
      || raw.series_days.length !== raw.series_values.length) {
      throw new Error(`Precipitation site ${index} is not readable.`);
    }
    const readings = new Map<string, number>();
    let previous = -1;
    raw.series_days.forEach((day: unknown, position: number) => {
      const reading = (raw.series_values as unknown[])[position];
      if (!Number.isInteger(day) || (day as number) <= previous
        || (day as number) >= dates.length || !isFiniteNumber(reading)) {
        throw new Error(`Precipitation site ${raw.station as string} has an unreadable series.`);
      }
      previous = day as number;
      readings.set(dates[day as number] as string, reading);
    });
    return { station: raw.station, latest_date: raw.latest_date, late: raw.late, readings };
  });
  return {
    schema_version: value.schema_version as number,
    generated_at: value.generated_at,
    as_of: value.as_of,
    water_year: value.water_year as number,
    series_dates: dates as string[],
    site_count: sites.length,
    late_site_count: isFiniteNumber(value.late_site_count) ? value.late_site_count : 0,
    missing_site_count: isFiniteNumber(value.missing_site_count) ? value.missing_site_count : 0,
    sites
  };
}

/**
 * The history file, decoded from tenths and step changes to inches. Every
 * available station must hold one row per water year and one value per
 * step, or the bands would be drawn from a different set of years at
 * different stations -- the fault the fixed set exists to remove.
 */
export function validatePrecipitationHistory(value: unknown): PrecipitationHistory {
  if (!isObject(value)) throw new Error("Precipitation history is not an object.");
  const first = value.first_water_year;
  const last = value.last_water_year;
  const steps = value.step_month_days;
  if (!Number.isInteger(first) || !Number.isInteger(last) || (last as number) < (first as number)
    || !Array.isArray(steps) || steps.length < 2
    || !steps.every((step) => typeof step === "string" && MONTH_DAY.test(step))
    || !Array.isArray(value.sites) || typeof value.checked !== "string") {
    throw new Error("Precipitation history header is not readable.");
  }
  const yearCount = (last as number) - (first as number) + 1;
  const sites = new Map<string, number[][]>();
  for (const raw of value.sites as unknown[]) {
    if (!isObject(raw) || typeof raw.station !== "string") {
      throw new Error("Precipitation history has an unreadable station.");
    }
    if (raw.available !== true) continue;
    const years = raw.years;
    if (!Array.isArray(years) || years.length !== yearCount) {
      throw new Error(`Precipitation history for ${raw.station} does not cover the window.`);
    }
    sites.set(raw.station, years.map((encoded: unknown) => {
      if (!Array.isArray(encoded) || encoded.length !== steps.length
        || !encoded.every((step) => Number.isInteger(step))) {
        throw new Error(`Precipitation history for ${raw.station as string} has a short year.`);
      }
      let tenths = 0;
      return (encoded as number[]).map((change) => {
        tenths += change;
        return tenths / 10;
      });
    }));
  }
  return {
    schema_version: value.schema_version as number,
    checked: value.checked,
    first_water_year: first as number,
    last_water_year: last as number,
    step_month_days: steps as string[],
    site_count: isFiniteNumber(value.site_count) ? value.site_count : sites.size,
    available_site_count: sites.size,
    sites
  };
}
