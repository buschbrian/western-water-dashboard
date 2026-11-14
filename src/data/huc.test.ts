import { describe, expect, it } from "vitest";
import { rollupByHuc, type HucMember } from "./huc";

function member(over: Partial<HucMember> & { name: string }): HucMember {
  return { current_storage_af: 0, record_max_af: 0, ...over };
}

describe("rollupByHuc", () => {
  it("weights by capacity, not by reservoir count", () => {
    const [unit] = rollupByHuc([
      member({ name: "Big", huc6: "140100", huc6_name: "Colorado Headwaters", current_storage_af: 500_000, capacity_af: 1_000_000 }),
      member({ name: "Small", huc6: "140100", current_storage_af: 100, capacity_af: 100 })
    ]);
    // Naive averaging of 50% and 100% would say 75%.
    expect(unit?.percentFull).toBeCloseTo(500_100 / 1_000_100 * 100, 10);
    expect(unit?.count).toBe(2);
    expect(unit?.name).toBe("Colorado Headwaters");
  });

  it("falls back to the highest recorded storage when capacity is missing", () => {
    const [unit] = rollupByHuc([
      member({ name: "No capacity", huc6: "160202", current_storage_af: 40, capacity_af: null, record_max_af: 100 })
    ]);
    expect(unit?.capacityAf).toBe(100);
    expect(unit?.percentFull).toBe(40);
    expect(unit?.withoutCapacity).toBe(0);
  });

  it("counts a site with no denominator at all instead of dividing by zero", () => {
    const [unit] = rollupByHuc([
      member({ name: "Unknown", huc6: "160202", current_storage_af: 0, capacity_af: null, record_max_af: 0 })
    ]);
    expect(unit?.percentFull).toBeNull();
    expect(unit?.withoutCapacity).toBe(1);
    expect(unit?.count).toBe(1);
  });

  it("removes a duplicate site rather than counting its water twice", () => {
    const [unit] = rollupByHuc([
      member({ name: "Flaming Gorge", huc6: "140401", current_storage_af: 100, capacity_af: 200 }),
      member({ name: " flaming gorge ", huc6: "140401", current_storage_af: 100, capacity_af: 200 })
    ]);
    expect(unit?.count).toBe(1);
    expect(unit?.storageAf).toBe(100);
    expect(unit?.capacityAf).toBe(200);
  });

  it("leaves unassigned sites out of every unit", () => {
    const units = rollupByHuc([
      member({ name: "Assigned", huc6: "140100", current_storage_af: 1, capacity_af: 2 }),
      member({ name: "Unassigned", huc6: null, current_storage_af: 9, capacity_af: 9 }),
      member({ name: "Blank", current_storage_af: 9, capacity_af: 9 })
    ]);
    expect(units).toHaveLength(1);
    expect(units[0]?.storageAf).toBe(1);
  });

  it("orders units by combined capacity, largest first", () => {
    const units = rollupByHuc([
      member({ name: "Little", huc6: "160202", current_storage_af: 1, capacity_af: 10 }),
      member({ name: "Large", huc6: "140700", current_storage_af: 1, capacity_af: 1000 })
    ]);
    expect(units.map((unit) => unit.huc6)).toEqual(["140700", "160202"]);
  });
});
