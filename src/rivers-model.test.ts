import { describe, expect, it } from "vitest";

import { riverDays, riverGauge, riverPayload } from "./data/river-fixture";
import {
  SHAPED_SENTENCE, approvalText, describeGauge, formatFlow, lateMessage, riversCsv,
  riversCsvFilename, whereSentence, withdrawnSentence
} from "./rivers-model";

describe("river model", () => {
  it("words the current reading in full units with its date", () => {
    const view = describeGauge(riverGauge());
    const gauge = riverGauge();
    expect(view.headline).toBe(`${formatFlow(gauge.current_cfs)} cubic feet per second`);
    expect(view.basis).toMatch(/^mean flow on [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    expect(view.shaped).toBe(SHAPED_SENTENCE);
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

  it("states a missing 7-day reference instead of inventing a change", () => {
    const values = Array.from({ length: 30 }, (_, i) => (i === 22 ? null : 4));
    const gauge = riverGauge({ daily: riverDays("2026-10-26", values) });
    const change = describeGauge(gauge).rows.find((row) => row.label === "Change in 7 days");
    expect(change?.value).toBe("No reading 7 days earlier to compare with.");
    const gap = describeGauge(gauge).days[22]!;
    expect(gap.value).toBe("No value");
    expect(gap.status).toBe("No value");
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
