import { describe, expect, it } from "vitest";
import { droughtCsv, droughtCsvFilename } from "./drought-export";
import type { DroughtCoveragePayload } from "../types";

const payload: DroughtCoveragePayload = {
  schema_version: 1,
  map_date: "2026-08-25",
  release_date: "2026-08-27",
  source: "USDM",
  attribution: "USDM",
  method: {},
  unit_count: 1,
  units: [{
    huc6: "14", huc6_name: "Upper Colorado",
    percent_of_area: { none: 50, d0: 10, d1: 10, d2: 10, d3: 10, d4: 10 },
    percent_of_area_at_least: { d0: 50, d1: 40, d2: 30, d3: 20, d4: 10 }
  }],
  previous: {
    map_date: "2026-08-18", release_date: "2026-08-20",
    units: [{ huc6: "14", percent_of_area_at_least: {
      d0: 45, d1: 35, d2: 25, d3: 15, d4: 5
    } }]
  }
};

describe("drought CSV export", () => {
  it("includes current, previous and storage facts", () => {
    const csv = droughtCsv(payload, payload.units,
      new Map([["14", { percent: 71.2, reservoirCount: 3 }]]));
    expect(csv).toContain("Measured share (percent)");
    expect(csv).toContain("2026-08-25,2026-08-27,100,50,10,10,10,10,10");
    expect(csv).toContain("2026-08-18,2026-08-20,45,35,25,15,5,5,3,71.2");
  });

  it("leaves previous-week fields blank when no archive is attached", () => {
    const csv = droughtCsv({ ...payload, previous: null }, payload.units, null);
    expect(csv.split("\r\n")[1]).toContain(",,,,,,,,,");
  });

  it("names the selected geographic level", () => {
    expect(droughtCsvFilename(payload.map_date, 8))
      .toBe("western-drought-huc8-2026-08-25.csv");
  });
});
