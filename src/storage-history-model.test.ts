import { describe, expect, it } from "vitest";
import { mergeStorageHistory, validateStorageHistory, type StorageHistory } from "./data/storage-history";
import { storageHistoryCsv, storageYears } from "./storage-history-model";

function history(start: string, values: (number | null)[], cadence: "daily" | "monthly" = "daily"): StorageHistory {
  const end = new Date(Date.parse(start) + (values.length - 1) * 86400000).toISOString().slice(0, 10);
  return { source_station_id: "s", name: "Test", source_key: "rise", source_url: "https://example.org/",
    start, end, values, data_frequency: cadence };
}

describe("storage history contract", () => {
  it("refuses an identity, date, unit or value that cannot be shown", () => {
    const h = history("2025-10-01", [10, null, 12]);
    expect(validateStorageHistory(h, "s")).toEqual(h);
    for (const patch of [{ source_station_id: "other" }, { values: [10] }, { values: [10, NaN, 12] },
      { values: [10, Infinity, 12] }, { start: "2025-02-30" }, { data_frequency: "unknown" }]) {
      expect(() => validateStorageHistory({ ...h, ...patch }, "s")).toThrow();
    }
  });
  it("joins only matching, nonoverlapping histories and preserves missing days", () => {
    const a = history("2025-09-29", [1]);
    const b = history("2025-10-01", [3, null, 4]);
    expect(mergeStorageHistory(a, b)?.values).toEqual([1, null, 3, null, 4]);
    expect(() => mergeStorageHistory(a, { ...b, source_key: "awdb" })).toThrow();
    expect(() => mergeStorageHistory(a, a)).toThrow();
  });
  it("draws earlier years across a whole missing year and cuts off newer readings", () => {
    const readings: (number | null)[] = Array(732).fill(null);
    readings[0] = 10;
    readings[731] = 99;
    const chart = storageYears(history("2024-10-01", readings), "2026-10-01");
    expect(chart?.lines.map((line) => line.label)).toEqual(["2024–25"]);
    expect(chart?.lines[0]?.highest).toBe(10);
    expect(chart?.lines[0]?.tier).toBe("earlier");
  });
  it("retains monthly gaps, zero storage and exact source values in CSV", () => {
    const h = history("2025-09-30", [0, null, 123.456], "monthly");
    const chart = storageYears(h, h.end);
    expect(chart?.monthly).toBe(true);
    expect(chart?.lines[0]?.last.value).toBe(123.456);
    expect(storageHistoryCsv(h)).toContain("2025-09-30,0,s,monthly,https://example.org/");
    expect(storageHistoryCsv(h)).toContain("2025-10-02,123.456,s,monthly,https://example.org/");
    expect(storageHistoryCsv(h)).not.toContain("2025-10-01");
  });
  it("puts March 1 at the same position in leap and non-leap years", () => {
    const leap = storageYears(history("2024-02-28", [1, 2, 3]), "2024-03-01");
    const other = storageYears(history("2025-02-28", [1, 3]), "2025-03-01");
    expect(leap?.lines[0]?.points.at(-1)?.[0]).toBe(152);
    expect(other?.lines[0]?.points.at(-1)?.[0]).toBe(152);
  });
  it("bounds axis ticks for flat records and a single large storage reading", () => {
    for (const value of [0, -5, 24_000_000]) {
      const chart = storageYears(history("2026-10-01", [value]), "2026-10-01")!;
      expect((chart.high - chart.low) / chart.tickStep).toBeLessThanOrEqual(5);
      expect(chart.tickStep).toBeGreaterThan(0);
    }
  });
});
