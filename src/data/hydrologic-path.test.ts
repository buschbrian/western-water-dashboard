import { describe, expect, it } from "vitest";
import { hydrologicPath } from "./hydrologic-path";

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
