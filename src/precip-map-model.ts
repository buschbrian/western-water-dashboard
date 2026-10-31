/*
 * What the precipitation map draws for one window (ADR-131): each site's
 * total, and each drainage area's mean over its sites with a total.
 *
 * The area mean is ADR-129's rule applied to one area: the mean of the
 * stations that measured both days, never counting a station with no value
 * or a falling gauge total as dry. An area needs as many such stations as
 * its snow reporting floor, the same floor its snow figure holds to, or it
 * has no mean and says how many it had.
 */
import type { StormTotals, StormWindow } from "./precip-storm-model";

export interface AreaTotal {
  /** Mean of the stations with a total, to a tenth; null below the floor. */
  meanInches: number | null;
  /** Stations in the area with a total for the window. */
  stations: number;
  floor: number;
}

export interface PrecipMapValues {
  window: StormWindow;
  endDate: string | null;
  sites: Map<string, number>;
  areas: Map<string, AreaTotal>;
}

const roundTenth = (value: number): number => Math.round(value * 10) / 10 + 0;

export function precipMapValues(
  window: StormWindow,
  totals: StormTotals | null,
  siteAreas: ReadonlyMap<string, string>,
  areaFloors: ReadonlyMap<string, number>
): PrecipMapValues {
  const shown = totals?.windows.find((entry) => entry.days === window);
  const sites = new Map((shown?.available ? shown.totals : [])
    .filter((total) => siteAreas.has(total.station))
    .map((total) => [total.station, total.inches]));
  const sums = new Map<string, { sum: number; count: number }>();
  for (const [station, inches] of sites) {
    const area = siteAreas.get(station)!;
    const entry = sums.get(area) ?? { sum: 0, count: 0 };
    entry.sum += inches;
    entry.count += 1;
    sums.set(area, entry);
  }
  const areas = new Map<string, AreaTotal>();
  for (const [area, floor] of areaFloors) {
    const entry = sums.get(area);
    const stations = entry?.count ?? 0;
    areas.set(area, {
      meanInches: entry && stations >= floor ? roundTenth(entry.sum / stations) : null,
      stations,
      floor
    });
  }
  return { window, endDate: totals?.endDate ?? null, sites, areas };
}
