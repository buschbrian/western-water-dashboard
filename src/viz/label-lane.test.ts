import { describe, expect, it } from "vitest";

import { labelLane, NAME_GAP } from "./label-lane";

const BASE = 162;
/* What the drought charts pass: the chart's width, less its right padding,
 * less the narrowest data lane they are willing to draw. */
const room = (chartWidth: number): number => chartWidth - 18 - 80;

describe("labelLane", () => {
  it("keeps the chart's own floor when every name fits inside it", () => {
    // "Escalante Desert-Sevier Lake", the widest HUC-6 name, is 137.
    expect(labelLane(137, room(1217), BASE)).toBe(BASE);
  });

  /* The defect this exists for: at a 162 lane "Klamath-Northern California
   * Coastal" began 21 pixels off the left edge and lost its first syllable. */
  it("widens for a name the floor cannot hold", () => {
    const lane = labelLane(173, room(1217), BASE);
    expect(lane).toBe(173 + NAME_GAP);
    expect(lane).toBeGreaterThan(BASE);
  });

  it("widens on a phone too, while the plot keeps its floor", () => {
    const chart = 316;
    const lane = labelLane(173, room(chart), BASE);
    expect(lane).toBe(173 + NAME_GAP);
    expect(chart - lane - 18).toBeGreaterThanOrEqual(80);
  });

  it("never squeezes the plot below the width the chart reserves", () => {
    const chart = 400;
    const lane = labelLane(900, room(chart), BASE);
    expect(lane).toBe(room(chart));
    expect(chart - lane - 18).toBe(80);
  });

  it("never takes back room the chart already had", () => {
    // At its minimum width the room available equals the floor exactly.
    expect(labelLane(173, room(BASE + 18 + 80), BASE)).toBe(BASE);
    expect(labelLane(60, room(316), BASE)).toBe(BASE);
  });

  it("falls back to the floor when nothing could be measured", () => {
    expect(labelLane(0, room(1217), BASE)).toBe(BASE);
    expect(labelLane(Number.NaN, room(1217), BASE)).toBe(BASE);
    expect(labelLane(-5, room(1217), BASE)).toBe(BASE);
  });
});
