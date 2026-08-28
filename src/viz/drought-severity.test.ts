import { describe, expect, it } from "vitest";

import { severityAxisScale } from "./drought-severity";

/* The ladder `severityAxisScale` picks from, mirrored here so a test failure
 * names the contract rather than reaching into the module's privates. */
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const MOST_TICKS = 8;

describe("severityAxisScale", () => {
  it("keeps a tick for every area while the areas are few", () => {
    expect(severityAxisScale(3)).toEqual({ top: 3, step: 1 });
    expect(severityAxisScale(8)).toEqual({ top: 8, step: 1 });
  });

  /* The defect this ladder exists for: 23 basins at their worst class drew
   * 24 labels into 152 pixels of axis, and 562 subbasins drew 153. */
  it("keeps the label count bounded however many areas are in view", () => {
    for (const highest of [1, 6, 14, 23, 47, 75, 152, 380, 562, 4000]) {
      const { top, step } = severityAxisScale(highest);
      expect(STEPS, `step for ${highest}`).toContain(step);
      expect(top / step, `ticks for ${highest}`).toBeLessThanOrEqual(MOST_TICKS);
    }
  });

  it("never crops the tallest bar, and ends on a drawn gridline", () => {
    for (const highest of [1, 3, 23, 75, 152, 562]) {
      const { top, step } = severityAxisScale(highest);
      expect(top, `top for ${highest}`).toBeGreaterThanOrEqual(highest);
      expect(top % step, `top lands on a tick for ${highest}`).toBe(0);
    }
  });

  it("counts in whole areas at every size", () => {
    for (const highest of [23, 152, 562]) {
      expect(Number.isInteger(severityAxisScale(highest).step)).toBe(true);
      expect(Number.isInteger(severityAxisScale(highest).top)).toBe(true);
    }
  });

  it("draws an axis for a week when no area is at any class", () => {
    expect(severityAxisScale(0)).toEqual({ top: 1, step: 1 });
  });
});
