/*
 * The sentences a reader can copy out of a page (reporters.html).
 *
 * People paste this site's figures into posts and stories and lose the date,
 * the period or the source. These builders put them back. Nothing here
 * computes a figure or writes a word of its own about the water: every number,
 * date, period and provider comes from a builder the page already uses, and
 * is formatted the way the page formats it. A builder returns plain sentences,
 * each on its own line, with the credit line last, or null when the page has
 * nothing it can stand behind (ADR-006 applies to every word).
 *
 * Rules the text keeps: the reading date is always in it; a normal never
 * appears without its period; nothing forecasts or explains a cause; a late
 * reading is said to be late.
 */
import { isLate } from "../data/rollup";
import type { PrecipitationView } from "../precip-model";
import { formatInches, medianDifference, ordinal } from "../precip-model";
import { describeElevation } from "../reservoir-elevation-model";
import { answerRows } from "../reservoir-model";
import { SITE_ADDRESS } from "../reservoir-share-model";
import type { BaselineChoice, BaselineId, Reservoir } from "../types";
import { describeMovers, describeStorage } from "../viz/weekly-summary";
import { formatAcreFeet, formatDate, formatPercent } from "../viz/format";
import { headlinePercent } from "../viz/symbols";
import { weeklyScopeText, type WeeklySummary } from "../weekly-model";
import { activeBaseline, periodLabel } from "./baseline";
import { describeReservoir, percentFullBasis, providerName } from "./detail";

/** The provider of precipitation and snow-water measurements on this site. */
const PRECIPITATION_PROVIDER = "Natural Resources Conservation Service";

/**
 * "Source: [provider] data, shown on the Western Water Dashboard (address)."
 * The provider comes first, because the measurements are theirs. Two
 * providers are named together; more than that, or none, gets a neutral line
 * that does not guess.
 */
export function creditLine(providers: readonly string[]): string {
  const named = [...new Set(providers)];
  const who = named.length === 0 || named.length > 2
    ? "Data from several providers"
    : `${named.join(" and ")} data`;
  return `Source: ${who}, shown on the Western Water Dashboard (${SITE_ADDRESS}).`;
}

function plural(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export interface ReservoirFiguresInput {
  reservoir: Reservoir;
  /** The name as the page writes it, qualified where two share a name. */
  label: string;
  /** The payload's `generated_at`, which the level's lateness is judged against. */
  runDate: string;
  baseline: BaselineId;
  choices: readonly BaselineChoice[];
  minimumYears: number;
}

/** One reservoir: stored water, percent full, level, normal, changes, credit. */
export function reservoirFigures(input: ReservoirFiguresInput): string[] | null {
  const { reservoir, label, runDate, baseline, choices, minimumYears } = input;
  if (!Number.isFinite(reservoir.current_storage_af)) return null;

  const view = describeReservoir(reservoir, "", baseline, choices, minimumYears);
  const rows = answerRows(view.rows, view.baseline.label);
  const readingDate = rows.find((row) => row.label === "Reading date")?.value
    ?? formatDate(reservoir.as_of);
  const stored = view.rows.find((row) => row.label === "Stored now")?.value;
  if (!stored) return null;
  const lines: string[] = [`${label} held ${stored} on ${readingDate}.`];
  if (view.late) lines.push(view.late);

  if (headlinePercent(reservoir) !== null) {
    lines.push(`That is ${view.percent} ${percentFullBasis(reservoir)}.`);
  }

  const level = describeElevation(reservoir, runDate);
  if (level && reservoir.elevation) {
    lines.push(`The surface level was ${level.card.headline} ${level.card.basis} `
      + `on ${formatDate(reservoir.elevation.as_of)}.`);
    if (level.late) lines.push(level.late);
  }

  const active = activeBaseline(reservoir, baseline, minimumYears);
  if (active.value && active.value.normal_af !== null && active.shown !== null) {
    const years = active.value.sample_years;
    lines.push(`Normal for this week is ${formatAcreFeet(active.value.normal_af)} acre-feet, `
      + "the middle value for the same week in "
      + `${years} ${plural(years, "year", "years")} from ${periodLabel(choices, active.shown)}.`);
    if (active.value.pct_of_normal !== null && Number.isFinite(active.value.pct_of_normal)) {
      lines.push(`Storage is ${formatPercent(active.value.pct_of_normal)} of that normal.`);
    }
    if (!active.value.covers_full_period) {
      lines.push("This reservoir has readings for part of that period.");
    }
  }

  for (const row of rows) {
    if (row.label.startsWith("Change in") && row.value !== "—") {
      lines.push(`${row.label}: ${row.value}.`);
    }
  }

  lines.push(creditLine([providerName(reservoir),
    ...(reservoir.elevation ? ["Bureau of Reclamation"] : [])]));
  return lines;
}

/**
 * The week's storage on the storage charts page, for the same rows the "What
 * moved this week" card follows. Snow and drought are not here: they describe
 * the whole region, from other providers, whatever the filters chose.
 */
export function weeklyFigures(
  summary: WeeklySummary, reservoirs: readonly Reservoir[], scoped: readonly Reservoir[]
): string[] | null {
  if (summary.storage.measured === 0) return null;
  const measured = reservoirs.filter((reservoir) => reservoir.change_7d_af !== null);
  const dates = measured.map((reservoir) => reservoir.as_of).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === undefined || last === undefined) return null;

  const lines = [
    weeklyScopeText(reservoirs, scoped),
    "These are changes over the last seven days.",
    first === last
      ? `All readings are from ${formatDate(first)}.`
      : `Readings are from ${formatDate(first)} to ${formatDate(last)}.`
  ];
  const late = measured.filter(isLate).length;
  if (late > 0) {
    lines.push(`${late} ${plural(late, "reservoir has a late reading", "reservoirs have late readings")}.`);
  }
  lines.push(...describeStorage(summary.storage), ...describeMovers(summary.storage));
  lines.push(creditLine(measured.map(providerName)));
  return lines;
}

/**
 * The precipitation card's headline figures for the place the page shows.
 * `where` is the place as the page's own summary line names it.
 */
export function precipitationFigures(view: PrecipitationView, where: string): string[] | null {
  const h = view.headline;
  if (!h) return null;
  const stations = `${view.stations.length} ${plural(view.stations.length, "station", "stations")}`;
  const difference = medianDifference(h);
  const lines = [
    `These figures are for ${where}.`,
    `To ${formatDate(h.date)}, the mean precipitation since 1 October was `
      + `${formatInches(h.inches)} at ${stations}.`,
    `The median for this date, in the water years ${view.firstWaterYear} to `
      + `${view.lastWaterYear}, is ${formatInches(h.medianInches)}.`,
    difference.direction === "same"
      ? "That is the same as the median."
      : `That is ${formatInches(difference.inches)} ${difference.direction} than the median.`
  ];
  if (h.percentOfMedian !== null) lines.push(`It is ${h.percentOfMedian}% of the median.`);
  lines.push(`Its history rank is ${ordinal(h.rank)} highest of ${h.rankedYears} water years, `
    + `${view.firstWaterYear} to this year.`);
  if (h.shareOfMedianYear !== null) {
    lines.push(`This is ${h.shareOfMedianYear}% of a median year.`,
      `A median year brings ${formatInches(h.medianYearInches)}.`);
  }
  if (view.late > 0) {
    lines.push(`${view.late} ${plural(view.late, "station is", "stations are")} not used because of late data.`);
  }
  lines.push(creditLine([PRECIPITATION_PROVIDER]));
  return lines;
}
