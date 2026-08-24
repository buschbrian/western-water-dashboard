import { describe, expect, it } from "vitest";
import type { OpeningRosters, OpeningSelection } from "../data/opening-scope";
import {
  selectionForStorageArea,
  selectionForStorageState,
  storageCountyAxis,
  storageDrainageAxis
} from "./storage-place-control-model";

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

describe("Storage's sequential place controls", () => {
  it("offers only the chosen tier with published reservoirs behind it", () => {
    expect(storageDrainageAxis(rosters, utah, 2, new Set(["16"]))
      .options.map((option) => option.value)).toEqual(["all", "16"]);
    expect(storageDrainageAxis(rosters, utah, 4, new Set(["1602"]))
      .options.map((option) => option.value)).toEqual(["all", "1602"]);
    expect(storageDrainageAxis(rosters, utah, 6, new Set(["160202"]))
      .options.map((option) => option.value)).toEqual(["all", "160202"]);
  });

  it("shows a coarser saved filter as all at the exact drawn tier", () => {
    const axis = storageDrainageAxis(
      rosters, { state: "UT", area: "1602" }, 6,
      new Set(["160202", "160203"]));
    expect(axis.value).toBe("all");
    expect(axis.options.slice(1).every((option) => option.value.length === 6)).toBe(true);
  });

  it("clears the area after state or area-size changes", () => {
    expect(selectionForStorageState("CO")).toEqual({ state: "CO", area: null });
    expect(selectionForStorageArea({ state: "UT", area: "1602" }, "160202"))
      .toEqual({ state: "UT", area: "160202" });
    expect(selectionForStorageArea({ state: "UT", area: "160202" }, "all"))
      .toEqual(utah);
  });

  it("offers the chosen state's reviewed counties in a separate control", () => {
    const counties = [
      { fips: "49049", name: "Utah County" },
      { fips: "49051", name: "Wasatch County" }
    ];
    expect(storageCountyAxis(counties, "49051")).toEqual({
      value: "49051",
      options: [
        { value: "all", label: "All counties" },
        { value: "49049", label: "Utah County" },
        { value: "49051", label: "Wasatch County" }
      ]
    });
  });
});
