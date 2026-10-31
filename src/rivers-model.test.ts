import { describe, expect, it } from "vitest";

import {
  naturalRiverGauge, riverBand, riverDays, riverGauge, riverPayload
} from "./data/river-fixture";
import {
  NATURAL_SENTENCE, SHAPED_SENTENCE, approvalText, calendarDay, describeGauge, formatFlow,
  formatFlowFigures, lateMessage, riversCsv, riversCsvFilename, shortRecordSentence,
  whereSentence, withdrawnSentence
} from "./rivers-model";

describe("river model", () => {
  it("words the current reading in full units with its date", () => {
    const view = describeGauge(riverGauge());
    const gauge = riverGauge();
    expect(view.headline).toBe(`${formatFlowFigures(gauge.current_cfs)} cubic feet per second`);
    expect(view.basis).toMatch(/^mean flow on [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    expect(view.tierNote).toBe(SHAPED_SENTENCE);
    expect(view.comparison).toBeNull();
    expect(view.withheld).toBeNull();
    expect(view.days).toHaveLength(30);
  });

  it("says a value is provisional, approved, or has no status", () => {
    expect(approvalText("Provisional")).toContain("can still revise");
    expect(approvalText("Approved")).toContain("Approved");
    expect(approvalText(null)).toContain("no review status");
    const view = describeGauge(riverGauge({ current_qualifiers: ["ESTIMATED"] }));
    expect(view.status).toContain("estimated");
  });

  it("says late by how many days, and when the newest request failed", () => {
    expect(lateMessage(riverGauge())).toBeNull();
    expect(lateMessage(riverGauge({ is_stale: true, days_stale: 5 })))
      .toBe("This reading is late by 5 days.");
    expect(lateMessage(riverGauge({ is_stale: true, days_stale: 1 })))
      .toBe("This reading is late by one day.");
    expect(lateMessage(riverGauge({ is_stale: true, days_stale: 4, fetch_ok: false })))
      .toContain("newest request for this gauge failed");
  });

  it("names the water downstream only as the river flowing toward it", () => {
    expect(whereSentence(riverGauge())).toBe(
      "This gauge is in Utah. The river flows on toward Lake Powell.");
    expect(whereSentence(riverGauge({ flows_toward: null }))).toBe("This gauge is in Utah.");
  });

  it("never words a gauge as an inflow, a total or a comparison with normal", () => {
    const view = describeGauge(riverGauge());
    const text = JSON.stringify(view).toLowerCase();
    expect(text).not.toMatch(/inflow|total|percent of normal|% of normal|rank/);
  });

  it("words a natural gauge's class and the band it rests on, from the payload alone", () => {
    const gauge = naturalRiverGauge();
    const view = describeGauge(gauge);
    expect(view.tierNote).toBe(NATURAL_SENTENCE);
    expect(view.comparison?.label).toBe("Normal for October 26");
    expect(view.comparison?.detail).toBe("Normal for this date is 200 to 400 cubic feet per "
      + "second: the middle half of the approved daily values in 44 years of record.");
    const rows = Object.fromEntries(view.rows.map((row) => [row.label, row.value]));
    expect(rows["Normal range for October 26"]).toBe("200 to 400 cubic feet per second");
    expect(rows["Median for October 26"]).toBe("300 cubic feet per second");
    expect(rows["Much below normal"]).toBe("Under 100 cubic feet per second");
    expect(rows["Much above normal"]).toBe("Over 500 cubic feet per second");
    expect(rows["Years compared"]).toBe("44 years with an approved value on this date");
    expect(view.comparison?.shortRecord).toBeNull();
    const much = describeGauge({ ...gauge, flow_class: "much_above_normal" } as typeof gauge);
    expect(much.comparison?.label).toBe("Much above normal for October 26");
    expect(JSON.stringify(view).toLowerCase()).not.toMatch(/inflow|total|% of normal|rank/);
  });

  it("says beside the comparison when the band rests on fewer than 30 years", () => {
    const base = naturalRiverGauge();
    const short = { ...base, short_record: true,
      normal_band: riverBand(base.as_of, { years: 22, p25: 33.75, p75: 59.875 }) } as typeof base;
    const view = describeGauge(short);
    expect(view.comparison?.shortRecord).toBe("The U.S. Geological Survey has 22 years of "
      + "record for this date, fewer than the usual 30.");
    expect(view.comparison?.detail).toBe("Normal for this date is 33.8 to 59.9 cubic feet per "
      + "second: the middle half of the approved daily values in 22 years of record.");
    const rows = Object.fromEntries(view.rows.map((row) => [row.label, row.value]));
    expect(rows["Years compared"])
      .toBe("22 years with an approved value on this date (fewer than the usual 30)");
    expect(shortRecordSentence(22).split(/\s+/).length).toBeLessThanOrEqual(25);
  });

  it("says why a natural gauge has no comparison today, without a class", () => {
    const thin = describeGauge(naturalRiverGauge({}, "ten_years_or_fewer"));
    expect(thin.comparison).toBeNull();
    expect(thin.withheld).toBe("This flow is not compared with normal for October 26: the "
      + "U.S. Geological Survey has 10 or fewer years of record for this date.");
    expect(thin.withheld!.split(/\s+/).length).toBeLessThanOrEqual(25);
    expect(thin.rows.some((row) => row.label.startsWith("Normal range"))).toBe(false);
    const gap = describeGauge(naturalRiverGauge({}, "percentile_missing"));
    expect(gap.withheld).toContain("gives no normal range for this date");
  });

  it("names the band's calendar day without a year", () => {
    expect(calendarDay("2028-02-29")).toBe("February 29");
    expect(riverBand("2026-10-30").day).toBe("10-30");
  });

  it("states a missing 7-day reference instead of inventing a change", () => {
    const values = Array.from({ length: 30 }, (_, i) => (i === 22 ? null : 4));
    const gauge = riverGauge({ daily: riverDays("2026-10-26", values) });
    const change = describeGauge(gauge).rows.find((row) => row.label === "Change in 7 days");
    expect(change?.value).toBe("No reading 7 days earlier to compare with.");
    const gap = describeGauge(gauge).days[22]!;
    expect(gap.value).toBe("No value");
    expect(gap.status).toBe("No value");
  });

  it.each([
    [101, "101"], [15.4, "15.4"], [7.62, "7.62"], [33.75, "33.8"], [59.875, "59.9"],
    [4.947, "4.95"], [4.9, "4.9"], [7.5, "7.5"], [0.05, "0.05"], [0.18, "0.18"],
    [0.012, "0.012"], [0.374, "0.374"], [9.625, "9.63"], [99.96, "100"], [100, "100"],
    [1234.5, "1,235"], [3920, "3,920"], [33800, "33,800"], [0, "0"], [null, "—"],
    [Number.NaN, "—"]
  ] as [number | null, string][])("shows %s as %s at three significant figures", (value, text) => {
    expect(formatFlowFigures(value)).toBe(text);
  });

  it("formats flow at the survey's precision", () => {
    expect(formatFlow(33800)).toBe("33,800");
    expect(formatFlow(0.25)).toBe("0.25");
    expect(formatFlow(0)).toBe("0");
    expect(formatFlow(null)).toBe("—");
  });

  it("writes one CSV row per gauge and day with the flags", () => {
    const csv = riversCsv(riverPayload([riverGauge(), riverGauge({ source_station_id: "2" })]));
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe("station,name,publisher_station_name,date,daily_mean_cfs,"
      + "approval_status,qualifiers,compared_with_normal,source_url");
    expect(lines).toHaveLength(61);
    expect(lines[1]).toContain(",Provisional,,false,");
    expect(riversCsvFilename("2026-10-27")).toBe("river-flow-2026-10-27.csv");
  });

  it("states a withdrawal without a measurement", () => {
    expect(withdrawnSentence({ name: "Gone River", as_of: "2026-07-01", days_stale: 118,
      source_label: null, reason: "quiet" })).toContain("It was last read Jul 1, 2026.");
  });
});
