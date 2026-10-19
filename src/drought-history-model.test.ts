import { describe, expect, it } from "vitest";
import {
  calendarClass,
  calendarCounts,
  calendarRows,
  calendarRuns,
  latestHeld,
  yearSummaries
} from "./drought-history-model";

const shares = (d0: number, d1 = 0, d2 = 0, d3 = 0, d4 = 0) => ({ d0, d1, d2, d3, d4 });

describe("the calendar rule", () => {
  it("takes the most severe class at least half the land is in or worse", () => {
    expect(calendarClass(shares(100, 80, 50, 49.9, 10))).toBe("d2");
    expect(calendarClass(shares(100, 100, 100, 100, 50))).toBe("d4");
    expect(calendarClass(shares(50))).toBe("d0");
  });

  it("calls a week with less than half the land abnormally dry no drought", () => {
    expect(calendarClass(shares(49.9, 30, 20, 10, 5))).toBe("none");
    expect(calendarClass(shares(0))).toBe("none");
  });

  it("keeps no share apart from no drought", () => {
    expect(calendarClass(null)).toBeNull();
  });
});

describe("calendar rows", () => {
  const history = {
    level: 6,
    dates: ["2026-09-22", "2026-09-29", "2026-10-06"],
    held: [true, false, true],
    series: new Map([
      ["160202", [shares(90, 60), null, shares(10)]],
      ["160201", [shares(100, 100, 100, 100, 100), null, shares(100, 100, 100, 100, 100)]]
    ]),
    skipped: []
  };

  it("orders the rows by drainage code, so neighbours sit together", () => {
    const rows = calendarRows(history, [
      { code: "160202", name: "B", measuredPercent: null },
      { code: "160201", name: "A", measuredPercent: null }
    ]);
    expect(rows.map((row) => row.code)).toEqual(["160201", "160202"]);
    expect(rows[1]!.cells).toEqual(["d1", null, "none"]);
  });

  it("gives an area the archive does not hold a row of no shares", () => {
    const rows = calendarRows(history, [{ code: "160299", name: "C", measuredPercent: 0 }]);
    expect(rows[0]!.cells).toEqual([null, null, null]);
  });

  it("joins equal weeks into runs and counts each class", () => {
    const cells = ["d1", "d1", null, "none", "none", "d4"] as const;
    expect(calendarRuns(cells)).toEqual([
      { start: 0, length: 2, cell: "d1" },
      { start: 2, length: 1, cell: null },
      { start: 3, length: 2, cell: "none" },
      { start: 5, length: 1, cell: "d4" }
    ]);
    expect(calendarCounts(cells)).toEqual(
      { none: 2, d0: 0, d1: 2, d2: 0, d3: 0, d4: 1, missing: 1 });
  });
});

describe("the year table", () => {
  it("states the highest weekly share in each year, never an average", () => {
    const years = yearSummaries(
      ["2025-12-23", "2025-12-30", "2026-01-06", "2026-01-13"],
      [shares(40, 10), shares(60, 5), null, shares(20, 20, 2)]);
    expect(years).toEqual([
      { year: "2025", weeks: 2, highest: shares(60, 10) },
      { year: "2026", weeks: 1, highest: shares(20, 20, 2) }
    ]);
  });

  it("finds the latest week with a share", () => {
    expect(latestHeld([shares(1), null])).toBe(0);
    expect(latestHeld([null])).toBeNull();
  });
});
