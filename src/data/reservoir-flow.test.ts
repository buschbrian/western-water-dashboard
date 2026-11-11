import { readFileSync } from "node:fs";
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
  it("accepts every item on the reviewed roster, so a roster edit cannot refuse the payload", () => {
    /* The roster is reviewed by hand, not daily data. An item added or
     * changed there must be accepted here before the refresh publishes it. */
    const roster = JSON.parse(readFileSync("admitted_reservoir_flows.json", "utf8")) as {
      reservoirs: Record<string, Record<string, unknown> & { inflow_unavailable?: string; inflow_review_url?: string }> };
    for (const [station, row] of Object.entries(roster.reservoirs)) {
      const block = (measure: "inflow" | "release") => {
        const item = row[measure] as { item_id: number; source_url: string; definition: string; definition_url: string } | null | undefined;
        return item ? { current: 1, as_of: "2026-11-10", source_item_id: item.item_id, source_url: item.source_url,
          definition: item.definition, definition_url: item.definition_url } : null;
      };
      const flow = { unit: "ft^3/s", inflow: block("inflow"), release: block("release"),
        inflow_unavailable: row.inflow_unavailable ?? null, inflow_review_url: row.inflow_review_url ?? null };
      expect(isReservoirWaterFlow(flow, station), station).toBe(true);
    }
  });
});
