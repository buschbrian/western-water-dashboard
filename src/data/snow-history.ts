import { fetchWithin } from "./fetch";
import { SNOW_TIMEOUT_MS } from "./snow-load";
import { validatePrecipitationHistory } from "./precip-validate";
import type { PrecipitationHistory } from "../types";

export function validateSnowHistory(value: unknown): PrecipitationHistory {
  const raw = value as Record<string, unknown> | null;
  if (!raw || raw.schema_version !== 1 || raw.element !== "WTEQ" || raw.first_water_year !== 1991) {
    throw new Error("Snow history has an unreadable measurement or window.");
  }
  const history = validatePrecipitationHistory(value);
  const ids = (raw.sites as { station: string }[]).map((site) => site.station);
  if (new Set(ids).size !== ids.length || [...history.sites.values()].some((years) =>
    years.some((year) => year.some((inches) => !Number.isFinite(inches) || inches < 0)))) {
    throw new Error("Snow history has repeated stations or invalid snow values.");
  }
  const steps = history.step_month_days.map((day) => `${day >= "10-01" ? "2025" : "2026"}-${day}`);
  if (history.step_month_days[0] !== "10-01" || history.step_month_days.at(-1) !== "09-30" ||
    steps.some((day, index) => !Number.isFinite(Date.parse(day)) ||
      new Date(day).toISOString().slice(0, 10) !== day || (index > 0 && day <= steps[index - 1]!))) {
    throw new Error("Snow history has an invalid step calendar.");
  }
  return history;
}

export async function loadSnowHistory(): Promise<PrecipitationHistory> {
  const response = await fetchWithin(import.meta.env.DEV ? "./snow_history.json" : "./data/snow_history.json", SNOW_TIMEOUT_MS);
  return validateSnowHistory(await response.json() as unknown);
}
