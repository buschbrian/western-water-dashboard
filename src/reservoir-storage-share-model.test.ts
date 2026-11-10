import { describe, expect, it } from "vitest";
import { readPayload } from "./data/payload-fixture";
import { SITE_ADDRESS } from "./reservoir-share-model";
import { storageShareFrame } from "./reservoir-storage-share-model";
import type { BaselineChoice, Reservoir } from "./types";

const payload = readPayload();
const { elevation: _level, ...withoutLevel } = payload.reservoirs[0]!;
const base: Reservoir = {
  ...withoutLevel, name: "Testwater", source_key: "rise",
  current_storage_af: 500, capacity_af: 1000, pct_of_capacity: 50,
  capacity_basis: "max_storage", as_of: "2026-11-01", is_stale: false,
  baselines: {
    default: "climate", recent: null,
    climate: { normal_af: 625, pct_of_normal: 80, sample_years: 30,
      covers_full_period: true, first_obs: "1991-01-01" }
  }
};

const CHOICES: BaselineChoice[] = [
  { id: "recent", label: "Recent years", period_label: "2015 through 2025",
    start_year: 2015, end_year: 2025, note: "" },
  { id: "climate", label: "Standard climate period", period_label: "1991 through 2020",
    start_year: 1991, end_year: 2020, note: "" }
];

function frame(reservoir: Reservoir = base) {
  return storageShareFrame({
    reservoir, label: "Testwater, Utah", baseline: "climate",
    choices: CHOICES, minimumYears: 10
  });
}

describe("the storage share-frame model", () => {
  it("gives a reservoir without a level its stored water, dated reading and provider", () => {
    const result = frame()!;
    expect(result.name).toBe("Testwater, Utah");
    expect(result.storage).toBe("500 acre-feet");
    expect(result.full).toEqual({ percent: "50.0%", basis: "full (maximum level)" });
    expect(result.readingDate).toBe("Reading date: Nov 1, 2026");
    expect(result.source).toBe(`Readings: Bureau of Reclamation · ${SITE_ADDRESS}`);
    expect(result.late).toBeNull();
  });

  it("keeps the period and the years behind a normal with its percentage", () => {
    const comparison = frame()!.comparison;
    expect(comparison.label).toContain("1991 through 2020");
    expect(comparison.value).toContain("80.0%");
    expect(comparison.value).toContain("30 years of 1991 through 2020");
    expect(comparison.substituted).toBe(false);
    expect(frame()!.partialPeriod).toBeNull();
  });

  it("says when the normal draws on part of its period, without changing the years", () => {
    const result = frame({ ...base, baselines: {
      default: "climate", recent: null,
      climate: { ...base.baselines!.climate!, sample_years: 12,
        covers_full_period: false, first_obs: "2009-01-01" }
    } })!;
    expect(result.comparison.value).toContain("12 years of 1991 through 2020");
    expect(result.partialPeriod).toBe("This reservoir has readings for part of that period.");
  });

  it("names a substitute period when the requested period has too few years", () => {
    const comparison = frame({ ...base, baselines: {
      default: "climate", climate: { ...base.baselines!.climate!, sample_years: 2 },
      recent: { ...base.baselines!.climate!, sample_years: 11 }
    } })!.comparison;
    expect(comparison.substituted).toBe(true);
    expect(comparison.label).toContain("2015 through 2025");
    expect(comparison.value).toContain("too few years in 1991 through 2020");
  });

  it("keeps an absent normal explicit rather than guessing a percentage", () => {
    const comparison = frame({ ...base,
      baselines: { default: "climate", climate: null, recent: null }
    })!.comparison;
    expect(comparison.value).toBe("No earlier years to compare with.");
    expect(comparison.value).not.toContain("%");
  });

  it("carries missing months as gaps and a measured zero as a value", () => {
    const monthly = base.monthly.map((month, index) => ({ ...month,
      mean_af: index === 0 ? null : 0, days: index === 0 ? 0 : 1
    }));
    const months = frame({ ...base, monthly })!.months;
    expect(months).toHaveLength(monthly.length);
    expect(months[0]!.storageAf).toBeNull();
    expect(months[1]!.storageAf).toBe(0);
  });

  it("keeps the date and late-data note together", () => {
    const result = frame({ ...base, is_stale: true, days_stale: 17 })!;
    expect(result.late).toBe("This reading is late by 17 days.");
    expect(result.readingDate).toBe("Reading date: Nov 1, 2026");
  });

  it("names the highest-recorded-storage basis instead of a capacity", () => {
    const result = frame({ ...base, capacity_af: null,
      pct_of_capacity: null, pct_of_record_max: 75
    })!;
    expect(result.full).toEqual({ percent: "75.0%", basis: "full (highest recorded storage)" });
  });

  it("omits a percentage when no full level is available, but keeps measured storage", () => {
    const result = frame({ ...base, pct_of_capacity: null, pct_of_record_max: null })!;
    expect(result.full).toBeNull();
    expect(result.storage).toBe("500 acre-feet");
  });

  it("refuses a non-finite reading and accepts zero stored water", () => {
    expect(frame({ ...base, current_storage_af: Number.NaN })).toBeNull();
    expect(frame({ ...base, current_storage_af: Number.POSITIVE_INFINITY })).toBeNull();
    expect(frame({ ...base, current_storage_af: 0, pct_of_capacity: 0 })!.storage)
      .toBe("0 acre-feet");
  });
});
