import type { FlowHistory } from "./data/reservoir-flow-history";
import { stormTotals } from "./precip-storm-model";
import type { ElevationHistoryEntry, PrecipitationPayload, RiverPayload } from "./types";

export interface ContextRow {
  label: string;
  unit: string;
  values: (number | null)[];
  source: string;
  reportingSites?: number[];
}

export interface ReservoirContext { dates: string[]; rows: ContextRow[] }

export function reservoirContext(stations: readonly string[], rain: PrecipitationPayload,
  rivers: RiverPayload | null, level: ElevationHistoryEntry | null,
  flow: Partial<Record<"inflow" | "release", FlowHistory>>, runDate: string): ReservoirContext {
  const day = Date.parse(runDate.slice(0, 10));
  const dates = Array.from({ length: 30 }, (_, i) => new Date(day - (29 - i) * 86400000).toISOString().slice(0, 10));
  const read = (entry: { start: string; values: (number | null)[] }): (number | null)[] => dates.map((date) =>
    entry.values[(Date.parse(date) - Date.parse(entry.start)) / 86400000] ?? null);
  const catches = dates.map((date) => {
    const end = rain.series_dates.indexOf(date);
    if (end < 1) return { value: null, sites: 0 };
    const totals = stormTotals(stations, { ...rain, series_dates: rain.series_dates.slice(0, end + 1) });
    const one = totals.windows.find((window) => window.days === 1);
    return totals.endDate === date && one ? { value: one.meanInches, sites: one.totals.length }
      : { value: null, sites: 0 };
  });
  const rows: ContextRow[] = [{ label: "Rain and snow caught upstream: mean at reporting sites",
    unit: "inches per day", source: "https://wcc.sc.egov.usda.gov/awdbRestApi/",
    values: catches.map((day) => day.value), reportingSites: catches.map((day) => day.sites) }];
  for (const gauge of rivers?.gauges.filter((gauge) => gauge.flows_toward === "Lake Powell") ?? []) {
    const byDate = new Map(gauge.daily.map((day) => [day.date, day.cfs]));
    rows.push({ label: `${gauge.name} · river flow toward Lake Powell`, unit: "cubic feet per second",
      source: gauge.usgs_page, values: dates.map((date) => byDate.get(date) ?? null) });
  }
  for (const key of ["inflow", "release"] as const) {
    const entry = flow[key];
    rows.push({ label: key === "inflow" ? "Reservoir inflow, computed by Reclamation" : "Total dam release",
      unit: "cubic feet per second", source: entry?.source_url ?? "https://data.usbr.gov/",
      values: entry ? read(entry) : dates.map(() => null) });
  }
  if (level) rows.push({ label: "Reservoir surface level", unit: "feet above the datum named on this page",
    source: `https://data.usbr.gov/rise/api/catalog-item/${level.source_item_id}`, values: read(level) });
  return { dates, rows };
}
