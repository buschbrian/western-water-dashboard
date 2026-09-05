import { describe, expect, it } from "vitest";
import { capacityOn, sizeBasisOn } from "./capacity";
import { capacitySource } from "./export";
import { monthPercent } from "./months";
import { readPayload } from "./payload-fixture";
import { validateReservoirPayload } from "./validate";

function datedPayload() {
  const payload = structuredClone(readPayload());
  const reservoir = payload.reservoirs[0]!;
  reservoir.first_obs = "2026-01-01";
  reservoir.as_of = "2026-09-04";
  reservoir.capacity_af = 100;
  reservoir.capacity_basis = "operating_restriction";
  reservoir.current_storage_af = 50;
  reservoir.pct_of_capacity = 50;
  reservoir.physical_capacity_af = 200;
  reservoir.capacity_history = [
    { capacity_af: 100, capacity_basis: "operating_restriction",
      effective_from: "2026-01-01", authority: "Authority A",
      source_url: "https://example.gov/earlier", source_checked: "2026-09-04" },
    { capacity_af: 50, capacity_basis: "operating_restriction",
      effective_from: "2026-09-20", authority: "Authority B",
      source_url: "https://example.gov/later", source_checked: "2026-09-04" }
  ];
  reservoir.monthly = [{ month: "2026-09", mean_af: 50, end_af: 50,
    min_af: 50, max_af: 50, normal_af: null, days: 4 }];
  return { payload, reservoir };
}

describe("dated capacity publication contract", () => {
  it("does not invent a denominator before the first known version", () => {
    const { reservoir } = datedPayload();
    expect(capacityOn(reservoir, "2025-12-31")).toBeNull();
    expect(sizeBasisOn(reservoir, "2025-12-31")).toBeNull();
  });

  it("uses the observation's authority even when a later version is known", () => {
    expect(capacitySource(datedPayload().reservoir)).toContain("Authority A");
  });

  it("does not use a future limit for the current partial month", () => {
    expect(monthPercent(datedPayload().reservoir, "2026-09")).toBe(50);
  });

  it("accepts dated observations and a reviewed future version", () => {
    expect(() => validateReservoirPayload(datedPayload().payload)).not.toThrow();
  });

  it.each(["not-a-date", "2026-02-30", "20260920"])("rejects invalid date %s", (date) => {
    const { payload, reservoir } = datedPayload();
    reservoir.capacity_history![1]!.effective_from = date;
    expect(() => validateReservoirPayload(payload)).toThrow(/Invalid reservoir/);
  });

  it("rejects unordered intervals and a contradictory end date", () => {
    const { payload, reservoir } = datedPayload();
    reservoir.capacity_history!.reverse();
    expect(() => validateReservoirPayload(payload)).toThrow(/Invalid reservoir/);
    reservoir.capacity_history!.reverse();
    reservoir.capacity_history![0]!.effective_to = "2026-09-18";
    expect(() => validateReservoirPayload(payload)).toThrow(/Invalid reservoir/);
  });

  it("rejects a current number or authority without matching evidence", () => {
    const { payload, reservoir } = datedPayload();
    reservoir.capacity_af = 50;
    expect(() => validateReservoirPayload(payload)).toThrow(/Invalid reservoir/);
    reservoir.capacity_af = 100;
    delete reservoir.capacity_history![0]!.authority;
    expect(() => validateReservoirPayload(payload)).toThrow(/Invalid reservoir/);
  });
});
