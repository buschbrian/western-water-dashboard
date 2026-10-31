import { describe, expect, it } from "vitest";

import { armedLake, lake, payload, target } from "./lake-fixture";
import { validateLakePayload } from "./lakes-validate";

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
