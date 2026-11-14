import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateSoilMoisturePayload } from "./soil-validate";

function site(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    station: "1:UT:SNTL", depths_inches: [2, 8, 20], latest_date: "2026-10-26", late: false,
    readings: [[20.1], [15], [10]], frozen_days: [],
    end_percent: 21.4, start_percent: 18.2, change_points: 3.2, no_change_reason: null,
    ...overrides
  };
}

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: 1, generated_at: "2026-10-27T15:00:00Z", as_of: "2026-10-27", change_days: 7,
    end_date: "2026-10-26", start_date: "2026-10-19", minimum_reporting_sites: 2,
    missing_site_count: 0,
    rollups: [{ huc6: "160202", huc6_name: "Jordan", site_count: 1, measured_site_count: 1,
      minimum_reporting_sites: 2, mean_change_points: null }],
    sites: [site()],
    ...overrides
  };
}

describe("the soil-moisture validator", () => {
  it("reads a well-formed file and counts from its own rows", () => {
    const read = validateSoilMoisturePayload(payload({
      sites: [site(), site({ station: "2:UT:SNTL", change_points: null, end_percent: null,
        no_change_reason: "frozen" })]
    }));
    expect(read.site_count).toBe(2);
    expect(read.measured_site_count).toBe(1);
    expect(read.frozen_site_count).toBe(1);
    expect(read.sites[0]!.change_points).toBe(3.2);
  });

  it("refuses a change and a reason together, or neither", () => {
    expect(() => validateSoilMoisturePayload(payload({ sites: [site({ no_change_reason: "frozen" })] })))
      .toThrow(/disagree/);
    expect(() => validateSoilMoisturePayload(payload({ sites: [site({ change_points: null })] })))
      .toThrow(/disagree/);
    expect(() => validateSoilMoisturePayload(payload({ sites: [site({ change_points: null, no_change_reason: "rain" })] })))
      .toThrow(/disagree/);
  });

  it("refuses a change that is not its two days", () => {
    expect(() => validateSoilMoisturePayload(payload({ sites: [site({ change_points: 4.2 })] })))
      .toThrow(/not its two days/);
  });

  it("refuses a percent outside the soil's volume and a duplicate station", () => {
    expect(() => validateSoilMoisturePayload(payload({ sites: [site({ end_percent: 140, change_points: 121.8 })] })))
      .toThrow(/not readable/);
    expect(() => validateSoilMoisturePayload(payload({ sites: [site(), site()] }))).toThrow(/not readable/);
  });

  it("refuses an area whose mean disagrees with its floor", () => {
    expect(() => validateSoilMoisturePayload(payload({
      rollups: [{ huc6: "160202", huc6_name: "Jordan", site_count: 1, measured_site_count: 1,
        minimum_reporting_sites: 2, mean_change_points: 3.2 }]
    }))).toThrow(/area 0/);
  });

  it("accepts a day with no week at all, and refuses half a week", () => {
    const empty = validateSoilMoisturePayload(payload({
      end_date: null, start_date: null,
      sites: [site({ change_points: null, end_percent: null, start_percent: null, no_change_reason: "missing_reading" })]
    }));
    expect(empty.end_date).toBeNull();
    expect(() => validateSoilMoisturePayload(payload({ start_date: null }))).toThrow(/week/);
  });

  it("reads the committed file", () => {
    const source = readFileSync(new URL("../../soil_moisture.json", import.meta.url), "utf8");
    const read = validateSoilMoisturePayload(JSON.parse(source) as unknown);
    expect(read.site_count).toBeGreaterThan(0);
    expect(read.measured_site_count).toBeLessThanOrEqual(read.site_count);
  });
});

describe("the soil-moisture validator, schema 2 (ADR-168)", () => {
  const band = { years: 14, p10: 12, p25: 16, p50: 19, p75: 22, p90: 26 };
  const v2 = (siteOverrides: Record<string, unknown>, rollup: Record<string, unknown> = {}) => payload({
    schema_version: 2,
    rollups: [{ huc6: "160202", huc6_name: "Jordan", site_count: 1, measured_site_count: 1,
      minimum_reporting_sites: 2, mean_change_points: null, compared_site_count: 1, history_class: null, ...rollup }],
    sites: [site({ history_band: band, history_class: "normal", no_history_reason: null, ...siteOverrides })]
  });

  it("reads a class that follows from its band", () => {
    const read = validateSoilMoisturePayload(v2({}));
    expect(read.sites[0]!.history_class).toBe("normal");
    expect(read.compared_site_count).toBe(1);
  });

  it("refuses a class the band does not give, or a class beside a reason", () => {
    expect(() => validateSoilMoisturePayload(v2({ history_class: "wetter" }))).toThrow(/does not follow/);
    expect(() => validateSoilMoisturePayload(v2({ no_history_reason: "short_history" }))).toThrow();
    expect(() => validateSoilMoisturePayload(v2({}, { history_class: "normal" }))).toThrow();
  });

  it("reads a schema 1 file as never compared", () => {
    const read = validateSoilMoisturePayload(payload());
    expect(read.sites[0]!.no_history_reason).toBe("no_history");
    expect(read.rollups[0]!.history_class).toBeNull();
  });
});
