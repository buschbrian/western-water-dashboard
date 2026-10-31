import { describe, expect, it } from "vitest";
import { syntheticElevation } from "./data/elevation-fixture";
import { readPayload } from "./data/payload-fixture";
import { elevationChart } from "./reservoir-elevation-model";
import { isShareView, shareFrame } from "./reservoir-share-model";
import type { ElevationHistoryEntry, Reservoir } from "./types";

const reservoir: Reservoir = {
  ...readPayload().reservoirs[0]!, name: "Testwater", elevation: syntheticElevation()
};

/* Two synthetic water years ending on the reading date. */
function history(): ElevationHistoryEntry {
  const start = "2025-10-01";
  const first = Date.parse(`${start}T00:00:00Z`) / 86_400_000;
  const days = 400;
  const values = Array.from({ length: days }, (_, index) =>
    3500 + 10 * Math.sin((index / 365) * 2 * Math.PI));
  const end = new Date((first + days - 1) * 86_400_000).toISOString().slice(0, 10);
  return { name: "Testwater", source_station_id: "1", source_item_id: 2,
    vertical_datum: "NGVD29", start, end, values };
}

describe("the share view", () => {
  it("is asked for by view=share and by nothing else", () => {
    expect(isShareView("?name=Lake%20Powell&view=share")).toBe(true);
    expect(isShareView("?view=share")).toBe(true);
    expect(isShareView("?name=Lake%20Powell")).toBe(false);
    expect(isShareView("?name=Lake%20Powell&view=embed")).toBe(false);
    expect(isShareView("")).toBe(false);
  });
});

describe("the share frame", () => {
  const chart = elevationChart(reservoir, history())!;

  it("says the name, the level with its datum, the reading date and how to read the chart", () => {
    const frame = shareFrame(reservoir, "Testwater", "2026-10-21T12:00:00Z", chart)!;
    expect(frame.name).toBe("Testwater");
    expect(frame.level).toBe("3,500.25 feet");
    expect(frame.basis).toBe("above the National Geodetic Vertical Datum of 1929");
    expect(frame.readingDate).toMatch(/^Reading date: [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    expect(frame.caption).toContain("one water year");
    expect(frame.caption).toContain(chart.lines[0]!.label);
  });

  it("uses no initials for a datum and no percent for a level", () => {
    const frame = shareFrame(reservoir, "Testwater", "2026-10-21T12:00:00Z", chart)!;
    const text = Object.values(frame).join(" ");
    expect(text).not.toMatch(/\bNGVD|\bNAVD|%/);
  });

  it("is absent for a reservoir with no reviewed level", () => {
    const { elevation: _drop, ...plain } = reservoir;
    expect(shareFrame(plain as Reservoir, "Testwater", "2026-10-21", chart)).toBeNull();
  });
});
