import { describe, expect, it } from "vitest";
import type { BandStep } from "../precip-model";
import { regionOf, stackRows } from "./precip-strip";

describe("the same-date strip", () => {
  it("stacks only dots that would overlap, in value order", () => {
    expect(stackRows([10, 30, 50], 11)).toEqual([0, 0, 0]);
    expect(stackRows([10, 15, 18, 40], 11)).toEqual([0, 1, 2, 0]);
    // Order of input does not change which dot goes where.
    expect(stackRows([18, 10, 15], 11)).toEqual([2, 0, 1]);
  });

  it("colours a year by the chart region it falls in", () => {
    const band: BandStep = {
      date: "2026-10-23", lowest: 0, low10: 1, low25: 2, median: 3, high75: 4, high90: 5, highest: 6
    };
    expect(regionOf(0.5, band).className).toBe("precip-region-driest");
    expect(regionOf(1.5, band).className).toBe("precip-region-drier");
    expect(regionOf(3, band).className).toBe("precip-region-middle");
    expect(regionOf(4.5, band).className).toBe("precip-region-wetter");
    expect(regionOf(6, band).className).toBe("precip-region-wettest");
  });
});
