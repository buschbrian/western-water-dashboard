/*
 * What the precipitation map draws in its soil-moisture mode (ADR-142):
 * each station's seven-day change, and each drainage area's mean over the
 * stations in the place shown.
 *
 * ADR-131's area rule, kept for the second mode: the mean of the stations
 * with a change, held to the area's snow reporting floor, and regrouped from
 * the place's own stations (ADR-064's honesty rule) rather than read from
 * the file's whole-area figures. For a place that holds whole areas the two
 * are the same numbers; `soil-map-model.test.ts` holds that against the
 * committed file.
 */
import type { SoilMoisturePayload, SoilMoistureSite } from "./types";
import { formatDate } from "./viz/format";
import { SOIL_STEADY_POINTS, soilClassIndex } from "./viz/soil-classes";

export interface SoilAreaChange {
  /** Mean change of the stations with one, to a tenth; null below the floor. */
  meanPoints: number | null;
  /** Stations in the area with a change. */
  stations: number;
  floor: number;
}

export interface SoilCounts {
  /** Stations in the place with soil sensors in the file. */
  stations: number;
  /** Of those, with a change for the week. */
  measured: number;
  wetter: number;
  steady: number;
  drier: number;
  frozen: number;
}

export interface SoilMapValues {
  endDate: string | null;
  startDate: string | null;
  /** Every station in the place that the file holds. */
  sites: Map<string, SoilMoistureSite>;
  areas: Map<string, SoilAreaChange>;
  counts: SoilCounts;
  /** Stations with a change, the largest move first. */
  ranked: SoilMoistureSite[];
}

const roundTenth = (value: number): number => Math.round(value * 10) / 10 + 0;

export function soilMapValues(
  payload: SoilMoisturePayload,
  siteAreas: ReadonlyMap<string, string>,
  areaFloors: ReadonlyMap<string, number>
): SoilMapValues {
  const inPlace = payload.sites.filter((site) => siteAreas.has(site.station));
  const sites = new Map(inPlace.map((site) => [site.station, site]));
  /* In the file's own order, as the refresh sums, so an area's mean here
   * is the same float as the one the file publishes. */
  const sums = new Map<string, { sum: number; count: number }>();
  const counts: SoilCounts = { stations: inPlace.length, measured: 0, wetter: 0, steady: 0, drier: 0, frozen: 0 };
  for (const site of inPlace) {
    if (site.no_change_reason === "frozen") counts.frozen += 1;
    if (site.change_points === null) continue;
    counts.measured += 1;
    const direction = soilClassIndex(site.change_points);
    if (direction < 2) counts.drier += 1;
    else if (direction === 2) counts.steady += 1;
    else counts.wetter += 1;
    const area = siteAreas.get(site.station)!;
    const entry = sums.get(area) ?? { sum: 0, count: 0 };
    entry.sum += site.change_points;
    entry.count += 1;
    sums.set(area, entry);
  }
  const areas = new Map<string, SoilAreaChange>();
  for (const [area, floor] of areaFloors) {
    const entry = sums.get(area);
    const stations = entry?.count ?? 0;
    areas.set(area, {
      meanPoints: entry && stations >= floor ? roundTenth(entry.sum / stations) : null,
      stations,
      floor
    });
  }
  const ranked = inPlace.filter((site) => site.change_points !== null)
    .sort((a, b) => Math.abs(b.change_points!) - Math.abs(a.change_points!) || a.station.localeCompare(b.station));
  return { endDate: payload.end_date, startDate: payload.start_date, sites, areas, counts, ranked };
}

/** Why a station has no change, in words. */
export function soilNoChangeText(site: SoilMoistureSite | undefined): string {
  if (!site) return "No soil sensors";
  switch (site.no_change_reason) {
    case "frozen": return "Frozen soil on one of the two days";
    case "no_temperature": return "No soil temperature to show the soil was not frozen";
    case "missing_reading": return "No reading at one of the three depths on one of the two days";
    default: return "";
  }
}

const stationWord = (count: number): string => `${count} station${count === 1 ? "" : "s"}`;

/** The week the map shows, or why there is none. */
export function soilWeekText(values: SoilMapValues): string {
  return values.endDate && values.startDate
    ? `The change is from ${formatDate(values.startDate)} to ${formatDate(values.endDate)}.`
    : "Too few stations sent soil moisture to measure a week.";
}

/** The place's stations by direction, in one sentence. */
export function soilCountsText(counts: SoilCounts): string {
  if (counts.stations === 0) return "No station in this place has soil sensors at the three depths.";
  if (counts.measured === 0) {
    return `None of the ${stationWord(counts.stations)} with soil sensors has a change for this week.`;
  }
  return `Of the ${stationWord(counts.measured)} with a change, ${counts.wetter} got wetter by ` +
    `${SOIL_STEADY_POINTS} points or more, ${counts.drier} got drier by ${SOIL_STEADY_POINTS} points or more, ` +
    `and ${counts.steady} stayed within ${SOIL_STEADY_POINTS} points.`;
}

/** The stations left out, and the sensors' own step. */
export function soilLeftOutText(counts: SoilCounts): string {
  const without = counts.stations - counts.measured;
  return [
    without > 0 ? `${stationWord(without)} with soil sensors ${without === 1 ? "has" : "have"} no change this week` +
      (counts.frozen > 0 ? `, ${counts.frozen} of them because the soil was frozen.` : ".") : "",
    "The sensors measure to 0.1 percentage point."
  ].filter(Boolean).join(" ");
}
