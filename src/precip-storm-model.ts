/*
 * Storm totals: the precipitation of the last few days at the stations in
 * the place shown (ADR-129). Each station's total is a difference of two
 * accumulated readings, so no history is needed and the fixed set of
 * ADR-125 does not apply: every station with a value on both days counts.
 */
import { newestSetDay } from "./precip-model";
import type { PrecipitationPayload } from "./types";

export const STORM_WINDOWS = [1, 3, 7] as const;
export type StormWindow = typeof STORM_WINDOWS[number];

export interface StationTotal {
  station: string;
  inches: number;
}

export interface StormWindowTotal {
  days: StormWindow;
  /** The day the window is measured from: `days` before the end. */
  startDate: string;
  /** False while the start falls before the first day of the water year. */
  available: boolean;
  /** Stations with a total, most precipitation first. */
  totals: StationTotal[];
  /** Mean of `totals`, to a tenth of an inch; null with no station. */
  meanInches: number | null;
  /** Stations without a reading on the end day or the start day. */
  withoutValue: number;
  /** Stations whose accumulation fell across the window. */
  falling: number;
}

export interface StormTotals {
  /** The day every window ends on; null when no station reports. */
  endDate: string | null;
  windows: StormWindowTotal[];
}

const DAY_MS = 86_400_000;
const roundTenth = (value: number): number => Math.round(value * 10) / 10 + 0;

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The first end day on which a window of `days` reaches back to the calendar's first day. */
export function firstAvailableEnd(daily: PrecipitationPayload, days: StormWindow): string | null {
  const first = daily.series_dates[0];
  return first === undefined ? null : shiftDate(first, days);
}

export function stormTotals(
  placeStations: readonly string[], daily: PrecipitationPayload
): StormTotals {
  const dailyByStation = new Map(daily.sites.map((site) => [site.station, site]));
  const reporting = placeStations.flatMap((station) => {
    const site = dailyByStation.get(station);
    return site ? [site] : [];
  });
  /* One end day for every station: ADR-125's set day, taken over the
   * stations reporting on time, so one late gauge cannot hold the totals
   * back and the stations that end earlier are left out. */
  const endDate = reporting.length === 0 ? undefined
    : newestSetDay(daily.series_dates, reporting.filter((site) => !site.late));
  if (endDate === undefined) return { endDate: null, windows: [] };
  const firstDate = daily.series_dates[0]!;

  const windows = STORM_WINDOWS.map((days): StormWindowTotal => {
    const startDate = shiftDate(endDate, -days);
    if (startDate < firstDate) {
      return { days, startDate, available: false, totals: [], meanInches: null, withoutValue: 0, falling: 0 };
    }
    const totals: StationTotal[] = [];
    let withoutValue = placeStations.length - reporting.length;
    let falling = 0;
    for (const site of reporting) {
      const end = site.readings.get(endDate);
      const start = site.readings.get(startDate);
      if (end === undefined || start === undefined) {
        withoutValue += 1;
        continue;
      }
      /* A fall in an accumulation is a reset, a correction or evaporation
       * from a storage gauge. It is not a measurement, so the station is
       * left out rather than counted as a dry one. */
      const inches = roundTenth(end - start);
      if (inches < 0) {
        falling += 1;
        continue;
      }
      totals.push({ station: site.station, inches });
    }
    totals.sort((a, b) => b.inches - a.inches || a.station.localeCompare(b.station));
    const meanInches = totals.length === 0 ? null
      : roundTenth(totals.reduce((sum, total) => sum + total.inches, 0) / totals.length);
    return { days, startDate, available: true, totals, meanInches, withoutValue, falling };
  });
  return { endDate, windows };
}
