/*
 * The surface level on a reservoir's page (ADR-135): the card, the chart's
 * water years and reference lines, and the note on why another publisher can
 * show a different number.
 *
 * Pure, like every `*-model.ts`. The card is the lakes page's level card
 * (`levelCard`), so a level reads the same on both pages; nothing here is a
 * percentage of a level (ADR-112).
 */
import { datumName, levelCard } from "./measurement-model";
import type { MeasurementView } from "./measurement-model";
import type {
  ElevationHistoryEntry, ReferenceLevel, Reservoir, ReservoirElevation
} from "./types";
import { formatDate } from "./viz/format";

/** Earlier water years drawn beside the current one. */
export const EARLIER_YEARS = 5;

export interface NoteLink {
  text: string;
  href: string;
}

export interface ElevationNote {
  heading: string;
  paragraphs: string[];
  links: NoteLink[];
}

export interface ElevationView {
  card: MeasurementView;
  late: string | null;
  note: ElevationNote;
}

export type YearTier = "current" | "previous" | "earlier";

export interface YearLine {
  waterYear: number;
  /** "2025–26": the water year as the two calendar years it spans. */
  label: string;
  tier: YearTier;
  /** [day of the water year from 0 on 1 October, feet or null]. */
  points: [number, number | null][];
  highest: { feet: number; date: string } | null;
  lowest: { feet: number; date: string } | null;
  latest: { feet: number; date: string } | null;
}

export interface ElevationChart {
  lines: YearLine[];
  /** Vertical range the plot draws, in feet. */
  low: number;
  high: number;
  drawn: ReferenceLevel[];
  /** Reference levels too far from the readings to draw without flattening them. */
  notDrawn: ReferenceLevel[];
  title: string;
  ariaLabel: string;
  explanation: string;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return Date.parse(`${date}T00:00:00Z`) / DAY_MS;
}

function isoDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** The water year a date falls in: 1 October 2025 starts water year 2026. */
export function waterYearOf(date: string): number {
  const year = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 10 ? year + 1 : year;
}

export function waterYearLabel(waterYear: number): string {
  return `${waterYear - 1}–${String(waterYear).slice(2)}`;
}

/** Days between a reading and the refresh date, past the late threshold. */
export function elevationLate(elevation: ReservoirElevation, runDate: string,
  staleAfterDays: number): string | null {
  const age = Math.round(dayNumber(runDate.slice(0, 10)) - dayNumber(elevation.as_of));
  if (!(age > staleAfterDays)) return null;
  return age === 1 ? "This level reading is late by one day."
    : `This level reading is late by ${age} days.`;
}

/**
 * The datum a level is above, as a reader meets it: a national datum spelled
 * out, or an operator's project datum by its own name. A project datum is
 * never called by the national datum it is stated against.
 */
export function elevationDatum(elevation: ReservoirElevation): string {
  return elevation.vertical_datum === "project" && elevation.datum_name
    ? `the Bureau of Reclamation's ${elevation.datum_name}`
    : `the ${datumName(elevation.vertical_datum)}`;
}

/** How a project datum relates to a national one; null for a national datum. */
export function datumRelationSentence(elevation: ReservoirElevation): string | null {
  const relation = elevation.datum_relation;
  if (elevation.vertical_datum !== "project" || !relation) return null;
  const feet = Math.abs(relation.add_ft).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${relation.add_ft >= 0 ? "Add" : "Subtract"} ${feet} feet to a level on this datum `
    + `to give the level above the ${datumName(relation.datum)}.`;
}

export function datumNote(name: string, elevation: ReservoirElevation): ElevationNote {
  const relation = datumRelationSentence(elevation);
  const paragraphs = [
    `The Bureau of Reclamation gives the level of ${name} in feet above `
      + `${elevationDatum(elevation)}. A datum is the zero point that a level is measured from.`
      + (relation ? ` ${relation}` : "")
  ];
  const links: NoteLink[] = [
    { text: `Bureau of Reclamation readings for ${name}`, href: elevation.source_url }
  ];
  const offset = elevation.datum_offset;
  if (offset) {
    const direction = offset.offset_ft >= 0 ? "higher" : "lower";
    paragraphs.push(
      `The U.S. Geological Survey also measures this reservoir, at its site ${offset.usgs_site}. `
      + `Its site page can show the level above the ${datumName(offset.to_datum)}. `
      + `Here, that datum gives a number about ${Math.abs(offset.offset_ft).toFixed(1)} feet `
      + `${direction} for the same water. This difference was measured on `
      + `${formatDate(offset.measured)}.`);
    links.push({ text: `U.S. Geological Survey site ${offset.usgs_site}`, href: offset.source_url });
  }
  paragraphs.push(
    "The Bureau of Reclamation publishes one reading each day. The Geological Survey "
    + "publishes a reading every 15 minutes. When the water rises or falls quickly, "
    + "two readings taken at different times of the day are also different.");
  return {
    heading: "Why the Geological Survey can show a different level",
    paragraphs,
    links
  };
}

/** The card, a late message and the datum note, or null with no level. */
export function describeElevation(reservoir: Reservoir, runDate: string): ElevationView | null {
  const elevation = reservoir.elevation;
  if (!elevation) return null;
  const card = levelCard(elevation, elevation.vertical_datum);
  card.basis = `above ${elevationDatum(elevation)}`;
  const relation = datumRelationSentence(elevation);
  if (relation) card.rows.push({ label: "Level datum", value: relation });
  card.rows.push({ label: "Record starts", value: formatDate(elevation.first_obs) });
  return {
    card,
    late: elevationLate(elevation, runDate, reservoir.stale_after_days),
    note: datumNote(reservoir.name, elevation)
  };
}

function extreme(points: readonly [number, number | null][], start: number,
  pick: (a: number, b: number) => boolean): { feet: number; date: string } | null {
  let best: [number, number] | null = null;
  for (const [day, feet] of points) {
    if (feet === null) continue;
    if (best === null || pick(feet, best[1])) best = [day, feet];
  }
  return best === null ? null : { feet: best[1], date: isoDay(start + best[0]) };
}

/**
 * The newest water year and the `earlier` before it, newest first, each as
 * days from its own 1 October so the years lie over one another.
 */
export function waterYearLines(entry: ElevationHistoryEntry,
  earlier: number = EARLIER_YEARS): YearLine[] {
  const first = dayNumber(entry.start);
  const newest = waterYearOf(entry.end);
  const lines: YearLine[] = [];
  for (let year = newest; year >= newest - earlier; year -= 1) {
    const opens = dayNumber(`${year - 1}-10-01`);
    const closes = Math.min(dayNumber(`${year}-09-30`), dayNumber(entry.end));
    const points: [number, number | null][] = [];
    for (let day = opens; day <= closes; day += 1) {
      const index = day - first;
      if (index < 0) continue;
      const value = entry.values[index];
      points.push([day - opens, value === undefined ? null : value]);
    }
    if (!points.some(([, feet]) => feet !== null)) break;
    const lastReading = [...points].reverse().find(([, feet]) => feet !== null);
    lines.push({
      waterYear: year,
      label: waterYearLabel(year),
      tier: year === newest ? "current" : year === newest - 1 ? "previous" : "earlier",
      points,
      highest: extreme(points, opens, (a, b) => a > b),
      lowest: extreme(points, opens, (a, b) => a < b),
      latest: lastReading && lastReading[1] !== null
        ? { feet: lastReading[1], date: isoDay(opens + lastReading[0]) } : null
    });
  }
  return lines;
}

/**
 * The chart for a reservoir's history: its water years, the vertical range,
 * and which reference levels it draws.
 *
 * A level is drawn when it is inside the readings or near them: within half
 * their range, and never less than ten feet. A level farther out is named
 * under the chart instead, because a line a hundred feet away flattens every
 * year's line into the same few pixels.
 */
export function elevationChart(reservoir: Reservoir, entry: ElevationHistoryEntry,
  earlier: number = EARLIER_YEARS): ElevationChart | null {
  const elevation = reservoir.elevation;
  if (!elevation) return null;
  const lines = waterYearLines(entry, earlier);
  const values = lines.flatMap((line) =>
    line.points.map(([, feet]) => feet).filter((feet): feet is number => feet !== null));
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const levels = [...elevation.reference_levels].sort((a, b) => a.elevation_ft - b.elevation_ft);
  const reach = Math.max(10, (max - min) / 2);
  const drawn = levels.filter((level) =>
    level.elevation_ft >= min - reach && level.elevation_ft <= max + reach);
  const notDrawn = levels.filter((level) => !drawn.includes(level));
  const low = Math.min(min, ...drawn.map((level) => level.elevation_ft));
  const high = Math.max(max, ...drawn.map((level) => level.elevation_ft));
  const pad = Math.max(2, (high - low) * 0.04);
  const datum = elevationDatum(elevation);
  const newest = lines[0]!;
  const oldest = lines[lines.length - 1]!;
  return {
    lines,
    low: low - pad,
    high: high + pad,
    drawn,
    notDrawn,
    title: "Surface level by water year",
    ariaLabel: `Surface level of ${reservoir.name} for each water year from ${oldest.label} `
      + `to ${newest.label}, in feet above ${datum}. The ${newest.label} water year is `
      + "the dark line. The table below lists the highest and lowest level of each year.",
    explanation: `A water year starts on October 1. The ${newest.label} water year started `
      + `on ${formatDate(`${newest.waterYear - 1}-10-01`)}. Each line is one water year, `
      + "drawn from October to September so the years can be compared."
  };
}

/** A reference level's height as it was set: "3,525", "1,219.6". */
export function levelFeet(level: ReferenceLevel): string {
  return level.elevation_ft.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** One sentence per reference level, with who set it. */
export function referenceLevelText(level: ReferenceLevel): string {
  return `${levelFeet(level)} feet: ${level.label}. Set by the ${level.authority}.`;
}

/** The label drawn on the chart: the reference level's name to its first comma. */
export function shortLevelLabel(level: ReferenceLevel): string {
  return level.label.split(",")[0]!.trim();
}

/** The sentence under the chart for levels it does not draw, or null. */
export function notDrawnSentence(levels: readonly ReferenceLevel[]): string | null {
  if (levels.length === 0) return null;
  return "Not drawn on this chart, because they are far from these readings: "
    + `${levels.map((level) => `${levelFeet(level)} feet (${shortLevelLabel(level)})`)
      .join("; ")}.`;
}
