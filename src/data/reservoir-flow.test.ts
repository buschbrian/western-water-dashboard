import { describe, expect, it } from "vitest";
import { isReservoirWaterFlow } from "./reservoir-flow";

const reading = { current: 100, as_of: "2026-11-10", source_item_id: 6125,
  source_url: "https://data.usbr.gov/catalog/4370/item/6125", definition: "Daily average total release.",
  definition_url: "https://data.usbr.gov/catalog/4370/item/6125" };
const mead = { unit: "ft^3/s", inflow: null, release: reading,
  inflow_unavailable: "No daily inflow series.", inflow_review_url: "https://data.usbr.gov/catalog/4370" };

describe("reviewed reservoir flows", () => {
  it("requires a reviewed item and an explicit Mead inflow gap", () => {
    expect(isReservoirWaterFlow(mead, "6124")).toBe(true);
    expect(isReservoirWaterFlow(mead, "other")).toBe(false);
    for (const patch of [{ unit: "acre-ft" }, { inflow: reading }, { inflow_unavailable: null },
      { release: { ...reading, source_item_id: 511 } }, { release: { ...reading, current: -1 } },
      { release: { ...reading, as_of: "2026-02-30" } }, { release: { ...reading, definition: "" } }]) {
      expect(isReservoirWaterFlow({ ...mead, ...patch }, "6124")).toBe(false);
    }
  });
});
