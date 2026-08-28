import { describe, expect, it } from "vitest";

import { monthLabelStep } from "./trend";

/* Plot widths the two callers actually produce: the storage details panel is
 * narrow, the reservoir page is roughly twice as wide. Both are the chart
 * width less its 38 and 6 unit padding. */
const PANEL_PLOT = 300 - 38 - 6;
const PAGE_PLOT = 696 - 38 - 6;
const PHONE_PLOT = 358 - 38 - 6;

describe("monthLabelStep", () => {
  /* The defect this exists for: a fixed every-third-month rule, written when
   * the chart only drew at about 300 pixels, kept dropping seven of twelve
   * labels on a card wide enough for all of them. */
  it("labels every month when the card is wide enough", () => {
    expect(monthLabelStep(12, PAGE_PLOT)).toBe(1);
  });

  it("still thins where the labels would collide", () => {
    expect(monthLabelStep(12, PANEL_PLOT)).toBeGreaterThan(1);
    expect(monthLabelStep(12, PHONE_PLOT)).toBeGreaterThan(1);
  });

  it("never lets the labels it keeps overrun the plot", () => {
    for (const months of [1, 2, 5, 12, 24, 36]) {
      for (const width of [120, 200, PANEL_PLOT, PHONE_PLOT, PAGE_PLOT, 1400]) {
        const step = monthLabelStep(months, width);
        expect(step, `step for ${months} in ${width}`).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(step)).toBe(true);
        const drawn = Math.ceil(months / step);
        // Either they fit, or nothing would and only one label survives.
        expect(drawn === 1 || drawn * 40 <= width,
          `${drawn} labels of 40 units in ${width}`).toBe(true);
      }
    }
  });

  it("always keeps the newest month, whatever the step", () => {
    for (const months of [1, 5, 12, 24]) {
      for (const width of [120, PANEL_PLOT, PAGE_PLOT]) {
        const step = monthLabelStep(months, width);
        const kept = [...Array(months).keys()]
          .filter((index) => (months - 1 - index) % step === 0);
        expect(kept, `newest kept for ${months} in ${width}`).toContain(months - 1);
      }
    }
  });

  it("answers for a chart with no months at all", () => {
    expect(monthLabelStep(0, PAGE_PLOT)).toBe(1);
  });
});
