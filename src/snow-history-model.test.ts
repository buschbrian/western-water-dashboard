import { describe, expect, it } from "vitest";
import { snowHistoryView } from "./snow-history-model";
import type { PrecipitationHistory, SnowSite } from "./types";

const history: PrecipitationHistory = {
  schema_version: 1, checked: "2026-10-01", first_water_year: 1991, last_water_year: 1992,
  step_month_days: ["10-01", "03-01", "09-30"], site_count: 2, available_site_count: 2,
  sites: new Map([["A", [[0, 2, 0], [0, 6, 0]]], ["B", [[0, 20, 0], [0, 40, 0]]]])
};
const site = (station: string, value: number | null, normal: number, late = false): SnowSite => ({
  station, late, series: [["2023-10-01", 0, 0], ["2024-03-01", value, normal]]
} as SnowSite);

describe("snow seasons over one fixed set", () => {
  it("means each earlier season over the same sites and divides summed snow by summed normals once", () => {
    const view = snowHistoryView([site("A", 2, 1), site("B", 20, 40)], history, 2024);
    expect(view.stations).toEqual(["A", "B"]);
    expect(view.bands.find((point) => point.date === "2024-03-01")?.median).toBe(17);
    expect(view.headline?.percentOfNormal).toBeCloseTo(22 / 41 * 100);
    expect(view.headline?.inches).toBe(11);
    expect(view.headline?.medianInches).toBe(17);
    expect(view.headline?.rank).toBe(2);
    expect(view.headline?.rankedYears).toBe(3);
  });

  it("keeps a zero snow reading, refuses a thin normal ratio, and omits late and incomplete histories", () => {
    const view = snowHistoryView([site("A", 0, 0.1), site("B", 20, 40, true), site("C", 2, 2)], history, 2024);
    expect(view.stations).toEqual(["A"]);
    expect(view.headline?.inches).toBe(0);
    expect(view.headline?.percentOfNormal).toBeNull();
    expect(view.withoutHistory).toBe(1);
    expect(view.late).toBe(1);
  });

  it("refuses a percent below an inch of normal even when the sites are enough", () => {
    const view = snowHistoryView([site("A", 0.2, 0.4), site("B", 0.6, 0.4)], history, 2024);
    expect(view.headline?.meetsSiteFloor).toBe(true);
    expect(view.headline?.normalInches).toBe(0.4);
    expect(view.headline?.percentOfNormal).toBeNull();
  });

  it("holds the page's headline floor: half of the place's sites, not half of the set", () => {
    const sites = [site("A", 2, 1), site("B", 20, 40), site("C", 5, 5), site("D", 5, 5), site("E", 5, 5)];
    const view = snowHistoryView(sites, history, 2024);
    expect(view.stations).toHaveLength(2);
    expect(view.withoutHistory).toBe(3);
    expect(view.headline?.meetsSiteFloor).toBe(false);
    expect(view.headline?.percentOfNormal).toBeNull();
    expect(view.headline?.inches).toBe(11);
    expect(view.headline?.medianInches).toBe(17);
  });

  it("sets the set on the newest day nine in ten sites report, and counts the rest as late", () => {
    const names = Array.from({ length: 10 }, (_, index) => `S${index}`);
    const wide: PrecipitationHistory = {
      ...history, sites: new Map(names.map((name) => [name, [[0, 1, 0], [0, 3, 0]]]))
    };
    const sites = names.map((name, index) => site(name, index === 9 ? null : 2, 4));
    const view = snowHistoryView(sites, wide, 2024);
    expect(view.stations).toEqual(names.slice(0, 9));
    expect(view.late).toBe(1);
    expect(view.headline?.date).toBe("2024-03-01");
    expect(view.headline?.rank).toBe(2);
  });

  it("sums the percent over the sites with a normal, and holds the floor on that count", () => {
    const noNormal = (station: string, value: number): SnowSite => ({
      station, late: false, series: [["2023-10-01", 0, null], ["2024-03-01", value, null]]
    } as SnowSite);
    const view = snowHistoryView([site("A", 2, 4), noNormal("B", 20)], history, 2024);
    expect(view.headline?.inches).toBe(11);
    expect(view.headline?.normalSites).toBe(1);
    expect(view.headline?.meetsSiteFloor).toBe(false);
    expect(view.headline?.percentOfNormal).toBeNull();
    const wide: PrecipitationHistory = { ...history, sites: new Map([...history.sites, ["C", [[0, 1, 0], [0, 1, 0]]]]) };
    const counted = snowHistoryView([site("A", 2, 4), noNormal("B", 20), site("C", 4, 4)], wide, 2024);
    expect(counted.headline?.normalSites).toBe(2);
    expect(counted.headline?.percentOfNormal).toBeCloseTo(6 / 8 * 100);
  });

  it("does not count the shown season among earlier seasons", () => {
    const view = snowHistoryView([site("A", 2, 2)], history, 1992);
    expect(view.lastWaterYear).toBe(1991);
    expect(view.years).toBe(1);
  });

  it("draws nothing for a place with no full record", () => {
    const view = snowHistoryView([site("Z", 2, 2)], history, 2024);
    expect(view.stations).toEqual([]);
    expect(view.bands).toEqual([]);
    expect(view.headline).toBeNull();
    expect(view.withoutHistory).toBe(1);
  });
});
