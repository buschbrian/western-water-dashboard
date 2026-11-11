/*
 * Snow water against earlier seasons (ADR-165): the snow page's place,
 * measured at one fixed set of sites in every season, by the precipitation
 * history's rules (ADR-125). Every number is a mean over that one set, so
 * a band is a statement about snow and never about which sites reported.
 */
import { newestSetDay, quantile, stepDate, valueOnDate, type BandStep, type DayValue } from "./precip-model";
import { headlineFloor, normalIsComparable } from "./snow-model";
import type { PrecipitationHistory, SnowSite } from "./types";

export interface SnowHistoryHeadline {
  date: string;
  inches: number;
  /** The median of the earlier seasons on the same date, at the same sites. */
  medianInches: number;
  /** 1 is the most snow. Seasons with the same value, to a tenth, share a rank. */
  rank: number;
  rankedYears: number;
  /** Sites in the set with a published normal on the date: the ones the
   * percent is summed over (ADR-081). */
  normalSites: number;
  /** Their mean normal, or null when none has one. */
  normalInches: number | null;
  /** Their snow water added up over their normal added up, once (ADR-081).
   * Null below either floor the page's headline holds (ADR-121): a mean
   * normal under an inch, or fewer than half the place's sites. */
  percentOfNormal: number | null;
  meetsSiteFloor: boolean;
}

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
  headline: SnowHistoryHeadline | null;
}

const roundTenth = (value: number): number => Math.round(value * 10) / 10;
const average = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

export function snowHistoryView(
  sites: readonly SnowSite[], history: PrecipitationHistory, waterYear: number
): SnowHistoryView {
  const withHistory = sites.filter((site) => history.sites.has(site.station));
  const eligible = withHistory.filter((site) => !site.late);
  const readings = new Map(eligible.map((site) => [site.station,
    new Map(site.series.flatMap(([day, snow, normal]) =>
      snow === null ? [] : [[day, { snow, normal }] as const]))]));
  const start = `${waterYear - 1}-10-01`;
  const end = `${waterYear}-09-30`;
  const dates = [...new Set(eligible.flatMap((site) => site.series.map(([day]) => day)))]
    .filter((day) => day >= start && day <= end).sort();
  /* The set is the sites with a value on the newest day that nine in ten
   * eligible sites report, as for precipitation; a site without one that
   * day is counted as late. */
  const setDay = newestSetDay(dates, eligible.map((site) => ({ readings: readings.get(site.station)! })));
  const stations = setDay === undefined ? []
    : eligible.filter((site) => readings.get(site.station)!.has(setDay)).map((site) => site.station);
  const lastWaterYear = Math.min(history.last_water_year, waterYear - 1);
  const years = Math.max(0, lastWaterYear - history.first_water_year + 1);
  const view: SnowHistoryView = {
    stations, placeSites: sites.length, withoutHistory: sites.length - withHistory.length,
    late: withHistory.length - stations.length, firstWaterYear: history.first_water_year,
    lastWaterYear, years, bands: [], current: [], headline: null
  };
  if (!stations.length || !years) return view;

  const stepDates = history.step_month_days.map((day) => stepDate(waterYear, day));
  const curves = Array.from({ length: years }, (_, year) => stepDates.map((_, step) =>
    average(stations.map((station) => history.sites.get(station)![year]![step]!))));
  const first = Date.parse(`${stepDates[0]}T00:00:00Z`);
  const last = Date.parse(`${stepDates.at(-1)}T00:00:00Z`);
  for (let stamp = first; stamp <= last; stamp += 86_400_000) {
    const date = new Date(stamp).toISOString().slice(0, 10);
    const sorted = curves.map((curve) => valueOnDate(curve, stepDates, date)!).sort((a, b) => a - b);
    view.bands.push({ date, lowest: sorted[0]!, low10: quantile(sorted, 0.1), low25: quantile(sorted, 0.25),
      median: quantile(sorted, 0.5), high75: quantile(sorted, 0.75), high90: quantile(sorted, 0.9), highest: sorted.at(-1)! });
  }
  view.current = dates.filter((day) => day <= setDay!).map((date) => {
    const values = stations.map((station) => readings.get(station)!.get(date)?.snow);
    return { date, inches: values.every((value) => value !== undefined) ? roundTenth(average(values as number[])) : null };
  });

  const newest = [...view.current].reverse().find((day) => day.inches !== null);
  if (!newest) return view;
  const day = view.bands.find((band) => band.date === newest.date);
  if (!day) return view;
  const onDate = curves.map((curve) => valueOnDate(curve, stepDates, newest.date)!);
  const withNormal = stations.map((station) => readings.get(station)!.get(newest.date)!)
    .filter((reading): reading is { snow: number; normal: number } => reading.normal !== null);
  const normal = withNormal.length ? average(withNormal.map((reading) => reading.normal)) : null;
  const meetsSiteFloor = withNormal.length >= headlineFloor(sites.length, 2);
  view.headline = {
    date: newest.date,
    inches: newest.inches!,
    medianInches: roundTenth(day.median),
    rank: 1 + onDate.filter((value) => roundTenth(value) > newest.inches!).length,
    rankedYears: onDate.length + 1,
    normalSites: withNormal.length,
    normalInches: normal === null ? null : roundTenth(normal),
    percentOfNormal: normal !== null && normalIsComparable(normal) && meetsSiteFloor
      ? average(withNormal.map((reading) => reading.snow)) / normal * 100 : null,
    meetsSiteFloor
  };
  return view;
}
