import { describe, expect, it } from "vitest";
import { snowHistoryView } from "./snow-history-model";
import type { PrecipitationHistory, SnowSite } from "./types";

const history: PrecipitationHistory = {
  schema_version: 1, checked: "2026-10-01", first_water_year: 1991, last_water_year: 1992,
  step_month_days: ["10-01", "03-01", "09-30"], site_count: 2, available_site_count: 2,
  sites: new Map([["A", [[0, 2, 0], [0, 6, 0]]], ["B", [[0, 20, 0], [0, 40, 0]]]])
};
const site = (station: string, value: number, normal: number, late = false): SnowSite => ({
  station, late, series: [["2023-10-01", 0, 0], ["2024-03-01", value, normal]]
} as SnowSite);

describe("snow seasons over one fixed set", () => {
  it("means each historical season over the same sites and divides summed snow by summed normals once", () => {
    const view = snowHistoryView([site("A", 2, 1), site("B", 20, 40)], history, 2024);
    expect(view.stations).toEqual(["A", "B"]);
    expect(view.bands.find((point) => point.date === "2024-03-01")?.median).toBe(17);
    expect(view.headline?.percentOfNormal).toBeCloseTo(22 / 41 * 100);
    expect(view.headline?.inches).toBe(11);
  });
  it("keeps a zero snow reading, refuses a thin normal ratio, and omits late and incomplete histories", () => {
    const view = snowHistoryView([site("A", 0, 0.1), site("B", 20, 40, true), site("C", 2, 2)], history, 2024);
    expect(view.stations).toEqual(["A"]);
    expect(view.headline?.inches).toBe(0);
    expect(view.headline?.percentOfNormal).toBeNull();
    expect(view.withoutHistory).toBe(1);
    expect(view.late).toBe(1);
  });
  it("does not count the shown season among earlier seasons", () => {
    const view = snowHistoryView([site("A", 2, 2)], history, 1992);
    expect(view.lastWaterYear).toBe(1991);
    expect(view.years).toBe(1);
  });
});
