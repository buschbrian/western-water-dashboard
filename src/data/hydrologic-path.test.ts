import { describe, expect, it } from "vitest";
import { hydrologicPath, referenceRosters } from "./hydrologic-path";

const ROSTERS = {
  regions: [{ huc2: "14", name: "Upper Colorado Region" }],
  subregions: [{ huc4: "1401", name: "Colorado Headwaters" }]
};

describe("hydrologic path", () => {
  it("derives every parent code and takes names from the payload rosters", () => {
    expect(hydrologicPath("140100", "Colorado Headwaters", ROSTERS)).toEqual([
      { level: 2, label: "Region", code: "14", name: "Upper Colorado Region" },
      { level: 4, label: "Subregion", code: "1401", name: "Colorado Headwaters" },
      { level: 6, label: "Basin", code: "140100", name: "Colorado Headwaters" }
    ]);
  });

  it("keeps codes and leaves names missing when an older payload has no roster", () => {
    expect(hydrologicPath("160202", null, undefined)).toEqual([
      { level: 2, label: "Region", code: "16", name: null },
      { level: 4, label: "Subregion", code: "1602", name: null },
      { level: 6, label: "Basin", code: "160202", name: null }
    ]);
  });

  it("refuses malformed and non-basin codes instead of making a plausible path", () => {
    expect(hydrologicPath("1401", "Colorado Headwaters", ROSTERS)).toEqual([]);
    expect(hydrologicPath("14010x", "Colorado Headwaters", ROSTERS)).toEqual([]);
    expect(hydrologicPath(null, null, ROSTERS)).toEqual([]);
  });
});

describe("the subbasin part (ADR-103)", () => {
  it("adds a fourth part when the record carries a subbasin inside its basin", () => {
    const rosters = { ...ROSTERS, subbasins: [{ huc8: "14010001", name: "Colorado Headwaters" }] };
    const path = hydrologicPath("140100", "Colorado Headwaters", rosters, "14010001", null);
    expect(path[3]).toEqual(
      { level: 8, label: "Subbasin", code: "14010001", name: "Colorado Headwaters" });
    expect(hydrologicPath("140100", null, undefined, "14010001", "Blue")[3]?.name).toBe("Blue");
  });

  it("refuses a subbasin that is not inside the basin, or is malformed", () => {
    expect(hydrologicPath("140100", null, ROSTERS, "14020001", null)).toHaveLength(3);
    expect(hydrologicPath("140100", null, ROSTERS, "1401000", null)).toHaveLength(3);
    expect(hydrologicPath("140100", null, ROSTERS, null, null)).toHaveLength(3);
  });
});

describe("rosters read from the reference export", () => {
  const reference = {
    schema_version: 4,
    geography: { watersheds: {
      default_scope: "west-huc6",
      drawn_scopes: { "2": "west-huc2", "4": "west-huc4", "6": "west-huc6", "8": "west-huc8" },
      scopes: {
        "west-huc2": { level: 2, units: [{ huc2: "16", name: "Great Basin", states: "NV,UT" }] },
        "west-huc4": { level: 4, units: [{ huc4: "1605", name: "Central Lahontan", states: "NV,CA" }] },
        "west-huc6": { level: 6, units: [{ huc6: "160503", name: "Walker", states: "NV,CA" }] },
        "west-huc8": { level: 8, units: [{ huc8: "16050304", name: "Walker Lake", states: "NV" }] }
      }
    } }
  };

  it("names every level of a path from the export's own scopes", () => {
    const rosters = referenceRosters(reference);
    const path = hydrologicPath("160503", "Walker", rosters, "16050304", null);
    expect(path.map((part) => part.name))
      .toEqual(["Great Basin", "Central Lahontan", "Walker", "Walker Lake"]);
  });

  it("yields empty rosters, not an error, for an export it cannot read", () => {
    expect(referenceRosters(null)).toEqual({ regions: [], subregions: [], subbasins: [] });
    expect(referenceRosters({ schema_version: 99 }).regions).toEqual([]);
  });
});
