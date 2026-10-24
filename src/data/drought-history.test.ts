import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDroughtHistory } from "./drought-history";

function week(mapDate: string, release: string | null, units = [
  { huc6: "160201", percent_of_area_at_least: { d0: 90, d1: 70, d2: 40, d3: 15, d4: 5 } }
]): Record<string, unknown> {
  return { map_date: mapDate, release_date: release, units };
}

function file(...weeks: Record<string, unknown>[]): Record<string, unknown> {
  return { schema_version: 1, level: 6, weeks };
}

describe("drought history", () => {
  it("lays the weeks on a calendar with a slot for every Tuesday", () => {
    const history = validateDroughtHistory(file(
      week("2026-09-22", null), week("2026-10-06", "2026-10-08")), 6);
    expect(history.dates).toEqual(["2026-09-22", "2026-09-29", "2026-10-06"]);
    expect(history.held).toEqual([true, false, true]);
    /* The week the file does not hold is a hole, never its neighbour. */
    expect(history.series.get("160201")?.[1]).toBeNull();
    expect(history.series.get("160201")?.[2]?.d1).toBe(70);
  });

  it("reads an area missing from a held week as no share, not zero", () => {
    const history = validateDroughtHistory(file(
      week("2026-09-29", "x"),
      week("2026-10-06", "x", [])), 6);
    expect(history.series.get("160201")).toEqual([
      { d0: 90, d1: 70, d2: 40, d3: 15, d4: 5 }, null]);
  });

  it("reads the skipped weeks the backfill names", () => {
    const raw = file(week("2026-09-22", null), week("2026-10-06", "x"));
    raw.backfill = { skipped: [{ map_date: "2026-09-29", reason: "no map" }] };
    expect(validateDroughtHistory(raw, 6).skipped).toEqual([
      { mapDate: "2026-09-29", reason: "no map" }]);
  });

  it.each([
    ["a week off the weekly schedule", file(week("2026-09-22", "x"), week("2026-09-30", "x"))],
    ["a repeated week", file(week("2026-09-22", "x"), week("2026-09-22", "x"))],
    ["weeks out of order", file(week("2026-09-29", "x"), week("2026-09-22", "x"))],
    ["a code at another level", file(week("2026-09-22", "x", [
      { huc6: "1602", percent_of_area_at_least: { d0: 1, d1: 1, d2: 1, d3: 1, d4: 1 } }]))],
    ["shares that grow as the class worsens", file(week("2026-09-22", "x", [
      { huc6: "160201", percent_of_area_at_least: { d0: 10, d1: 20, d2: 0, d3: 0, d4: 0 } }]))],
    ["no weeks", file()]
  ])("refuses %s", (_label, raw) => {
    expect(() => validateDroughtHistory(raw, 6)).toThrow();
  });

  it("refuses a file at another level than the one asked for", () => {
    expect(() => validateDroughtHistory(file(week("2026-09-22", "x")), 4)).toThrow("HUC-6");
  });

  it.each([2, 4, 6])("accepts the committed HUC-%i archive", async (level) => {
    const raw = JSON.parse(await readFile(
      resolve(process.cwd(), `data/drought/usdm-huc${level}-history.json`), "utf8")) as unknown;
    const history = validateDroughtHistory(raw, level);
    expect(history.dates.length).toBeGreaterThanOrEqual(history.held.filter(Boolean).length);
    expect(history.held[history.held.length - 1]).toBe(true);
  });
});
