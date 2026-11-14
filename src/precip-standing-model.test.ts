import { describe, expect, it } from "vitest";

import {
  classForPercentile, MIN_AREA_STATIONS, MIN_RECORD_YEARS, precipStandingValues, standingOf
} from "./precip-standing-model";
import type { PrecipitationHistory, PrecipitationPayload } from "./types";

const STEPS = ["10-01", "10-08", "10-15", "10-22"];

/** Years whose 8 October reading is 1.0, 1.1, ... in inches. */
function years(count: number, start = 1): number[][] {
  return Array.from({ length: count }, (_, index) => [0, start + index / 10, start + index / 10, start + index / 10]);
}

function history(full: Record<string, number[][]>, partial: Record<string, (number[] | null)[]> = {}): PrecipitationHistory {
  return {
    schema_version: 1, checked: "2026-10-24", first_water_year: 2001, last_water_year: 2020,
    step_month_days: STEPS, site_count: 0, available_site_count: Object.keys(full).length,
    sites: new Map(Object.entries(full)), partialSites: new Map(Object.entries(partial))
  };
}

function daily(readings: Record<string, number>): PrecipitationPayload {
  return {
    schema_version: 1, generated_at: "2026-10-09T00:00:00Z", as_of: "2026-10-09", water_year: 2027,
    series_dates: ["2026-10-07", "2026-10-08"], site_count: 0, late_site_count: 0, missing_site_count: 0,
    sites: Object.entries(readings).map(([station, inches]) => ({
      station, latest_date: "2026-10-08", late: false,
      readings: new Map([["2026-10-07", inches], ["2026-10-08", inches]])
    }))
  };
}

describe("precipitation against past years", () => {
  it("uses NCEI's deciles and terciles", () => {
    expect(classForPercentile(5)).toBe("much-below");
    expect(classForPercentile(20)).toBe("below");
    expect(classForPercentile(50)).toBe("near");
    expect(classForPercentile(80)).toBe("above");
    expect(classForPercentile(95)).toBe("much-above");
  });

  it("places a value by mid-rank to a tenth and names a record", () => {
    const past = [1, 2, 3, 4];
    expect(standingOf(2.04, past)).toMatchObject({ percentile: 37.5, rank: 3, record: null });
    expect(standingOf(5, past)).toMatchObject({ percentile: 100, rank: 1, record: "wettest", standingClass: "much-above" });
    expect(standingOf(0.5, past)).toMatchObject({ rank: 5, record: "driest", standingClass: "much-below" });
  });

  it("gives no class while the median is under an inch", () => {
    expect(standingOf(0.9, [0.1, 0.2, 0.3]).standingClass).toBeNull();
    expect(standingOf(0.9, [0.1, 0.2, 0.3]).record).toBe("wettest");
  });

  it("places full and partial records and keeps areas to the fixed set", () => {
    const partial = years(20).map((year, index) => (index < 20 - MIN_RECORD_YEARS ? null : year));
    const tooShort = years(20).map((year, index) => (index < 20 - MIN_RECORD_YEARS + 1 ? null : year));
    const values = precipStandingValues(
      daily({ a: 9, b: 9, c: 9, p: 0.5, s: 2 }),
      history({ a: years(20), b: years(20), c: years(20) }, { p: partial, s: tooShort }),
      new Map([["a", "x"], ["b", "x"], ["c", "x"], ["p", "x"], ["s", "x"]]));
    expect(values.date).toBe("2026-10-08");
    expect(values.sites.get("a")).toMatchObject({ record: "wettest", fullRecord: true, years: 20 });
    expect(values.sites.get("p")).toMatchObject({ record: "driest", fullRecord: false, years: MIN_RECORD_YEARS });
    expect(values.sites.has("s")).toBe(false);
    expect(values.shortRecord).toBe(1);
    const area = values.areas.get("x")!;
    expect(area.stations).toBe(3);
    expect(area.floor).toBe(MIN_AREA_STATIONS);
    expect(area.standing).toMatchObject({ inches: 9, record: "wettest" });
  });

  it("holds an area below the floor to no figure", () => {
    const values = precipStandingValues(daily({ a: 2 }), history({ a: years(20) }), new Map([["a", "x"]]));
    expect(values.areas.get("x")).toEqual({ standing: null, stations: 1, floor: MIN_AREA_STATIONS });
  });
});
