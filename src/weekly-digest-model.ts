import type { DroughtCoveragePayload, ReservoirPayload, SnowpackPayload } from "./types";
import { weeklyScopeText, weeklySummary } from "./weekly-model";
import { describeWeek, type WeeklySection } from "./viz/weekly-summary";
import { formatAcreFeet, formatDate, formatPercent } from "./viz/format";
import { creditLine, weeklyReadingNotes } from "./state/figures-text";
import { providerName } from "./state/detail";
import type { FrameContent } from "./build/share-frame";

export interface WeeklyDigestEntry {
  week: string;
  published: string;
  through: string;
  scope: string;
  notes: string[];
  sourceDates: { storage: string; snow: string | null; drought: string | null };
  sections: WeeklySection[];
  caption: string;
  frame: FrameContent;
}

export interface WeeklyDigestLedger { schema_version: 1; entries: WeeklyDigestEntry[] }

export function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function weekOf(day: string): string {
  if (!isDay(day)) throw new Error("A digest date must be a calendar day");
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return date.toISOString().slice(0, 10);
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const texts = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);

export function validateDigestLedger(value: unknown): WeeklyDigestLedger {
  if (!object(value) || value.schema_version !== 1 || !Array.isArray(value.entries)) throw new Error("Unsupported weekly digest ledger");
  const weeks = new Set<string>();
  let prior = "";
  for (const entry of value.entries) {
    if (!object(entry) || !isDay(entry.week) || weekOf(entry.week) !== entry.week || entry.week <= prior || weeks.has(entry.week)
        || typeof entry.published !== "string" || !Number.isFinite(Date.parse(entry.published))
        || new Date(entry.published).toISOString() !== entry.published
        || !isDay(entry.through) || !text(entry.scope) || !texts(entry.notes) || !text(entry.caption) || !object(entry.sourceDates)
        || typeof entry.sourceDates.storage !== "string" || !Number.isFinite(Date.parse(entry.sourceDates.storage))
        || ![entry.sourceDates.snow, entry.sourceDates.drought].every((date) => date === null || isDay(date))
        || !Array.isArray(entry.sections) || entry.sections.length === 0
        || !entry.sections.every((section) => object(section) && text(section.heading) && texts(section.lines))
        || !object(entry.frame) || ![entry.frame.name, entry.frame.figure, entry.frame.source].every(text)
        || !(entry.frame.stored === undefined || text(entry.frame.stored)) || !texts(entry.frame.lines)) {
      throw new Error("Incomplete, repeated or out-of-order weekly digest entry");
    }
    weeks.add(entry.week);
    prior = entry.week;
  }
  return value as unknown as WeeklyDigestLedger;
}

export function digestEntry(payload: ReservoirPayload, snow: SnowpackPayload | null,
  drought: DroughtCoveragePayload | null, day: string, published: string): WeeklyDigestEntry {
  const summary = weeklySummary(payload.reservoirs, snow, drought);
  if (!isDay(summary.through) || !Number.isFinite(Date.parse(published))) throw new Error("A digest needs dated readings and a publication time");
  const scope = weeklyScopeText(payload.reservoirs, payload.reservoirs);
  const sections = describeWeek(summary);
  const dates = { storage: payload.generated_at, snow: snow?.as_of ?? null, drought: drought?.map_date ?? null };
  const title = `Week of ${formatDate(weekOf(day))}`;
  const source = creditLine([...payload.reservoirs.map(providerName),
    ...(snow ? ["Natural Resources Conservation Service"] : []), ...(drought ? ["U.S. Drought Monitor"] : [])]);
  const dateLines = [
    `Reservoir data file: ${formatDate(payload.generated_at.slice(0, 10))}. Latest reservoir reading: ${formatDate(summary.through)}.`,
    snow ? `Snow measurements to ${formatDate(snow.as_of)}.` : "Snow measurements were unavailable.",
    drought ? `Drought map for ${formatDate(drought.map_date)}.` : "Drought measurements were unavailable."
  ];
  const notes = [...weeklyReadingNotes(payload.reservoirs), ...dateLines];
  const caption = [title, scope, ...notes, ...sections.flatMap((section) => [section.heading, ...section.lines]), source,
    "This is a saved weekly summary. The live dashboard can show newer readings."].join("\n\n");
  const change = summary.storage.netAf;
  const figure = summary.storage.measured > 0
    ? `${change > 0 ? "+" : change < 0 ? "−" : ""}${formatAcreFeet(Math.abs(change))} acre-feet`
    : "No weekly storage change";
  return { week: weekOf(day), published, through: summary.through, scope, notes, sourceDates: dates, sections, caption,
    frame: { name: title, figure, stored: "Net change over seven days",
      lines: [
        `${summary.storage.measured} of ${summary.storage.published} reservoirs reported a weekly change.`,
        summary.snow.percentNow === null ? "Snow: no comparison with normal is available."
          : `Snow: ${formatPercent(summary.snow.percentNow)} of normal on ${formatDate(summary.snow.day!)}.`,
        drought ? `Drought map: ${formatDate(drought.map_date)}. All figures describe the whole region.`
          : "No drought map was available for this summary."
      ], source } };
}

/** Existing weeks are evidence: a rerun never revises their text or figures. */
export function appendDigest(ledger: WeeklyDigestLedger, entry: WeeklyDigestEntry): WeeklyDigestLedger {
  validateDigestLedger(ledger);
  if (ledger.entries.some((prior) => prior.week === entry.week)) return ledger;
  const result: WeeklyDigestLedger = { schema_version: 1, entries: [...ledger.entries, entry] };
  return validateDigestLedger(result);
}
