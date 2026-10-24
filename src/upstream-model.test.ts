import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateReservoirPayload } from "./data/validate";
import type { Reservoir } from "./types";
import { upstreamSummary } from "./upstream-model";

/* Built from a real published record so the fixture keeps the payload's
 * shape; every number the tests read is set here, not taken from today. */
const payload = validateReservoirPayload(JSON.parse(
  readFileSync(new URL("../reservoirs.json", import.meta.url), "utf8")) as unknown);
const base = payload.reservoirs[0]!;
const reservoir = (station: string, huc6: string, huc6Name: string, storage: number, capacity: number): Reservoir => ({
  ...base, name: `R${station}`, source_station_id: station, huc6, huc6_name: huc6Name,
  current_storage_af: storage, capacity_af: capacity, record_max_af: capacity
});

describe("what is above a reservoir", () => {
  const roster = [
    reservoir("a", "140401", "Upper Green", 600, 1000),
    reservoir("b", "140401", "Upper Green", 50, 100),
    reservoir("c", "140801", "Upper San Juan", 900, 1000),
    reservoir("d", "140100", "Colorado Headwaters", 10, 10)
  ];

  it("totals the set with the storage map's own sum of acre-feet", () => {
    const summary = upstreamSummary(["a", "b", "c"], roster, (r) => r.name);
    expect(summary.rollup.storageAf).toBe(1550);
    expect(summary.rollup.capacityAf).toBe(2100);
    expect(summary.rollup.percentFull).toBeCloseTo(1550 / 2100 * 100, 5);
  });

  it("groups by drainage area, most stored water first, reservoirs by size", () => {
    const summary = upstreamSummary(["b", "a", "c"], roster, (r) => r.name);
    expect(summary.groups.map((group) => group.name)).toEqual(["Upper San Juan", "Upper Green"]);
    expect(summary.groups[1]!.rows.map((row) => row.label)).toEqual(["Ra", "Rb"]);
    expect(summary.groups[1]!.rollup.storageAf).toBe(650);
  });

  it("counts a traced station the roster does not publish today", () => {
    const summary = upstreamSummary(["a", "gone"], roster, (r) => r.name);
    expect(summary.rows).toHaveLength(1);
    expect(summary.notPublished).toBe(1);
  });
});
