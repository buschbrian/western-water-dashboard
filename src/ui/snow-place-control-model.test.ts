import { describe, expect, it } from "vitest";
import type { OpeningRosters, OpeningSelection } from "../data/opening-scope";
import {
  selectionForSnowArea,
  selectionForSnowState,
  snowDrainageAxis
} from "./snow-place-control-model";

const rosters: OpeningRosters = {
  regions: [
    { huc6: "14", name: "Upper Colorado Region", states: "CO,UT" },
    { huc6: "16", name: "Great Basin Region", states: "ID,NV,UT" }
  ],
  subregions: [
    { huc6: "1401", name: "Colorado Headwaters", states: "CO" },
    { huc6: "1602", name: "Great Salt Lake", states: "ID,UT" }
  ],
  areas: [
    { huc6: "140100", name: "Colorado Headwaters", states: "CO" },
    { huc6: "160202", name: "Jordan", states: "UT" },
    { huc6: "160203", name: "Great Salt Lake", states: "UT" }
  ],
  subbasins: []
};

const utah: OpeningSelection = { state: "UT", area: null };

describe("Snowpack's sequential place controls", () => {
  it("offers only the chosen and measurable tier", () => {
    expect(snowDrainageAxis(rosters, utah, 2, new Set(["16"]))
      .options.map((option) => option.value)).toEqual(["all", "16"]);
    expect(snowDrainageAxis(rosters, utah, 4, new Set(["1602"]))
      .options.map((option) => option.value)).toEqual(["all", "1602"]);
    expect(snowDrainageAxis(rosters, utah, 6, new Set(["160202"]))
      .options.map((option) => option.value)).toEqual(["all", "160202"]);
  });

  it("clears a finer area after a new state and preserves state on an area pick", () => {
    expect(selectionForSnowState("CO")).toEqual({ state: "CO", area: null });
    expect(selectionForSnowArea(utah, "160202"))
      .toEqual({ state: "UT", area: "160202" });
    expect(selectionForSnowArea({ state: "UT", area: "160202" }, "all"))
      .toEqual(utah);
  });
});
