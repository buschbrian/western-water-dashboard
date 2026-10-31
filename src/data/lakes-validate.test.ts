import { describe, expect, it } from "vitest";

import { lake, payload } from "./lake-fixture";
import { validateLakePayload } from "./lakes-validate";

describe("the lake payload validator", () => {
  it("accepts the pipeline's shape", () => {
    const valid = validateLakePayload(payload());
    expect(valid.lakes[0]!.elevation.vertical_datum).toBe("NGVD29");
    expect(valid.lakes[0]!.volume.relation.source_url).toContain("doi.org");
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

  it("refuses a target spelled as a capacity", () => {
    const target = { name: "Restoration level", authority: "A board",
      source_url: "https://example.test", set_on: "2020-01-01", elevation_ft: 3950,
      capacity_af: 100 };
    expect(() => validateLakePayload(payload({ lakes: [lake({ targets: [target] })] })))
      .toThrow(/target/);
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
    expect(() => validateLakePayload(payload({ schema_version: 2 }))).toThrow(/version/);
  });
});
