import { describe, expect, it } from "vitest";
import { validatePrecipitationPayload } from "./data/precip-validate";
import { newestSetDay } from "./precip-model";
import { firstAvailableEnd, stormTotals } from "./precip-storm-model";
import type { PrecipitationPayload } from "./types";

const DATES = Array.from({ length: 12 }, (_, day) => `2026-10-${String(day + 1).padStart(2, "0")}`);

/** A payload in the published shape, read through the real validator. */
function payload(sites: Record<string, (number | null)[]>, late: string[] = [], dates = DATES): PrecipitationPayload {
  return validatePrecipitationPayload({
    schema_version: 1,
    generated_at: "2026-10-13T00:00:00Z",
    as_of: dates.at(-1),
    water_year: 2027,
    series_dates: dates,
    sites: Object.entries(sites).map(([station, values]) => {
      const days = values.flatMap((value, day) => (value === null ? [] : [day]));
      return {
        station,
        latest_date: dates[days.at(-1) ?? 0],
        late: late.includes(station),
        series_days: days,
        series_values: days.map((day) => values[day])
      };
    })
  });
}

const rising = (step: number): number[] => DATES.map((_, day) => Math.round(day * step * 10) / 10);

describe("storm totals", () => {
  it("is the difference of two accumulated readings, ending on the set day", () => {
    const totals = stormTotals(["a", "b"], payload({ a: rising(0.1), b: rising(0.3) }));
    expect(totals.endDate).toBe("2026-10-12");
    const [one, three, seven] = totals.windows;
    expect(one).toMatchObject({ days: 1, startDate: "2026-10-11", available: true, meanInches: 0.2 });
    expect(three!.totals).toEqual([{ station: "b", inches: 0.9 }, { station: "a", inches: 0.3 }]);
    expect(three!.meanInches).toBe(0.6);
    expect(seven!.totals.map((total) => total.inches)).toEqual([2.1, 0.7]);
  });

  it("uses every station in the place, with or without a long history", () => {
    const totals = stormTotals(["a", "b", "c"], payload({ a: rising(0.1), b: rising(0.1), outside: rising(5) }));
    const three = totals.windows[1]!;
    expect(three.totals.map((total) => total.station)).toEqual(["a", "b"]);
    expect(three.withoutValue).toBe(1);
  });

  it("leaves out a station whose accumulation falls, and never clips it to zero", () => {
    const reset = rising(0.2);
    reset[11] = 0.5;
    const three = stormTotals(["a", "reset"], payload({ a: rising(0.1), reset })).windows[1]!;
    expect(three.totals).toEqual([{ station: "a", inches: 0.3 }]);
    expect(three.falling).toBe(1);
    expect(three.meanInches).toBe(0.3);
  });

  it("ends on the set day and leaves out a station without a value on both days", () => {
    const short = rising(0.1).map((value, day) => (day >= 11 ? null : value));
    const stations: Record<string, (number | null)[]> = { short };
    for (let index = 0; index < 10; index += 1) stations[`s${index}`] = rising(0.1);
    const totals = stormTotals(Object.keys(stations), payload(stations));
    expect(totals.endDate).toBe("2026-10-12");
    expect(totals.windows[0]!.withoutValue).toBe(1);
    expect(totals.windows[0]!.totals).toHaveLength(10);
  });

  it("steps back to the set day when too few stations report on the newest day", () => {
    const stations: Record<string, (number | null)[]> = {
      early: rising(0.1),
      a: rising(0.1).map((value, day) => (day >= 11 ? null : value)),
      b: rising(0.1).map((value, day) => (day >= 11 ? null : value))
    };
    const totals = stormTotals(Object.keys(stations), payload(stations));
    expect(totals.endDate).toBe("2026-10-11");
    expect(totals.windows[0]!.totals).toHaveLength(3);
  });

  it("does not let a late station move the end day", () => {
    const old = rising(0.1).map((value, day) => (day >= 6 ? null : value));
    const totals = stormTotals(["a", "old"], payload({ a: rising(0.1), old }, ["old"]));
    expect(totals.endDate).toBe("2026-10-12");
    expect(totals.windows[0]!.withoutValue).toBe(1);
  });

  it("says a window is not available while it reaches back before the first day", () => {
    const dates = DATES.slice(0, 4);
    const daily = payload({ a: [0, 0.1, 0.3, 0.6] }, [], dates);
    const totals = stormTotals(["a"], daily);
    expect(totals.endDate).toBe("2026-10-04");
    expect(totals.windows.map((window) => window.available)).toEqual([true, true, false]);
    expect(totals.windows[1]!.meanInches).toBe(0.6);
    expect(totals.windows[2]).toMatchObject({ available: false, totals: [], meanInches: null });
    expect(firstAvailableEnd(daily, 7)).toBe("2026-10-08");
  });

  it("keeps the gauge's tenth of an inch", () => {
    const flat = DATES.map(() => 1.2);
    const tip = [...flat];
    tip[11] = 1.3;
    const one = stormTotals(["a", "b", "c"], payload({ a: tip, b: flat, c: flat })).windows[0]!;
    expect(one.totals[0]).toEqual({ station: "a", inches: 0.1 });
    expect(one.meanInches).toBe(0);
  });

  it("has no end day where no station reports", () => {
    expect(stormTotals(["missing"], payload({ a: rising(0.1) }))).toEqual({ endDate: null, windows: [] });
  });

  it("finds the set day by the share rule", () => {
    const daily = payload({ a: rising(0.1), b: rising(0.1).map((value, day) => (day >= 11 ? null : value)) });
    expect(newestSetDay(daily.series_dates, daily.sites)).toBe("2026-10-11");
    expect(newestSetDay(daily.series_dates, [])).toBe("2026-10-12");
  });
});
