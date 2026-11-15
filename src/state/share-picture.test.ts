import { describe, expect, it } from "vitest";
import { scopePictureSlug, type ScopeView } from "./share-picture";

const west: ScopeView = {
  state: "all", area: null, county: "all", query: "", cadence: "all",
  storageClass: null, lakePowell: true, lakeMead: true
};

describe("the storage charts page's share picture", () => {
  it("names the picture for the West, a state or a two-digit region", () => {
    expect(scopePictureSlug(west)).toBe("west");
    expect(scopePictureSlug({ ...west, state: "UT" })).toBe("state-ut");
    expect(scopePictureSlug({ ...west, area: "14" })).toBe("region-14");
  });

  it("offers none when the view holds figures the picture does not", () => {
    expect(scopePictureSlug({ ...west, lakePowell: false })).toBeNull();
    expect(scopePictureSlug({ ...west, lakeMead: false })).toBeNull();
    expect(scopePictureSlug({ ...west, county: "49043" })).toBeNull();
    expect(scopePictureSlug({ ...west, query: "Strawberry" })).toBeNull();
    expect(scopePictureSlug({ ...west, cadence: "daily" })).toBeNull();
    expect(scopePictureSlug({ ...west, storageClass: 2 })).toBeNull();
    expect(scopePictureSlug({ ...west, area: "1401" })).toBeNull();
    expect(scopePictureSlug({ ...west, state: "UT", area: "14" })).toBeNull();
    expect(scopePictureSlug({ ...west, state: "TX" })).toBeNull();
  });
});
