import { describe, expect, it } from "vitest";
import { dropsNeeded, flexibleHeight } from "./story-fit";

describe("fitting a story view to its frame (ADR-128)", () => {
  it("takes the fewest drops after which the content fits", () => {
    const heights = [900, 800, 700, 600];
    expect(dropsNeeded((count) => heights[count]!, 1000, 3)).toBe(0);
    expect(dropsNeeded((count) => heights[count]!, 750, 3)).toBe(2);
    expect(dropsNeeded((count) => heights[count]!, 700, 3)).toBe(2);
  });

  it("takes every drop when nothing fits, and the caller says so", () => {
    expect(dropsNeeded(() => 900, 400, 4)).toBe(4);
  });

  it("gives the room that is left to the chart, within its limits", () => {
    expect(flexibleHeight(160, 320, 0)).toBe(160);
    expect(flexibleHeight(160, 320, 75.8)).toBe(235);
    expect(flexibleHeight(160, 320, 900)).toBe(320);
    expect(flexibleHeight(160, 320, -40)).toBe(160);
  });
});
