/*
 * The copied sentences, held to the rules reporters.html sets: the reading
 * date is always there, a normal never appears without its period, the credit
 * line names the provider first, and a late reading is said to be late.
 *
 * Built from fixtures and compared with the payload's own fields, never with
 * a literal from today's numbers.
 */
import { describe, expect, it } from "vitest";
import { syntheticElevation } from "../data/elevation-fixture";
import { readPayload } from "../data/payload-fixture";
import { formatInches, precipitationView } from "../precip-model";
import { SITE_ADDRESS } from "../reservoir-share-model";
import type { PrecipitationHistory, PrecipitationPayload, Reservoir } from "../types";
import { formatAcreFeet, formatDate, formatPercent } from "../viz/format";
import { headlinePercent } from "../viz/symbols";
import { weeklySummary } from "../weekly-model";
import { baselineChoices } from "./baseline";
import { providerName } from "./detail";
import { PERCENT_BASIS_SENTENCE, percentAmounts, type CurvePoint } from "../snow-model";
import {
  creditLine, precipitationFigures, reservoirFigures, snowFigures, weeklyFigures,
  type SnowFiguresInput
} from "./figures-text";

const payload = readPayload();
const choices = baselineChoices(payload);
const base = payload.reservoirs[0]!;

function figures(reservoir: Reservoir, baseline: "recent" | "climate" = "recent"): string[] {
  const lines = reservoirFigures({
    reservoir, label: reservoir.name, runDate: payload.generated_at, baseline, choices,
    minimumYears: payload.climate_normals?.minimum_years ?? 0
  });
  expect(lines).not.toBeNull();
  return lines!;
}

const withLevel: Reservoir = { ...base, name: "Testwater", elevation: syntheticElevation() };
const { elevation: _drop, ...plain } = withLevel;
const withoutLevel = plain as Reservoir;

/* The longest sentence in a line, split the way the browser suite splits prose. */
const words = (line: string): number => Math.max(...line.trim()
  .split(/(?<=[.!?])\s+(?=[A-Z"\u2014\d])/).map((part) => part.trim().split(/\s+/).length));
const RETIRED = /\b(RISE|AWDB|CDEC|CDSS|NWIS|USGS|USACE|CWMS|DSOD|FERC)\b/;
const OVERREACH = /forecast|will be|expected|caused|due to|record (low|high)|record-/i;

describe("the credit line", () => {
  it("names the provider first and carries the site's address once", () => {
    const line = creditLine(["Bureau of Reclamation"]);
    expect(line).toBe(
      `Source: Bureau of Reclamation data, shown on the Western Water Dashboard (${SITE_ADDRESS}).`);
    expect(line.split(SITE_ADDRESS)).toHaveLength(2);
  });

  it("is neutral rather than a guess for a combined figure", () => {
    for (const providers of [[], ["A", "B", "C"]]) {
      const line = creditLine(providers);
      expect(line).toBe(
        `Source: Data from several providers, shown on the Western Water Dashboard (${SITE_ADDRESS}).`);
    }
  });

  it("names two providers once each, in order", () => {
    expect(creditLine(["A", "B", "A"])).toMatch(/^Source: A and B data, shown on /);
  });
});

describe("one reservoir", () => {
  it("leads with the stored water and the reading date, as the page writes them", () => {
    const lines = figures(withLevel);
    expect(lines[0]).toBe(
      `Testwater held ${formatAcreFeet(withLevel.current_storage_af)} acre-feet on `
      + `${formatDate(withLevel.as_of)}.`);
  });

  it("gives percent full with the full level it is measured against", () => {
    const lines = figures(withLevel);
    const line = lines.find((entry) => entry.startsWith("That is "))!;
    expect(line).toContain(formatPercent(headlinePercent(withLevel)));
    expect(line).toMatch(/ full( \(.+\))?\.$/);
  });

  it("gives the surface level with its datum and its own date when there is one", () => {
    const lines = figures(withLevel);
    const level = lines.find((entry) => entry.startsWith("The surface level was"))!;
    expect(level).toContain("3,500.25 feet above the National Geodetic Vertical Datum of 1929");
    expect(level).toContain(formatDate(withLevel.elevation!.as_of));
    expect(level).not.toMatch(/NGVD|NAVD|%/);
  });

  it("has no level sentence for a reservoir without a reviewed level", () => {
    const lines = figures(withoutLevel);
    expect(lines.some((entry) => /surface level/i.test(entry))).toBe(false);
    expect(lines.some((entry) => /\d feet/.test(entry))).toBe(false);
  });

  it("never gives a normal without its period and its years", () => {
    for (const baseline of ["recent", "climate"] as const) {
      const lines = figures(withLevel, baseline);
      const normal = lines.find((entry) => entry.startsWith("Normal for this week"));
      if (!normal) continue;
      const shown = choices.map((choice) => choice.period_label);
      expect(shown.some((period) => normal.includes(period))).toBe(true);
      expect(normal).toMatch(/in \d+ years? from /);
    }
  });

  it("says nothing about a normal the reservoir cannot answer", () => {
    const lines = figures({
      ...withLevel, baselines: { recent: null, climate: null },
      seasonal_normal_af: null, pct_of_seasonal_normal: null
    } as Reservoir);
    expect(lines.some((entry) => /Normal for this week|of that normal/.test(entry))).toBe(false);
  });

  it("gives the 30-day and 1-year changes with the dates the page shows", () => {
    const reservoir = {
      ...withoutLevel,
      change_30d_af: -1200, change_30d_pct: -2.5, change_30d_reference_date: "2026-09-01",
      change_30d_elapsed_days: 30,
      change_365d_af: 3400, change_365d_pct: 4.5, change_365d_reference_date: "2025-10-01",
      change_365d_elapsed_days: 365
    } as Reservoir;
    const lines = figures(reservoir);
    const thirty = lines.find((entry) => entry.startsWith("Change in 30 days"))!;
    expect(thirty).toContain(formatDate("2026-09-01"));
    expect(thirty).toContain("acre-feet");
    const year = lines.find((entry) => entry.startsWith("Change in 1 year"))!;
    expect(year).toContain(formatDate("2025-10-01"));
  });

  it("ends with the credit line, naming the provider first", () => {
    for (const reservoir of payload.reservoirs) {
      const lines = figures(reservoir);
      const provider = providerName(reservoir).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(lines[lines.length - 1]).toMatch(
        new RegExp(`^Source: ${provider}`
          + `( and Bureau of Reclamation)? data, shown on the Western Water Dashboard `));
      expect(lines[lines.length - 1]).toContain(SITE_ADDRESS);
    }
  });

  it("says a late reading is late, and still gives its date", () => {
    const lines = figures({ ...withLevel, is_stale: true, days_stale: 3 } as Reservoir);
    expect(lines).toContain("This reading is late by 3 days.");
    expect(lines[0]).toContain(formatDate(withLevel.as_of));
  });

  it("says a late level reading is late", () => {
    const lines = reservoirFigures({
      reservoir: { ...withLevel, elevation: syntheticElevation({ as_of: "2026-10-01" }) },
      label: "Testwater", runDate: "2026-10-21T12:00:00Z", baseline: "recent", choices,
      minimumYears: 0
    })!;
    expect(lines).toContain("This level reading is late by 20 days.");
  });

  it("is not offered with no reading to give", () => {
    expect(reservoirFigures({
      reservoir: { ...withLevel, current_storage_af: Number.NaN }, label: "Testwater",
      runDate: payload.generated_at, baseline: "recent", choices, minimumYears: 0
    })).toBeNull();
  });

  it("keeps every sentence short, plain and free of forecast or cause", () => {
    for (const reservoir of payload.reservoirs) {
      for (const baseline of ["recent", "climate"] as const) {
        for (const line of figures(reservoir, baseline)) {
          expect(words(line), line).toBeLessThanOrEqual(25);
          expect(line).not.toMatch(RETIRED);
          expect(line).not.toMatch(OVERREACH);
          expect(line).not.toContain("\n");
        }
      }
    }
  });
});

const rows = (over: Partial<Reservoir>[]): Reservoir[] => over.map((entry, index) => ({
  name: `Test ${index}`, source_key: "rise", as_of: "2026-08-15", current_storage_af: 1000,
  capacity_af: 2000, record_max_af: 1800, change_7d_af: 0, change_7d_pct: 0, is_stale: false,
  days_stale: 0, ...entry
} as unknown as Reservoir));

describe("the week's storage", () => {
  it("gives the scope, the range of reading dates, the sentences and the credit", () => {
    const set = rows([
      { change_7d_af: 100, as_of: "2026-08-14" },
      { change_7d_af: -300, as_of: "2026-08-15" }
    ]);
    const lines = weeklyFigures(weeklySummary(set, null, null), set, set)!;
    expect(lines[0]).toBe("Storage covers 2 reservoirs, Lake Powell excluded, Lake Mead excluded.");
    expect(lines).toContain(
      `Readings are from ${formatDate("2026-08-14")} to ${formatDate("2026-08-15")}.`);
    expect(lines.some((line) => line.startsWith("The measured reservoirs lost"))).toBe(true);
    expect(lines[lines.length - 1]).toBe(creditLine(["Bureau of Reclamation"]));
  });

  it("says one date when every reading is from the same day", () => {
    const set = rows([{ change_7d_af: 5 }]);
    const lines = weeklyFigures(weeklySummary(set, null, null), set, set)!;
    expect(lines).toContain(`All readings are from ${formatDate("2026-08-15")}.`);
  });

  it("is neutral when several providers stand behind the total", () => {
    const set = rows([
      { change_7d_af: 5, source_key: "rise" }, { change_7d_af: 7, source_key: "awdb" },
      { change_7d_af: 9, source_key: "cdec" }
    ]);
    const lines = weeklyFigures(weeklySummary(set, null, null), set, set)!;
    expect(lines[lines.length - 1]).toBe(creditLine([]));
  });

  it("says how many readings are late", () => {
    const set = rows([
      { change_7d_af: 5, is_stale: true }, { change_7d_af: 7, is_stale: true },
      { change_7d_af: 9 }
    ]);
    const lines = weeklyFigures(weeklySummary(set, null, null), set, set)!;
    expect(lines).toContain("2 reservoirs have late readings.");
  });

  it("follows the rows it is given, not the rows before the filters", () => {
    const all = rows([{ change_7d_af: 5 }, { change_7d_af: 7 }, { change_7d_af: 9 }]);
    const shown = all.slice(0, 1);
    const lines = weeklyFigures(weeklySummary(shown, null, null), shown, all)!;
    expect(lines[0]).toContain("1 of 3 reservoirs");
  });

  it("is not offered when no reservoir published a weekly change", () => {
    const set = rows([{ change_7d_af: null as never }]);
    expect(weeklyFigures(weeklySummary(set, null, null), set, set)).toBeNull();
    expect(weeklyFigures(weeklySummary([], null, null), [], [])).toBeNull();
  });

  it("keeps every sentence short for the whole payload", () => {
    const all = payload.reservoirs;
    const lines = weeklyFigures(weeklySummary(all, null, null), all, all);
    expect(lines).not.toBeNull();
    for (const line of lines!) {
      expect(words(line), line).toBeLessThanOrEqual(25);
      expect(line).not.toMatch(RETIRED);
      expect(line).not.toMatch(OVERREACH);
    }
  });
});

const STEPS = ["10-01", "10-08", "01-07", "04-01", "09-30"];

function history(stations: string[], years = 5): PrecipitationHistory {
  const shape = [0, 1, 10, 20, 30];
  return {
    schema_version: 1,
    checked: "2026-10-24",
    first_water_year: 2001,
    last_water_year: 2000 + years,
    step_month_days: STEPS,
    site_count: stations.length,
    available_site_count: stations.length,
    partialSites: new Map(),
    sites: new Map(stations.map((station) => [station,
      Array.from({ length: years }, (_, year) => shape.map((value) => value * (year + 1)))]))
  };
}

function daily(readings: Record<string, Record<string, number>>, late: string[] = []): PrecipitationPayload {
  const dates = [...new Set(Object.values(readings).flatMap(Object.keys))].sort();
  return {
    schema_version: 1,
    generated_at: "2026-10-09T00:00:00Z",
    as_of: "2026-10-09",
    water_year: 2027,
    series_dates: dates,
    site_count: Object.keys(readings).length,
    late_site_count: late.length,
    missing_site_count: 0,
    sites: Object.entries(readings).map(([station, values]) => ({
      station,
      latest_date: Object.keys(values).sort().at(-1)!,
      late: late.includes(station),
      readings: new Map(Object.entries(values))
    }))
  };
}

describe("precipitation", () => {
  const view = () => precipitationView(["a", "b", "c"],
    daily({ a: { "2026-10-08": 4 }, b: { "2026-10-08": 4 }, c: { "2026-10-08": 4 } }, ["c"]),
    history(["a", "b", "c"]), []);

  it("gives the headline figures with the date, the place, the period and the credit", () => {
    const v = view();
    const lines = precipitationFigures(v, "Utah")!;
    const h = v.headline!;
    expect(lines[0]).toBe("These figures are for Utah.");
    expect(lines).toContain(
      `To ${formatDate(h.date)}, the mean precipitation since 1 October was `
      + `${formatInches(h.inches)} at 2 stations.`);
    expect(lines).toContain(
      `The median for this date, in the water years ${v.firstWaterYear} to ${v.lastWaterYear}, `
      + `is ${formatInches(h.medianInches)}.`);
    expect(lines.some((line) => line.includes("highest of"))).toBe(true);
    expect(lines).toContain("1 station is not used because of late data.");
    expect(lines[lines.length - 1]).toBe(creditLine(["Natural Resources Conservation Service"]));
  });

  it("never gives a median without its water years", () => {
    for (const line of precipitationFigures(view(), "the whole region")!) {
      if (/median for this date/.test(line)) expect(line).toMatch(/water years \d{4} to \d{4}/);
      expect(words(line), line).toBeLessThanOrEqual(25);
      expect(line).not.toMatch(OVERREACH);
      expect(line).not.toMatch(RETIRED);
    }
  });

  it("is not offered when the card has no headline", () => {
    const empty = precipitationView([], daily({ a: { "2026-10-08": 4 } }), history(["a"]), []);
    expect(precipitationFigures(empty, "Utah")).toBeNull();
  });
});

describe("snow", () => {
  const latest: CurvePoint = {
    date: "2027-02-01", percent: 84.6, reportingSites: 9, meanInches: 11, normalInches: 13
  };
  const peak: CurvePoint = { ...latest, date: "2027-01-10", percent: 112.3 };
  const input = (over: Partial<SnowFiguresInput> = {}): SnowFiguresInput => ({
    where: "Utah", latest, reading: latest, peak, sites: 12, late: 0,
    normalPeriod: "1991 through 2020", finishedSeason: null, ...over
  });

  it("gives the percent with its date, sites, amounts, period and credit", () => {
    const lines = snowFigures(input())!;
    expect(lines[0]).toBe("These figures are for Utah.");
    expect(lines).toContain(`On ${formatDate(latest.date)}, snow water was `
      + `${formatPercent(latest.percent)} of normal at 9 of 12 measurement sites.`);
    expect(lines).toContain(percentAmounts(latest));
    expect(lines).toContain("Normal is the middle value for the same day in the years 1991 through 2020.");
    expect(lines).toContain(PERCENT_BASIS_SENTENCE);
    expect(lines).toContain(`The highest percent of normal this season was `
      + `${formatPercent(peak.percent)}, on ${formatDate(peak.date)}.`);
    expect(lines[lines.length - 1]).toBe(creditLine(["Natural Resources Conservation Service"]));
  });

  it("does not repeat the newest day as the season's highest", () => {
    const lines = snowFigures(input({ peak: latest }))!;
    expect(lines.some((line) => line.startsWith("The highest percent"))).toBe(false);
  });

  it("gives the depth alone when the normal is too small to compare against", () => {
    const reading: CurvePoint = {
      date: "2026-10-20", percent: 266, reportingSites: 8, meanInches: 0.64, normalInches: 0.24
    };
    const lines = snowFigures(input({ latest: null, reading, peak: null }))!;
    expect(lines).toContain(`On ${formatDate(reading.date)}, the mean snow water was `
      + "0.6 inches at 8 of 12 measurement sites.");
    expect(lines).toContain("There is too little normal snow for this date to compare against.");
    expect(lines.join("\n")).not.toContain("%");
  });

  it("is not offered when too few sites reported", () => {
    expect(snowFigures(input({ latest: null, reading: null, peak: null }))).toBeNull();
    expect(snowFigures(input({
      latest: null, peak: null, reading: { date: "2026-10-02", percent: null, reportingSites: 7 }
    }))).toBeNull();
  });

  it("says a finished season is finished, and how many sites have late data", () => {
    const lines = snowFigures(input({ finishedSeason: "2025\u201326", late: 1 }))!;
    expect(lines[1]).toBe("This is the finished 2025\u201326 snow season.");
    expect(lines).toContain("1 site has no new value for more than two days.");
    expect(snowFigures(input({ late: 3 }))).toContain(
      "3 sites have no new value for more than two days.");
  });

  it("keeps every sentence short and in the published vocabulary", () => {
    const where = "mountain sites upstream of Lake Powell, in the whole region";
    for (const line of snowFigures(input({ where, finishedSeason: "2025\u201326", late: 2 }))!) {
      expect(words(line), line).toBeLessThanOrEqual(25);
      expect(line).not.toMatch(RETIRED);
      expect(line).not.toMatch(OVERREACH);
    }
  });
});
