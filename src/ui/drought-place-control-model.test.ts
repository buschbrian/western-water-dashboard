import { describe, expect, it } from "vitest";
import type { OpeningRosters, OpeningSelection } from "../data/opening-scope";
import {
  droughtCountyAxis,
  droughtDrainageAxis,
  selectionForDroughtArea,
  selectionForDroughtState
} from "./drought-place-control-model";

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
  subbasins: [
    { huc6: "16020201", name: "Utah Lake", states: "UT" },
    { huc6: "16020301", name: "Farmington Bay", states: "UT" }
  ]
};

const utah: OpeningSelection = { state: "UT", area: null };

describe("drought's sequential place controls", () => {
  it("offers only the tier chosen by Area size", () => {
    expect(droughtDrainageAxis(rosters, utah, 2).options.map((option) => option.value))
      .toEqual(["all", "14", "16"]);
    expect(droughtDrainageAxis(rosters, utah, 4).options.map((option) => option.value))
      .toEqual(["all", "1602"]);
    expect(droughtDrainageAxis(rosters, utah, 6).options.map((option) => option.value))
      .toEqual(["all", "160202", "160203"]);
    expect(droughtDrainageAxis(rosters, utah, 8).options.map((option) => option.value))
      .toEqual(["all", "16020201", "16020301"]);
  });

  it("narrows the offered tier to drainage areas intersecting the county", () => {
    const view = droughtDrainageAxis(rosters, utah, 6, new Set(["160202"]));
    expect(view.options).toEqual([
      { value: "all", label: "All basins" },
      { value: "160202", label: "Jordan" }
    ]);
  });

  it("clears a finer place when state or hydrologic tier changes", () => {
    expect(selectionForDroughtState("CO")).toEqual({ state: "CO", area: null });
    expect(selectionForDroughtArea({ state: "UT", area: "1602" }, "160202"))
      .toEqual({ state: "UT", area: "160202" });
    expect(selectionForDroughtArea({ state: "UT", area: "160202" }, "all"))
      .toEqual(utah);
  });

  it("offers a chosen state's counties in their own second control", () => {
    const counties = [
      { fips: "49049", name: "Utah County", state: "UT" },
      { fips: "49051", name: "Wasatch County", state: "UT" }
    ];
    expect(droughtCountyAxis(counties, "49051")).toEqual({
      value: "49051",
      options: [
        { value: "all", label: "All counties" },
        { value: "49049", label: "Utah County" },
        { value: "49051", label: "Wasatch County" }
      ]
    });
  });
});
