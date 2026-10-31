import { describe, expect, it } from "vitest";
import { precipMapValues } from "./precip-map-model";
import type { StormTotals } from "./precip-storm-model";

const totals: StormTotals = {
  endDate: "2026-10-24",
  windows: [
    { days: 1, startDate: "2026-10-23", available: true, totals: [], meanInches: null, withoutValue: 0, falling: 0 },
    {
      days: 3, startDate: "2026-10-21", available: true, meanInches: 1,
      totals: [
        { station: "a1", inches: 1.2 }, { station: "a2", inches: 0.5 },
        { station: "b1", inches: 2.4 }, { station: "x", inches: 9 }
      ],
      withoutValue: 1, falling: 0
    },
    { days: 7, startDate: "2026-10-17", available: false, totals: [], meanInches: null, withoutValue: 0, falling: 0 }
  ]
};
const siteAreas = new Map([["a1", "1401"], ["a2", "1401"], ["a3", "1401"], ["b1", "1402"]]);
const floors = new Map([["1401", 2], ["1402", 2], ["1403", 2]]);

describe("precipitation map values", () => {
  it("means an area's stations with a total, to a tenth", () => {
    const values = precipMapValues(3, totals, siteAreas, floors);
    expect(values.areas.get("1401")).toEqual({ meanInches: 0.9, stations: 2, floor: 2 });
  });

  it("gives an area below its floor no mean, and says how many it had", () => {
    const values = precipMapValues(3, totals, siteAreas, floors);
    expect(values.areas.get("1402")).toEqual({ meanInches: null, stations: 1, floor: 2 });
    expect(values.areas.get("1403")).toEqual({ meanInches: null, stations: 0, floor: 2 });
  });

  it("draws only the sites in the place, and none for a window not yet available", () => {
    expect([...precipMapValues(3, totals, siteAreas, floors).sites.keys()]).toEqual(["a1", "a2", "b1"]);
    expect(precipMapValues(7, totals, siteAreas, floors).sites.size).toBe(0);
    expect(precipMapValues(3, null, siteAreas, floors).endDate).toBeNull();
  });
});
