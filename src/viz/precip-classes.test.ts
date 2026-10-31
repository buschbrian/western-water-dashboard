import { describe, expect, it } from "vitest";
import { PRECIP_CLASSES, precipClassIndex } from "./precip-classes";
import { SNOW_CLASSES } from "./snow-classes";

/* ADR-131: the precipitation map speaks the snow map's colours, so blue is
 * wet on every map. A change here changes what a colour means. */
describe("precipitation classes", () => {
  it("uses the snow map's six colours in the same order", () => {
    expect(PRECIP_CLASSES.map((entry) => entry.color)).toEqual(SNOW_CLASSES.map((entry) => entry.color));
  });

  it("keeps one set of breaks, chained, with the top open", () => {
    expect(PRECIP_CLASSES.map((entry) => entry.min)).toEqual([0, 0.1, 0.25, 0.5, 1, 2]);
    PRECIP_CLASSES.slice(0, -1).forEach((entry, index) => expect(entry.max).toBe(PRECIP_CLASSES[index + 1]!.min));
    expect(PRECIP_CLASSES.at(-1)!.max).toBeNull();
    expect(PRECIP_CLASSES.map((entry) => entry.label)).toEqual([
      "Under 0.1 in", "0.1 to 0.25 in", "0.25 to 0.5 in", "0.5 to 1 in", "1 to 2 in", "2 in or more"
    ]);
  });

  it("puts a value in the class whose lower bound it reaches", () => {
    expect(precipClassIndex(0)).toBe(0);
    expect(precipClassIndex(0.1)).toBe(1);
    expect(precipClassIndex(0.2)).toBe(1);
    expect(precipClassIndex(1)).toBe(4);
    expect(precipClassIndex(12)).toBe(5);
  });

  it("gives no class to a missing or impossible value", () => {
    expect(precipClassIndex(null)).toBe(-1);
    expect(precipClassIndex(undefined)).toBe(-1);
    expect(precipClassIndex(-0.1)).toBe(-1);
    expect(precipClassIndex(Number.NaN)).toBe(-1);
  });
});
