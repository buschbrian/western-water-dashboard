/*
 * Precipitation since 1 October for whatever place the snow page shows,
 * against that place's own history (ADR-122). Pure, so it is tested against
 * synthetic stations without a browser.
 *
 * One set of stations answers every question on the card: the stations in
 * the place that have a complete history and are not reporting late. The
 * line, the bands, the rank and the snow water are all means over that one
 * set, so no number on the card compares two networks. A mean rather than a
 * sum because the set is fixed, so the two are the same comparison, and "the
 * average station has had 4.1 inches" is a sentence a reader can use.
 */
import { MEANINGFUL_NORMAL_INCHES } from "./snow-model";
import type { PrecipitationHistory, PrecipitationPayload, SnowSite } from "./types";

export interface BandStep {
  date: string;
  lowest: number;
  low10: number;
  low25: number;
  median: number;
  high75: number;
  high90: number;
  highest: number;
}

export interface DayValue {
  date: string;
  inches: number | null;
}

export interface PrecipitationHeadline {
  date: string;
  inches: number;
  medianInches: number;
  /** Null while the median is under an inch: no ratio worth printing. */
  percentOfMedian: number | null;
  /** This year's total so far over a median year's full total. */
  shareOfMedianYear: number | null;
  medianYearInches: number;
  /** 1 is the highest. Years with the same value share a rank. */
  rank: number;
  rankedYears: number;
  snowWaterInches: number | null;
  /** Null after 1 April, or when the median for 1 April is already passed. */
  toApril1: { medianInches: number; neededInches: number; medianGainInches: number } | null;
}

export interface PrecipitationView {
  /** Stations in the place, before any rule applies. */
  placeStationCount: number;
  /** The fixed set every figure is a mean over. */
  stations: string[];
  /** In the place, reporting precipitation, but with no complete history. */
  withoutHistory: number;
  late: number;
  firstWaterYear: number;
  lastWaterYear: number;
  bands: BandStep[];
  precipitation: DayValue[];
  snowWater: DayValue[];
  headline: PrecipitationHeadline | null;
}

const DAY_MS = 86_400_000;
/** How far the headline may step back to find a day with snow water too. */
export const SNOW_LAG_DAYS = 2;
const roundTenth = (value: number): number => Math.round(value * 10) / 10;

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

/** The calendar date of a step in a given water year. */
export function stepDate(waterYear: number, monthDay: string): string {
  const month = Number(monthDay.slice(0, 2));
  return `${month >= 10 ? waterYear - 1 : waterYear}-${monthDay}`;
}

/**
 * The value at fraction `p` of a sorted list, read on a straight line between
 * neighbours (the common "type 7" rule). Every band edge uses this one rule.
 */
export function quantile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) throw new Error("quantile of nothing");
  const position = (sorted.length - 1) * p;
  const below = Math.floor(position);
  const above = Math.ceil(position);
  const low = sorted[below]!;
  const high = sorted[above]!;
  return low + (high - low) * (position - below);
}

/** A year's curve read at a date, on a straight line between its weekly steps. */
export function valueOnDate(
  curve: readonly number[], stepDates: readonly string[], date: string
): number | null {
  const target = dayNumber(date);
  for (let index = 0; index < stepDates.length; index += 1) {
    const at = dayNumber(stepDates[index]!);
    if (at === target) return curve[index]!;
    if (at > target) {
      if (index === 0) return null;
      const before = dayNumber(stepDates[index - 1]!);
      const fraction = (target - before) / (at - before);
      return curve[index - 1]! + (curve[index]! - curve[index - 1]!) * fraction;
    }
  }
  return null;
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function snowWaterByDate(site: SnowSite): Map<string, number> {
  const values = new Map<string, number>();
  for (const [date, value] of site.series) {
    if (value !== null) values.set(date, value);
  }
  return values;
}

export function precipitationView(
  placeStations: readonly string[],
  daily: PrecipitationPayload,
  history: PrecipitationHistory,
  snowSites: readonly SnowSite[]
): PrecipitationView {
  const dailyByStation = new Map(daily.sites.map((site) => [site.station, site]));
  const reporting = placeStations.filter((station) => dailyByStation.has(station));
  const withHistory = reporting.filter((station) => history.sites.has(station));
  const stations = withHistory.filter((station) => !dailyByStation.get(station)!.late);
  const base = {
    placeStationCount: placeStations.length,
    stations,
    withoutHistory: reporting.length - withHistory.length,
    late: withHistory.length - stations.length,
    firstWaterYear: history.first_water_year,
    lastWaterYear: history.last_water_year
  };
  if (stations.length === 0) {
    return { ...base, bands: [], precipitation: [], snowWater: [], headline: null };
  }

  const stepDates = history.step_month_days.map((monthDay) => stepDate(daily.water_year, monthDay));
  const yearCount = history.last_water_year - history.first_water_year + 1;
  const yearCurves: number[][] = [];
  for (let year = 0; year < yearCount; year += 1) {
    yearCurves.push(stepDates.map((_, step) =>
      mean(stations.map((station) => history.sites.get(station)![year]![step]!))));
  }
  const bands: BandStep[] = stepDates.map((date, step) => {
    const sorted = yearCurves.map((curve) => curve[step]!).sort((a, b) => a - b);
    return {
      date,
      lowest: sorted[0]!,
      low10: quantile(sorted, 0.1),
      low25: quantile(sorted, 0.25),
      median: quantile(sorted, 0.5),
      high75: quantile(sorted, 0.75),
      high90: quantile(sorted, 0.9),
      highest: sorted[sorted.length - 1]!
    };
  });

  /* A day draws only when every station in the set has a value on it: a mean
   * over fewer stations is a different place for that day. */
  const precipitation: DayValue[] = daily.series_dates.map((date) => {
    const values = stations.map((station) => dailyByStation.get(station)!.readings.get(date));
    return {
      date,
      inches: values.every((value) => value !== undefined)
        ? roundTenth(mean(values as number[])) : null
    };
  });

  const snowByStation = new Map(snowSites.map((site) => [site.station, snowWaterByDate(site)]));
  const snowWater: DayValue[] = daily.series_dates.map((date) => {
    const values = stations.map((station) => snowByStation.get(station)?.get(date));
    return {
      date,
      inches: values.every((value) => value !== undefined)
        ? roundTenth(mean(values as number[])) : null
    };
  });

  /* The headline's day is the newest on which both lines are complete, so
   * the snow water it quotes is the same stations on the same day. Snow
   * readings often trail the gauge by a day; when they trail by more than
   * `SNOW_LAG_DAYS`, the headline takes the newest precipitation and says
   * nothing about snow rather than going stale. */
  const newestPrecip = [...precipitation].reverse().find((day) => day.inches !== null);
  const snowComplete = new Set(snowWater.filter((day) => day.inches !== null).map((day) => day.date));
  const paired = [...precipitation].reverse()
    .find((day) => day.inches !== null && snowComplete.has(day.date));
  const newest = paired && newestPrecip
    && dayNumber(newestPrecip.date) - dayNumber(paired.date) <= SNOW_LAG_DAYS
    ? paired : newestPrecip;
  if (!newest || newest.inches === null) {
    return { ...base, bands, precipitation, snowWater, headline: null };
  }
  const medianYear = bands[bands.length - 1]!.median;
  const onDate = yearCurves
    .map((curve) => valueOnDate(curve, stepDates, newest.date))
    .filter((value): value is number => value !== null);
  const medianOnDate = onDate.length > 0
    ? quantile([...onDate].sort((a, b) => a - b), 0.5) : 0;
  const rank = 1 + onDate.filter((value) => roundTenth(value) > newest.inches!).length;

  const april1 = stepDate(daily.water_year, "04-01");
  const april1Step = bands.find((band) => band.date === april1);
  const toApril1 = april1Step && dayNumber(newest.date) < dayNumber(april1)
    && april1Step.median > newest.inches
    ? {
      medianInches: roundTenth(april1Step.median),
      neededInches: roundTenth(april1Step.median - newest.inches),
      medianGainInches: roundTenth(april1Step.median - medianOnDate)
    }
    : null;

  const snowToday = snowWater.find((day) => day.date === newest.date)?.inches ?? null;
  return {
    ...base,
    bands,
    precipitation,
    snowWater,
    headline: {
      date: newest.date,
      inches: newest.inches,
      medianInches: roundTenth(medianOnDate),
      percentOfMedian: medianOnDate >= MEANINGFUL_NORMAL_INCHES
        ? Math.round((newest.inches / medianOnDate) * 100) : null,
      shareOfMedianYear: medianYear > 0
        ? Math.round((newest.inches / medianYear) * 100) : null,
      medianYearInches: roundTenth(medianYear),
      rank,
      rankedYears: onDate.length + 1,
      snowWaterInches: snowToday,
      toApril1
    }
  };
}

/** "1st", "2nd", "23rd". */
export function ordinal(value: number): string {
  const tens = value % 100;
  if (tens >= 11 && tens <= 13) return `${value}th`;
  return `${value}${["th", "st", "nd", "rd"][value % 10] ?? "th"}`;
}
