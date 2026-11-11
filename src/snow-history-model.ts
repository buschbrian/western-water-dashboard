import { quantile, stepDate, valueOnDate, type BandStep, type DayValue } from "./precip-model";
import { headlineFloor, normalIsComparable } from "./snow-model";
import type { PrecipitationHistory, SnowSite } from "./types";

export interface SnowHistoryView {
  stations: string[];
  placeSites: number;
  withoutHistory: number;
  late: number;
  firstWaterYear: number;
  lastWaterYear: number;
  years: number;
  bands: BandStep[];
  current: DayValue[];
  headline: { date: string; inches: number; normalInches: number | null; percentOfNormal: number | null } | null;
}

export function snowHistoryView(
  sites: readonly SnowSite[], history: PrecipitationHistory, waterYear: number
): SnowHistoryView {
  const withHistory = sites.filter((site) => history.sites.has(site.station));
  const eligible = withHistory.filter((site) => !site.late);
  const maps = new Map(eligible.map((site) => [site.station,
    new Map(site.series.map(([day, snow, normal]) => [day, { snow, normal }]))]));
  const start = `${waterYear - 1}-10-01`;
  const end = `${waterYear}-09-30`;
  const dates = [...new Set(eligible.flatMap((site) => site.series.map(([day]) => day)))]
    .filter((day) => day >= start && day <= end).sort();
  const needed = Math.ceil(eligible.length * 0.9);
  const setDay = eligible.length ? [...dates].reverse().find((day) => eligible.filter((site) =>
    maps.get(site.station)?.get(day)?.snow != null).length >= needed) : undefined;
  const fixed = setDay ? eligible.filter((site) => maps.get(site.station)?.get(setDay)?.snow != null) : [];
  const stations = fixed.map((site) => site.station);
  const lastWaterYear = Math.min(history.last_water_year, waterYear - 1);
  const years = Math.max(0, lastWaterYear - history.first_water_year + 1);
  const view: SnowHistoryView = {
    stations, placeSites: sites.length, withoutHistory: sites.length - withHistory.length,
    late: withHistory.length - eligible.length, firstWaterYear: history.first_water_year,
    lastWaterYear, years, bands: [], current: [], headline: null
  };
  if (!stations.length || !years) return view;
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const stepDates = history.step_month_days.map((day) => stepDate(waterYear, day));
  const curves = Array.from({ length: years }, (_, year) => stepDates.map((_, step) =>
    average(stations.map((station) => history.sites.get(station)![year]![step]!))));
  const first = Date.parse(`${stepDates[0]}T00:00:00Z`);
  const last = Date.parse(`${stepDates.at(-1)}T00:00:00Z`);
  for (let stamp = first; stamp <= last; stamp += 86400000) {
    const date = new Date(stamp).toISOString().slice(0, 10);
    const sorted = curves.map((curve) => valueOnDate(curve, stepDates, date)!).sort((a, b) => a - b);
    view.bands.push({ date, lowest: sorted[0]!, low10: quantile(sorted, 0.1), low25: quantile(sorted, 0.25),
      median: quantile(sorted, 0.5), high75: quantile(sorted, 0.75), high90: quantile(sorted, 0.9), highest: sorted.at(-1)! });
  }
  view.current = dates.filter((day) => day <= setDay!).map((date) => {
    const values = stations.map((station) => maps.get(station)!.get(date)?.snow);
    return { date, inches: values.every((value) => value != null) ? average(values as number[]) : null };
  });
  const newest = [...view.current].reverse().find((day) => day.inches !== null);
  if (newest) {
    const normals = stations.map((station) => maps.get(station)!.get(newest.date)?.normal);
    const normal = normals.every((value) => value != null) ? average(normals as number[]) : null;
    view.headline = { date: newest.date, inches: newest.inches!, normalInches: normal,
      percentOfNormal: normal !== null && normalIsComparable(normal) && stations.length >= headlineFloor(stations.length, 2)
        ? newest.inches! / normal * 100 : null };
  }
  return view;
}
