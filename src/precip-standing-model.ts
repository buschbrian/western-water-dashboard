/*
 * Where this water year's precipitation stands against past years, for the
 * precipitation map's third mode (ADR-170). Pure, so it is tested against
 * synthetic stations without a browser.
 *
 * A station is placed against its own past years on one common date: the
 * newest day on which `SET_SHARE` of the on-time stations report, the card's
 * own rule. Each past year is read on a straight line between its weekly
 * steps (ADR-125), and the station needs `MIN_RECORD_YEARS` of them. A
 * station with a gap in its record is placed against the years it has, and
 * says how many.
 *
 * An area is a mean over one fixed set, as the card's is: only stations with
 * every year in the window, so every past year is the same stations. It
 * needs `MIN_AREA_STATIONS` of them.
 *
 * The classes are the U.S. National Centers for Environmental Information's
 * ranking classes: the lowest tenth of years, the rest of the lowest third,
 * the middle third, the upper third less its top tenth, the top tenth. The
 * position is a mid-rank percentile to a tenth of an inch, so equal years
 * share it. No class until the median for the date reaches
 * `MEANINGFUL_NORMAL_INCHES`: in early October a tenth of an inch moves a
 * station across every class.
 */
import { newestSetDay, quantile, stepDate, valueOnDate } from "./precip-model";
import { MEANINGFUL_NORMAL_INCHES } from "./snow-model";
import type { PrecipitationHistory, PrecipitationPayload } from "./types";

/** The fewest past years a station needs to be placed. */
export const MIN_RECORD_YEARS = 10;
/** The fewest full-record stations behind an area's figure (Brian, 2026-11-14). */
export const MIN_AREA_STATIONS = 3;

export type StandingClass = "much-below" | "below" | "near" | "above" | "much-above";

/** Upper percentile bounds of the lower classes, NCEI's deciles and terciles. */
const BOUNDS: readonly [number, StandingClass][] = [
  [10, "much-below"], [100 / 3, "below"], [200 / 3, "near"], [90, "above"]
];

export interface Standing {
  inches: number;
  medianInches: number;
  /** Mid-rank percentile, 0 to 100: years below plus half the equal years. */
  percentile: number;
  /** 1 is the wettest. Years equal to a tenth of an inch share a rank. */
  rank: number;
  /** Past years compared, not counting this one. */
  years: number;
  /** Null while the median is under `MEANINGFUL_NORMAL_INCHES`. */
  standingClass: StandingClass | null;
  /** Above or below every past year, to a tenth of an inch. */
  record: "wettest" | "driest" | null;
}

export interface StationStanding extends Standing {
  /** False for a station with a gap in its record. */
  fullRecord: boolean;
}

export interface AreaStanding {
  standing: Standing | null;
  /** Full-record stations in the area with a value on the date. */
  stations: number;
  floor: number;
}

export interface StandingValues {
  date: string | null;
  firstWaterYear: number;
  lastWaterYear: number;
  sites: Map<string, StationStanding>;
  areas: Map<string, AreaStanding>;
  /** Stations in the place with a value on the date but too short a record. */
  shortRecord: number;
}

const tenth = (value: number): number => Math.round(value * 10);
const roundTenth = (value: number): number => Math.round(value * 10) / 10 + 0;

export function classForPercentile(percentile: number): StandingClass {
  for (const [bound, name] of BOUNDS) if (percentile < bound) return name;
  return "much-above";
}

/** This year's value against past years' values on the same date. */
export function standingOf(inches: number, past: readonly number[]): Standing {
  const sorted = [...past].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  const below = past.filter((year) => tenth(year) < tenth(inches)).length;
  const equal = past.filter((year) => tenth(year) === tenth(inches)).length;
  const percentile = (100 * (below + equal / 2)) / past.length;
  const record = tenth(inches) > tenth(sorted[sorted.length - 1]!) ? "wettest"
    : tenth(inches) < tenth(sorted[0]!) ? "driest" : null;
  return {
    inches: roundTenth(inches),
    medianInches: roundTenth(median),
    percentile: Math.round(percentile * 10) / 10,
    rank: 1 + past.filter((year) => tenth(year) > tenth(inches)).length,
    years: past.length,
    standingClass: median >= MEANINGFUL_NORMAL_INCHES ? classForPercentile(percentile) : null,
    record
  };
}

const mean = (values: readonly number[]): number =>
  values.reduce((total, value) => total + value, 0) / values.length;

export function precipStandingValues(
  daily: PrecipitationPayload,
  history: PrecipitationHistory,
  siteAreas: ReadonlyMap<string, string>
): StandingValues {
  const empty = (date: string | null): StandingValues => ({
    date, firstWaterYear: history.first_water_year, lastWaterYear: history.last_water_year,
    sites: new Map(), areas: new Map(), shortRecord: 0
  });
  const inPlace = daily.sites.filter((site) => siteAreas.has(site.station) && !site.late);
  const date = newestSetDay(daily.series_dates, inPlace) ?? null;
  if (date === null) return empty(null);

  /* Past years only: a history that already holds this water year would
   * compare it with itself. */
  const lastYear = Math.min(history.last_water_year, daily.water_year - 1);
  const yearCount = lastYear - history.first_water_year + 1;
  const stepDatesByYear = Array.from({ length: Math.max(0, yearCount) }, (_, index) =>
    history.step_month_days.map((monthDay) => stepDate(history.first_water_year + index, monthDay)));
  /* The same calendar day in each past year; 29 February reads 28 February. */
  const monthDay = date.slice(5) === "02-29" ? "02-28" : date.slice(5);
  const onDate = (curve: readonly number[] | null, index: number): number | null =>
    curve === null ? null
      : valueOnDate(curve, stepDatesByYear[index]!, stepDate(history.first_water_year + index, monthDay));

  const values = empty(date);
  const fullPast = new Map<string, number[]>();
  const fullNow = new Map<string, number>();
  for (const site of inPlace) {
    const inches = site.readings.get(date);
    if (inches === undefined) continue;
    const full = history.sites.get(site.station);
    const curves = full ?? history.partialSites.get(site.station);
    if (!curves) continue;
    const past: number[] = [];
    for (let index = 0; index < yearCount; index += 1) {
      const value = onDate(curves[index] ?? null, index);
      if (value !== null) past.push(value);
    }
    if (past.length < MIN_RECORD_YEARS) {
      values.shortRecord += 1;
      continue;
    }
    const isFull = full !== undefined && past.length === yearCount;
    if (isFull) {
      fullPast.set(site.station, past);
      fullNow.set(site.station, inches);
    }
    values.sites.set(site.station, { ...standingOf(inches, past), fullRecord: isFull });
  }

  const members = new Map<string, string[]>();
  for (const [station] of fullPast) {
    const area = siteAreas.get(station)!;
    members.set(area, [...(members.get(area) ?? []), station]);
  }
  for (const area of new Set(siteAreas.values())) {
    const stations = members.get(area) ?? [];
    const standing = stations.length >= MIN_AREA_STATIONS
      ? standingOf(
        mean(stations.map((station) => fullNow.get(station)!)),
        Array.from({ length: yearCount }, (_, index) =>
          mean(stations.map((station) => fullPast.get(station)![index]!))))
      : null;
    values.areas.set(area, { standing, stations: stations.length, floor: MIN_AREA_STATIONS });
  }
  return values;
}
