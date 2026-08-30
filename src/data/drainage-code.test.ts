import { describe, expect, it } from "vitest";
import { drainageCodeAtLevel } from "./huc";

describe("a record's code at a drawn level (ADR-103)", () => {
  it("slices the basin code for every coarser level", () => {
    expect(drainageCodeAtLevel("140100", "14010001", 2)).toBe("14");
    expect(drainageCodeAtLevel("140100", "14010001", 4)).toBe("1401");
    expect(drainageCodeAtLevel("140100", null, 6)).toBe("140100");
  });

  it("reads the record's own subbasin for level 8 and never slices toward it", () => {
    expect(drainageCodeAtLevel("140100", "14010001", 8)).toBe("14010001");
    expect(drainageCodeAtLevel("140100", null, 8)).toBeNull();
    expect(drainageCodeAtLevel("140100", undefined, 8)).toBeNull();
    expect(drainageCodeAtLevel("140100", "140100", 8)).toBeNull();
  });

  it("answers null rather than a shorter code for a record with no basin", () => {
    expect(drainageCodeAtLevel(null, null, 4)).toBeNull();
    expect(drainageCodeAtLevel("14", null, 4)).toBeNull();
  });
});
