import { describe, expect, it } from "vitest";

import { armedLake, lake, payload } from "./data/lakes-validate.test";
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
    const { level, volume } = view.gauges[0]!;
    if (!volume) throw new Error("Walker Lake has a volume");
    const levelChange = level.rows.find((row) => row.label.startsWith("Change in 1 year"));
    const volumeChange = volume.rows.find((row) => row.label.startsWith("Change in 1 year"));
    expect(levelChange?.value).toBe("+1.20 feet since Sep 5, 2025");
    expect(volumeChange?.value).toBe("+24,000 acre-feet (+2.1%) since Sep 5, 2025");
    /* The statement says why there is no full level; nothing else may name one. */
    const rows = [...level.rows, ...volume.rows, ...view.source]
      .map((row) => `${row.label} ${row.value}`).join(" ")
      + ` ${level.headline} ${level.basis} ${volume.headline} ${volume.basis}`;
    expect(rows).not.toMatch(/full level|capacity|% full|percent full/i);
  });

  it("ranks each measurement the way the details panel does", () => {
    const view = describeLake(walker, "#000000");
    for (const card of [view.gauges[0]!.level, view.gauges[0]!.volume!]) {
      expect(card.rows.find((row) => row.label === "History rank")?.value)
        .toBe("3rd-lowest of 12 years");
    }
  });

  it("dates the rank's first year from the payload, not from the page", () => {
    expect(describeLake(walker, "#000000").note).toContain(
      `The years start in ${walker.first_obs.slice(0, 4)},`);
    const later = validateLakePayload(payload({
      lakes: [lake({ first_obs: "2018-03-01" })]
    })).lakes[0]!;
    expect(describeLake(later, "#000000").note).toContain("The years start in 2018,");
  });

  it("says when a reading is late, by how many days", () => {
    const late = validateLakePayload(payload({
      lakes: [lake({ is_stale: true, days_stale: 5 })], stale_count: 1
    })).lakes[0]!;
    expect(describeLake(late, "#000000").late).toBe("This reading is late by 5 days.");
    expect(describeLake(walker, "#000000").late).toBeNull();
  });

  it("shapes the twelve months for the shared chart with no share of anything", () => {
    if (walker.arms) throw new Error("Walker Lake is measured at one station");
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

  it("keeps Walker Lake's rows as one station's lake", () => {
    const view = describeLake(walker, "#000000");
    expect(view.gauges).toHaveLength(1);
    expect(view.gauges[0]!.heading).toBeNull();
    expect(view.gauges[0]!.noVolume).toBeNull();
    expect(view.source.map((row) => row.label)).toEqual([
      "Publisher", "Station", "Level datum", "Volume table", "Record starts", "Readings held"]);
  });

  it("shows each arm apart, with its own level and no combined value", () => {
    const gsl = validateLakePayload(payload({ lakes: [armedLake({
      arms: [armedLake().arms[0], { ...armedLake().arms[1], is_stale: true, days_stale: 3 }],
      is_stale: true, days_stale: 3
    })], stale_count: 1 })).lakes[0]!;
    const view = describeLake(gsl, "#000000");
    expect(view.statement).toContain("natural terminal lake in Utah");
    expect(view.statement).toContain("measures this lake in two arms");
    expect(view.statement).toContain("does not combine them into one level");
    expect(view.gauges.map((part) => part.heading)).toEqual(["South arm", "North arm"]);
    expect(view.late).toBeNull();
    expect(view.gauges[0]!.late).toBeNull();
    expect(view.gauges[1]!.late).toBe("The reading for the north arm is late by 3 days.");
    for (const part of view.gauges) {
      expect(part.volume).toBeNull();
      expect(part.months).toEqual([]);
      expect(part.noVolume).toBe("The U.S. Geological Survey publishes no daily volume for "
        + "this arm, so this site shows its surface level only.");
      expect(part.level.basis).toBe("above the National Geodetic Vertical Datum of 1929");
      expect(part.source.map((row) => row.label)).toEqual(
        ["Station", "Level datum", "Record starts", "Readings held"]);
    }
    expect(view.gauges.map((part) => part.source[0]!.value)).toEqual(["10010000", "10010100"]);
    expect(view.source).toEqual([{ label: "Publisher", value: "U.S. Geological Survey" }]);
  });

  it("states a withdrawn lake without a measurement", () => {
    const sentence = withdrawnSentence({ name: "Walker Lake", as_of: "2026-06-01",
      days_stale: 97, source_label: "U.S. Geological Survey", reason: "quiet" });
    expect(sentence).toContain("not in the current published data");
    expect(sentence).toContain("Jun 1, 2026");
  });
});
