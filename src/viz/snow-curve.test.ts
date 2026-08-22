import { describe, expect, it } from "vitest";
import { snowAxisScale } from "./snow-curve";

/* The ladder `snowAxisScale` picks from, mirrored here so a test failure
 * names the contract rather than reaching into the module's privates. */
const STEPS = [25, 50, 100, 250, 500];

describe("snowAxisScale", () => {
  it("keeps the 150 floor for a season that stays under normal", () => {
    const { top } = snowAxisScale(68.9);
    expect(top).toBe(150);
  });

  it("extends for a genuinely big year, on the chosen step", () => {
    const max = 200;
    const { top, step } = snowAxisScale(max);
    expect(top).toBeGreaterThanOrEqual(max);
    expect(top % step).toBe(0);
    expect(STEPS).toContain(step);
  });

  it("keeps the gridline count bounded for a range of maxima", () => {
    /* Synthetic maxima spanning a plausible season and pathological autumn
     * outliers; asserted against structure, never today's data. */
    for (const max of [1, 25, 68.9, 100, 150, 200, 300, 500, 1283, 3500]) {
      const { top, step } = snowAxisScale(max);
      expect(top).toBeGreaterThanOrEqual(150);
      expect(top).toBeGreaterThanOrEqual(max);
      // Gridlines run from 0 to top inclusive; never more than about eight
      // while the range fits the ladder.
      expect(top / step).toBeLessThanOrEqual(8);
      expect(STEPS).toContain(step);
    }
  });

  it("uses the widest step once the range outruns the ladder", () => {
    /* Past the ladder the count grows again -- a curve that high is itself
     * the regression signal, and the denominator floor keeps one off the
     * page. */
    expect(snowAxisScale(5000).step).toBe(500);
  });
});
