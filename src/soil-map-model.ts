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
import type { SoilHistoryClass, SoilMoisturePayload, SoilMoistureSite } from "./types";
import { SET_SHARE } from "./precip-model";
import { formatDate, formatShortDate } from "./viz/format";
import { SOIL_STEADY_POINTS, soilClassIndex } from "./viz/soil-classes";
import { SOIL_HISTORY_CLASSES } from "./viz/soil-history-classes";

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

/** An area against its stations' past years (ADR-169). */
export interface SoilAreaHistory {
  /** The median class of its compared stations; null below the floor. */
  cls: SoilHistoryClass | null;
  stations: number;
  floor: number;
}

export interface SoilHistoryCounts {
  /** Stations in the place with soil sensors in the file. */
  stations: number;
  compared: number;
  byClass: Record<SoilHistoryClass, number>;
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
  historyAreas: Map<string, SoilAreaHistory>;
  historyCounts: SoilHistoryCounts;
}

const CLASS_ORDER: readonly SoilHistoryClass[] = SOIL_HISTORY_CLASSES.map((row) => row.id);
const NORMAL_INDEX = CLASS_ORDER.indexOf("normal");

/** The median of ordered classes, the one nearer normal on an even split;
 * the refresh's `area_class`. Null below the floor. */
export function soilAreaHistoryClass(classes: readonly SoilHistoryClass[], floor: number): SoilHistoryClass | null {
  if (classes.length < floor || classes.length === 0) return null;
  const ordered = classes.map((cls) => CLASS_ORDER.indexOf(cls)).sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2) return CLASS_ORDER[ordered[middle]!]!;
  const low = ordered[middle - 1]!;
  const high = ordered[middle]!;
  return CLASS_ORDER[Math.abs(low - NORMAL_INDEX) <= Math.abs(high - NORMAL_INDEX) ? low : high]!;
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

  const classesByArea = new Map<string, SoilHistoryClass[]>();
  const byClass = Object.fromEntries(CLASS_ORDER.map((cls) => [cls, 0])) as Record<SoilHistoryClass, number>;
  let compared = 0;
  for (const site of inPlace) {
    if (site.history_class === null) continue;
    compared += 1;
    byClass[site.history_class] += 1;
    const area = siteAreas.get(site.station)!;
    classesByArea.set(area, [...(classesByArea.get(area) ?? []), site.history_class]);
  }
  const historyAreas = new Map<string, SoilAreaHistory>();
  for (const [area, floor] of areaFloors) {
    const classes = classesByArea.get(area) ?? [];
    historyAreas.set(area, { cls: soilAreaHistoryClass(classes, floor), stations: classes.length, floor });
  }
  return {
    endDate: payload.end_date, startDate: payload.start_date, sites, areas, counts, ranked,
    historyAreas, historyCounts: { stations: inPlace.length, compared, byClass }
  };
}

/** Stations listed on each side of the "most change" list (ADR-142, as
 * noted 2026-10-31): four wetter and four drier, not eight by size. */
export const SOIL_ROWS_PER_SIDE = 4;

export interface SoilMostChange {
  /** Wetter by the steady band or more, the largest first. */
  wetter: SoilMoistureSite[];
  /** Drier by the steady band or more, the largest first. */
  drier: SoilMoistureSite[];
}

/** The largest wetter and the largest drier changes, each side on its own,
 * so a wet week still shows the stations that dried. */
export function soilMostChange(values: SoilMapValues,
  perSide: number = SOIL_ROWS_PER_SIDE): SoilMostChange {
  const side = (direction: 1 | -1): SoilMoistureSite[] => values.ranked
    .filter((site) => {
      const index = soilClassIndex(site.change_points);
      return direction > 0 ? index > 2 : index >= 0 && index < 2;
    })
    .slice(0, perSide);
  return { wetter: side(1), drier: side(-1) };
}

/** What an empty side says. */
export function soilNoSideText(direction: "wetter" | "drier"): string {
  return `No station got ${direction} by ${SOIL_STEADY_POINTS} points or more.`;
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

/** "9 in 10": the set-day share (ADR-129) as the date line says it. The
 * soil refresh uses the same share (`END_DAY_SHARE`); a test holds the two equal. */
export function setShareWords(share: number = SET_SHARE): string {
  return `${Math.round(share * 10)} in 10`;
}

/** The week the map shows and why it can end before the rain totals, or why
 * there is none. */
export function soilWeekText(values: SoilMapValues): string {
  return values.endDate && values.startDate
    ? `The change is from ${formatDate(values.startDate)} to ${formatDate(values.endDate)}. `
      + `It ends on ${formatShortDate(values.endDate)}, the newest day on which ${setShareWords()} `
      + "on-time stations sent readings at all three depths."
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

/* --- Compared with past years (ADR-169) --------------------------------- */

/** Why a station is not compared with its past years, in words. */
export function soilNoHistoryText(site: SoilMoistureSite | undefined): string {
  if (!site) return "No soil sensors";
  switch (site.no_history_reason) {
    case "no_history": return "No record of past years for this station yet";
    case "other_depths": return "Its past years were measured at other depths";
    case "short_history": return "10 or fewer past years with a reading on this date";
    case "no_reading": return site.no_change_reason === "frozen"
      ? "Frozen soil on the end day" : "No reading at all three depths on the end day";
    default: return "";
  }
}

/** The normal range of a station's band, in words. */
export function soilBandText(site: SoilMoistureSite): string {
  const band = site.history_band;
  return band ? `Normal for this date is ${band.p25.toFixed(1)} to ${band.p75.toFixed(1)} percent, `
    + `the middle half of ${band.years} past years.` : "";
}

/** The place's stations by class, in one sentence. */
export function soilHistoryCountsText(counts: SoilHistoryCounts): string {
  if (counts.stations === 0) return "No station in this place has soil sensors at the three depths.";
  if (counts.compared === 0) {
    return `None of the ${stationWord(counts.stations)} with soil sensors is compared with its past years for this date.`;
  }
  const drier = counts.byClass.much_drier + counts.byClass.drier;
  const wetter = counts.byClass.much_wetter + counts.byClass.wetter;
  return `Of the ${stationWord(counts.compared)} compared with their own past years, ${drier} ${drier === 1 ? "is" : "are"} `
    + `drier than normal for the date (${counts.byClass.much_drier} much drier), ${counts.byClass.normal} `
    + `${counts.byClass.normal === 1 ? "is" : "are"} normal, and ${wetter} ${wetter === 1 ? "is" : "are"} wetter than `
    + `normal (${counts.byClass.much_wetter} much wetter).`;
}

/** The stations left out of the comparison. */
export function soilHistoryLeftOutText(counts: SoilHistoryCounts): string {
  const without = counts.stations - counts.compared;
  return without > 0
    ? `${stationWord(without)} with soil sensors ${without === 1 ? "is" : "are"} not compared: too few past years `
      + "on this date, frozen soil, or no reading on the end day."
    : "";
}
