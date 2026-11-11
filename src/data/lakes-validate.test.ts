import { describe, expect, it } from "vitest";

import { validateLakePayload } from "./lakes-validate";

function measurement(current: number, extra: Record<string, unknown> = {}) {
  return {
    current, as_of: "2026-09-05",
    record_high: current + 10, record_high_date: "2019-05-03",
    record_low: current - 10, record_low_date: "2016-11-02",
    first_obs: "2015-01-01", n_obs: 4200,
    change_7d: -0.1, change_7d_reference_date: "2026-08-29", change_7d_elapsed_days: 7,
    change_30d: -0.4, change_30d_reference_date: "2026-08-06", change_30d_elapsed_days: 30,
    change_365d: 1.2, change_365d_reference_date: "2025-09-05", change_365d_elapsed_days: 365,
    seasonal_rank: 3, seasonal_rank_of: 12,
    parameter_code: "00062", statistic_id: "32400",
    ...extra
  };
}

export function lake(overrides: Record<string, unknown> = {}) {
  return {
    name: "Walker Lake", water_type: "natural_terminal_lake",
    source_key: "usgs", source_label: "U.S. Geological Survey",
    source_url: "https://api.waterdata.usgs.gov/ogcapi/v0/collections/daily/items",
    source_station_id: "10288500", state: "NV", lat: 38.67, lon: -118.77,
    data_frequency: "daily", stale_after_days: 2,
    as_of: "2026-09-05", days_stale: 1, is_stale: false, fetch_ok: true,
    elevation: measurement(3914.96, { unit: "ft", vertical_datum: "NGVD29" }),
    volume: measurement(1153000, {
      unit: "acre_feet", parameter_code: "00054",
      relation: { name: "Lopes and Smith (2007)", source_url: "https://doi.org/10.3133/sir20075012",
        in_use_from: "2014-10-01" },
      change_7d: -1200, change_30d: -5500, change_365d: 24000,
      change_7d_pct: -0.1, change_30d_pct: -0.5, change_365d_pct: 2.1,
      monthly: [{ month: "2026-08", mean_af: 1160000, min_af: 1150000, max_af: 1170000,
        end_af: 1153000, days: 31, normal_af: 1100000, normal_years: 10 }]
    }),
    arms: [], targets: [], first_obs: "2015-01-01", years_of_record: 11.7,
    huc6: "160503", huc6_name: "Walker", huc8: "16050304", huc8_name: "Walker Lake",
    ...overrides
  };
}

/** A lake measured by arm, with a level and no volume at each arm (ADR-159). */
export function armedLake(overrides: Record<string, unknown> = {}) {
  const arm = (name: string, station: string, current: number) => ({
    name, source_station_id: station, lat: 41, lon: -112.4,
    elevation: measurement(current, { unit: "ft", vertical_datum: "NGVD29",
      parameter_code: "62614", statistic_id: "00003" }),
    volume: null, first_obs: "2015-01-01"
  });
  return lake({
    name: "Great Salt Lake", state: "UT", source_station_id: null, lat: null, lon: null,
    elevation: null, volume: null,
    arms: [arm("South Arm", "10010000", 4191.2), arm("North Arm", "10010100", 4189.9)],
    huc6: "160203", huc6_name: "Great Salt Lake", huc8: "16020310",
    huc8_name: "Great Salt Lake",
    ...overrides
  });
}

export function target(overrides: Record<string, unknown> = {}) {
  return {
    name: "Long-term management level",
    authority: "State Water Resources Control Board", decision: "Decision 1631",
    source_url: "https://example.test/decision", set_on: "1994-09-28",
    vertical_datum: "NGVD29", elevation_ft: 6392,
    ...overrides
  };
}

export function payload(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 2, method_version: "m", water_type: "natural_terminal_lake",
    fetched_at: "2026-09-06T12:00:00+00:00", run_date: "2026-09-06",
    stale_after_days: 2, withdraw_after_days: 60,
    lake_count: 1, stale_count: 0, withdrawn_count: 0,
    lakes: [lake()], withdrawn: [],
    ...overrides
  };
}

describe("the lake payload validator", () => {
  it("accepts the pipeline's shape", () => {
    const valid = validateLakePayload(payload());
    expect(valid.lakes[0]!.elevation?.vertical_datum).toBe("NGVD29");
    expect(valid.lakes[0]!.volume?.relation.source_url).toContain("doi.org");
  });

  it("refuses a full level on a lake", () => {
    expect(() => validateLakePayload(payload({ lakes: [lake({ capacity_af: 1 })] })))
      .toThrow(/no full level/);
    expect(() => validateLakePayload(payload({ lakes: [lake({ pct_of_capacity: 50 })] })))
      .toThrow(/no full level/);
  });

  it("refuses a percentage change on a level", () => {
    const bad = lake();
    (bad.elevation as Record<string, unknown>).change_365d_pct = 1;
    expect(() => validateLakePayload(payload({ lakes: [bad] }))).toThrow(/elevation/);
  });

  it("refuses an elevation without its datum and a volume without its table", () => {
    const noDatum = lake();
    delete (noDatum.elevation as Record<string, unknown>).vertical_datum;
    expect(() => validateLakePayload(payload({ lakes: [noDatum] }))).toThrow(/elevation/);
    const noTable = lake();
    delete (noTable.volume as Record<string, unknown>).relation;
    expect(() => validateLakePayload(payload({ lakes: [noTable] }))).toThrow(/volume/);
  });

  it("refuses a target spelled as a capacity or a denominator", () => {
    for (const field of ["capacity_af", "pct_of_target", "percent", "share", "full_level"]) {
      expect(() => validateLakePayload(payload({
        lakes: [lake({ targets: [target({ [field]: 100 })] })]
      }))).toThrow(/target/);
    }
  });

  it("refuses a target without its decision, date or datum", () => {
    for (const field of ["decision", "set_on", "vertical_datum", "authority"]) {
      const bad: Record<string, unknown> = target();
      delete bad[field];
      expect(() => validateLakePayload(payload({ lakes: [lake({ targets: [bad] })] })))
        .toThrow(/target/);
    }
    expect(validateLakePayload(payload({ lakes: [lake({ targets: [target()] })] }))
      .lakes[0]!.targets[0]!.decision).toBe("Decision 1631");
  });

  it("refuses any field that divides by a target", () => {
    expect(() => validateLakePayload(payload({ lakes: [lake({ pct_of_target: 92 })] })))
      .toThrow(/denominator/);
    const bad = lake();
    (bad.elevation as Record<string, unknown>).share_of_target = 0.9;
    expect(() => validateLakePayload(payload({ lakes: [bad] }))).toThrow(/denominator/);
  });

  it("accepts a lake with a level and no volume", () => {
    const valid = validateLakePayload(payload({ lakes: [lake({ volume: null })] }));
    expect(valid.lakes[0]!.volume).toBeNull();
    expect(() => validateLakePayload(payload({ lakes: [lake({ elevation: null })] })))
      .toThrow(/elevation/);
  });

  it("accepts a lake measured by arm and refuses a combined level beside its arms", () => {
    const valid = validateLakePayload(payload({ lakes: [armedLake()] })).lakes[0]!;
    expect(valid.arms.map((arm) => arm.name)).toEqual(["South Arm", "North Arm"]);
    expect(valid.elevation).toBeNull();
    type Arm = { elevation: Record<string, unknown> };
    const armsOf = (value: { arms: unknown }): Arm[] => value.arms as Arm[];
    const combined = armedLake({ elevation: armsOf(armedLake())[0]!.elevation });
    expect(() => validateLakePayload(payload({ lakes: [combined] })))
      .toThrow(/no level, volume or point of its own/);
    expect(() => validateLakePayload(payload({ lakes: [armedLake({ lat: 41 })] })))
      .toThrow(/no level, volume or point of its own/);
    const noDatum = armedLake();
    delete armsOf(noDatum)[1]!.elevation.vertical_datum;
    expect(() => validateLakePayload(payload({ lakes: [noDatum] }))).toThrow(/North Arm/);
  });

  it("holds a target on a lake measured by arm to one of its arms", () => {
    expect(() => validateLakePayload(payload({ lakes: [armedLake({ targets: [target()] })] })))
      .toThrow(/names its arm/);
    expect(validateLakePayload(payload({
      lakes: [armedLake({ targets: [target({ arm: "South Arm" })] })]
    })).lakes[0]!.targets[0]!.arm).toBe("South Arm");
  });

  it("refuses a withdrawal notice carrying a measurement", () => {
    const notice = { name: "Walker Lake", as_of: "2026-06-01", days_stale: 97,
      source_label: "U.S. Geological Survey", reason: "quiet", elevation: { current: 1 } };
    expect(() => validateLakePayload(payload({
      lakes: [], lake_count: 0, withdrawn: [notice], withdrawn_count: 1
    }))).toThrow(/carries no measurement/);
  });

  it("holds the counts to the arrays", () => {
    expect(() => validateLakePayload(payload({ lake_count: 2 }))).toThrow(/lake_count/);
    expect(() => validateLakePayload(payload({ stale_count: 1 }))).toThrow(/stale_count/);
  });

  it("refuses another water type and another structure version", () => {
    expect(() => validateLakePayload(payload({ water_type: "reservoir" }))).toThrow(/water type/);
    expect(() => validateLakePayload(payload({ schema_version: 3 }))).toThrow(/version/);
  });

  it("reads the version written before ADR-159 as one with no arms", () => {
    const before: Record<string, unknown> = lake();
    delete before.arms;
    const valid = validateLakePayload(payload({ schema_version: 1, lakes: [before] }));
    expect(valid.lakes[0]!.arms).toEqual([]);
    expect(() => validateLakePayload(payload({ schema_version: 2, lakes: [before] })))
      .toThrow(/arms/);
  });
});
