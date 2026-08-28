import { describe, expect, it } from "vitest";
import { coordinateText } from "./coordinates";

describe("coordinate text", () => {
  it("formats a western point in decimal degrees and DMS", () => {
    expect(coordinateText(37.05778, -111.30332)).toEqual({
      decimal: "37.05778° N, 111.30332° W",
      dms: "37° 3′ 28.0″ N, 111° 18′ 12.0″ W",
      copy: "37.05778, -111.30332"
    });
  });

  it("carries rounded seconds into the next minute", () => {
    expect(coordinateText(12.999999, 0)?.dms)
      .toBe("13° 0′ 0.0″ N, 0° 0′ 0.0″ E");
  });

  it("uses southern and eastern directions", () => {
    expect(coordinateText(-33.5, 151.25)?.decimal)
      .toBe("33.50000° S, 151.25000° E");
  });

  it("refuses values outside WGS84 bounds and non-finite values", () => {
    expect(coordinateText(91, 0)).toBeNull();
    expect(coordinateText(0, -181)).toBeNull();
    expect(coordinateText(Number.NaN, 0)).toBeNull();
  });
});
