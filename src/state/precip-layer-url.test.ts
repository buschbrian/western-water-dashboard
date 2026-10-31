import { describe, expect, it } from "vitest";
import { precipLayerFromSearch, precipLayerSearch } from "./precip-layer-url";

describe("the precipitation map's layer parameter (ADR-142)", () => {
  it("reads soil, and anything else as rain", () => {
    expect(precipLayerFromSearch("?area=140100&layer=soil")).toBe("soil");
    expect(precipLayerFromSearch("")).toBe("rain");
    expect(precipLayerFromSearch("?layer=rain")).toBe("rain");
    expect(precipLayerFromSearch("?layer=snow")).toBe("rain");
    expect(precipLayerFromSearch("?layer=")).toBe("rain");
    expect(precipLayerFromSearch("?layer=SOIL")).toBe("rain");
  });

  it("takes the last value when the parameter repeats", () => {
    expect(precipLayerFromSearch("?layer=rain&layer=soil")).toBe("soil");
    expect(precipLayerFromSearch("?layer=soil&layer=rain")).toBe("rain");
  });

  it("writes soil and omits rain, keeping every other parameter", () => {
    expect(precipLayerSearch("soil", "?state=UT&area=140100")).toBe("?state=UT&area=140100&layer=soil");
    expect(precipLayerSearch("soil", "")).toBe("?layer=soil");
    expect(precipLayerSearch("rain", "?state=UT&layer=soil&area=140100")).toBe("?state=UT&area=140100");
    expect(precipLayerSearch("rain", "?layer=soil")).toBe("");
    expect(precipLayerSearch("rain", "?state=UT")).toBe("?state=UT");
  });

  it("round-trips", () => {
    for (const mode of ["rain", "soil"] as const) {
      expect(precipLayerFromSearch(precipLayerSearch(mode, "?state=UT&area=140100"))).toBe(mode);
    }
  });
});
