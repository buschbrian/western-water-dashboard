import { describe, expect, it } from "vitest";

import { lake, payload } from "./data/lakes-validate.test";
import { validateLakePayload } from "./data/lakes-validate";
import {
  datumName, describeLake, formatFeet, lakeMonths, lakeStatement, targetsSentence,
  withdrawnSentence
} from "./lakes-model";

const walker = validateLakePayload(payload()).lakes[0]!;

describe("the terminal-lake page's words", () => {
  it("says what the water is and why it has no percent full", () => {
    const statement = lakeStatement(walker);
    expect(statement).toContain("natural terminal lake in Nevada");
    expect(statement).toContain("no percent full");
  });

  it("names the datum in full and formats feet to hundredths", () => {
    expect(datumName("NGVD29")).toBe("National Geodetic Vertical Datum of 1929");
    expect(formatFeet(3914.9604)).toBe("3,914.96");
    expect(formatFeet(null)).toBe("—");
  });

  it("gives a level no percentage and a volume one", () => {
    const view = describeLake(walker, "#000000");
    const levelChange = view.level.rows.find((row) => row.label.startsWith("Change in 1 year"));
    const volumeChange = view.volume.rows.find((row) => row.label.startsWith("Change in 1 year"));
    expect(levelChange?.value).toBe("+1.20 feet since Sep 5, 2025");
    expect(volumeChange?.value).toBe("+24,000 acre-feet (+2.1%) since Sep 5, 2025");
    /* The statement says why there is no full level; nothing else may name one. */
    const rows = [...view.level.rows, ...view.volume.rows, ...view.source]
      .map((row) => `${row.label} ${row.value}`).join(" ")
      + ` ${view.level.headline} ${view.level.basis} ${view.volume.headline} ${view.volume.basis}`;
    expect(rows).not.toMatch(/full level|capacity|% full|percent full/i);
  });

  it("ranks each measurement the way the details panel does", () => {
    const view = describeLake(walker, "#000000");
    for (const card of [view.level, view.volume]) {
      expect(card.rows.find((row) => row.label === "History rank")?.value)
        .toBe("3rd-lowest of 12");
    }
  });

  it("says when a reading is late, by how many days", () => {
    const late = validateLakePayload(payload({
      lakes: [lake({ is_stale: true, days_stale: 5 })], stale_count: 1
    })).lakes[0]!;
    expect(describeLake(late, "#000000").late).toBe("This reading is late by 5 days.");
    expect(describeLake(walker, "#000000").late).toBeNull();
  });

  it("shapes the twelve months for the shared chart with no share of anything", () => {
    const months = lakeMonths(walker, "#123456");
    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({
      key: "2026-08", label: "Aug 2026", storageAf: 1160000, percent: null,
      normalAf: 1100000, normalYears: 10, color: "#123456"
    });
  });

  it("states a target as a goal and never as a full level", () => {
    expect(targetsSentence(walker)).toBe(
      "No restoration or regulatory target is published for this lake.");
    const withTarget = validateLakePayload(payload({ lakes: [lake({ targets: [{
      name: "Restoration level", authority: "a board",
      source_url: "https://example.test", set_on: "2020-01-01", elevation_ft: 3950
    }] })] })).lakes[0]!;
    expect(targetsSentence(withTarget)).toContain("A target is a goal, not a full level.");
  });

  it("states a withdrawn lake without a measurement", () => {
    const sentence = withdrawnSentence({ name: "Walker Lake", as_of: "2026-06-01",
      days_stale: 97, source_label: "U.S. Geological Survey", reason: "quiet" });
    expect(sentence).toContain("not in the current published data");
    expect(sentence).toContain("Jun 1, 2026");
  });
});
