import { describe, expect, it } from "vitest";
import { validatePrecipitationHistory, validatePrecipitationPayload } from "./data/precip-validate";
import { ordinal, precipitationView, quantile, stepDate, valueOnDate } from "./precip-model";
import type { PrecipitationHistory, PrecipitationPayload, SnowSite } from "./types";

const STEPS = ["10-01", "10-08", "01-07", "04-01", "09-30"];

/** A history whose year y accumulates `scale(y)` times a fixed shape. */
function history(stations: Record<string, (year: number) => number>, years = 5): PrecipitationHistory {
  const shape = [0, 1, 10, 20, 30];
  return {
    schema_version: 1,
    checked: "2026-10-24",
    first_water_year: 2001,
    last_water_year: 2000 + years,
    step_month_days: STEPS,
    site_count: Object.keys(stations).length,
    available_site_count: Object.keys(stations).length,
    sites: new Map(Object.entries(stations).map(([station, scale]) => [
      station,
      Array.from({ length: years }, (_, year) => shape.map((value) => value * scale(year)))
    ]))
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

function snow(station: string, rows: [string, number | null][]): SnowSite {
  return { station, series: rows.map(([date, value]) => [date, value, null]) } as unknown as SnowSite;
}

describe("precipitation against its own history", () => {
  it("reads steps on the calendar of the current water year", () => {
    expect(stepDate(2027, "10-01")).toBe("2026-10-01");
    expect(stepDate(2027, "04-01")).toBe("2027-04-01");
  });

  it("uses one quantile rule for every band edge", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([0, 10], 0.1)).toBeCloseTo(1);
  });

  it("reads a weekly curve on a straight line between steps", () => {
    const dates = ["2026-10-01", "2026-10-08"];
    expect(valueOnDate([0, 7], dates, "2026-10-04")).toBeCloseTo(3);
    expect(valueOnDate([0, 7], dates, "2026-10-08")).toBe(7);
    expect(valueOnDate([0, 7], dates, "2026-09-30")).toBeNull();
  });

  it("is a mean over one fixed set: no history, late and outside stations stay out", () => {
    const view = precipitationView(
      ["a", "b", "c", "d"],
      daily({
        a: { "2026-10-08": 2 },
        b: { "2026-10-08": 4 },
        c: { "2026-10-08": 100 },
        d: { "2026-10-08": 100 },
        outside: { "2026-10-08": 100 }
      }, ["d"]),
      history({ a: (y) => y + 1, b: (y) => y + 1, d: (y) => y + 1 }),
      []);
    expect(view.stations).toEqual(["a", "b"]);
    expect(view.withoutHistory).toBe(1);
    expect(view.late).toBe(1);
    expect(view.headline?.inches).toBe(3);
  });

  it("ranks the year among the window's years, highest first, and shares a tie", () => {
    // Years scale 1..5 give 1..5 inches on 8 October; this year has 4.
    const view = precipitationView(["a"], daily({ a: { "2026-10-08": 4 } }),
      history({ a: (y) => y + 1 }), []);
    expect(view.headline?.rank).toBe(2);
    expect(view.headline?.rankedYears).toBe(6);
    expect(view.headline?.medianInches).toBe(3);
    expect(ordinal(view.headline!.rank)).toBe("2nd");
  });

  it("prints no percent of median while the median is under an inch", () => {
    const view = precipitationView(["a"], daily({ a: { "2026-10-08": 0.9 } }),
      history({ a: () => 0.5 }), []);
    expect(view.headline?.medianInches).toBe(0.5);
    expect(view.headline?.percentOfMedian).toBeNull();
    expect(view.headline?.shareOfMedianYear).toBe(6);
  });

  it("says what is still needed to reach the median for 1 April", () => {
    const view = precipitationView(["a"], daily({ a: { "2026-10-08": 1 } }),
      history({ a: (y) => y + 1 }), []);
    // Median year: 3 on 8 October, 60 on 1 April.
    expect(view.headline?.toApril1).toEqual({
      medianInches: 60, neededInches: 59, medianGainInches: 57
    });
  });

  it("draws a day only when every station in the set has a value", () => {
    const view = precipitationView(["a", "b"],
      daily({ a: { "2026-10-07": 1, "2026-10-08": 2 }, b: { "2026-10-08": 2 } }),
      history({ a: () => 1, b: () => 1 }), [
        snow("a", [["2026-10-08", 0.4]]),
        snow("b", [["2026-10-08", 0.2]])
      ]);
    expect(view.precipitation).toEqual([
      { date: "2026-10-07", inches: null },
      { date: "2026-10-08", inches: 2 }
    ]);
    expect(view.snow?.snowInches).toBe(0.3);
  });

  it("gives the drawn band the same median as the headline between steps", () => {
    // Three years going 0->7, 3->3 and 4->4 from 1 to 8 October: read each
    // year on 4 October first (3, 3, 4) and the median is 3; joining the
    // weekly medians (3 and 4) would say 3.4.
    const years = [[0, 7], [3, 3], [4, 4]].map(([a, b]) => [a!, b!, b!, b!, b!]);
    const custom: PrecipitationHistory = {
      ...history({ a: () => 1 }, 3), sites: new Map([["a", years]])
    };
    const view = precipitationView(["a"], daily({ a: { "2026-10-04": 2 } }), custom, []);
    expect(view.headline?.medianInches).toBe(3);
    expect(view.bands.find((band) => band.date === "2026-10-04")?.median).toBe(3);
    expect(view.bands[0]?.date).toBe("2026-10-01");
    expect(view.bands.at(-1)?.date).toBe("2027-09-30");
  });

  it("reads snow water on its own newest complete day, at most two days back", () => {
    const precip = { a: { "2026-10-05": 0.5, "2026-10-07": 1, "2026-10-08": 2 } };
    const lagging = precipitationView(["a"], daily(precip), history({ a: () => 1 }),
      [snow("a", [["2026-10-07", 0.5]])]);
    expect(lagging.headline?.date).toBe("2026-10-08");
    expect(lagging.snow).toEqual({ date: "2026-10-07", snowInches: 0.5, precipitationInches: 1 });
    const stale = precipitationView(["a"], daily(precip), history({ a: () => 1 }),
      [snow("a", [["2026-10-05", 0.2]])]);
    expect(stale.snow).toBeNull();
    const silent = precipitationView(["a"], daily(precip), history({ a: () => 1 }), []);
    expect(silent.headline?.date).toBe("2026-10-08");
    expect(silent.snow).toBeNull();
  });

  it("keeps the line current when one station misses the newest day", () => {
    const readings: Record<string, Record<string, number>> = {};
    for (let n = 0; n < 20; n += 1) readings[`s${n}`] = { "2026-10-07": 1, "2026-10-08": 2 };
    delete readings["s0"]!["2026-10-08"];
    const view = precipitationView(Object.keys(readings), daily(readings),
      history(Object.fromEntries(Object.keys(readings).map((s) => [s, () => 1]))), []);
    expect(view.headline?.date).toBe("2026-10-08");
    expect(view.stations).toHaveLength(19);
    expect(view.late).toBe(1);
  });

  it("returns no headline for a place with no station in the set", () => {
    const view = precipitationView(["c"], daily({ c: { "2026-10-08": 1 } }),
      history({ a: () => 1 }), []);
    expect(view.stations).toEqual([]);
    expect(view.headline).toBeNull();
  });
});

describe("precipitation file validation", () => {
  it("decodes history from tenths and step changes", () => {
    const decoded = validatePrecipitationHistory({
      schema_version: 1, checked: "2026-10-24", first_water_year: 2001, last_water_year: 2001,
      step_month_days: ["10-01", "10-08"], sites: [
        { station: "a", available: true, years: [[5, 12]] },
        { station: "b", available: false, reason: "no precipitation record" }
      ]
    });
    expect(decoded.sites.get("a")).toEqual([[0.5, 1.7]]);
    expect(decoded.sites.has("b")).toBe(false);
  });

  it("refuses a station whose history misses a year", () => {
    expect(() => validatePrecipitationHistory({
      schema_version: 1, checked: "2026-10-24", first_water_year: 2001, last_water_year: 2002,
      step_month_days: ["10-01", "10-08"], sites: [{ station: "a", available: true, years: [[1, 1]] }]
    })).toThrow(/does not cover/);
  });

  it("refuses a calendar written out of date order", () => {
    expect(() => validatePrecipitationPayload({
      schema_version: 1, generated_at: "x", as_of: "2026-10-09", water_year: 2027,
      series_dates: ["2026-10-08", "2026-10-01"],
      sites: [{ station: "a", latest_date: "2026-10-08", late: false,
        series_days: [0, 1], series_values: [5, 0] }]
    })).toThrow(/date order/);
  });

  it("refuses positions out of order", () => {
    expect(() => validatePrecipitationPayload({
      schema_version: 1, generated_at: "x", as_of: "2026-10-09", water_year: 2027,
      series_dates: ["2026-10-01", "2026-10-02"],
      sites: [{ station: "a", latest_date: "2026-10-02", late: false,
        series_days: [1, 0], series_values: [1, 2] }]
    })).toThrow(/unreadable series/);
  });
});
