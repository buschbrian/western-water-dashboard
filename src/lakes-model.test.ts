import { describe, expect, it } from "vitest";

import { armedLake, lake, payload, target } from "./data/lakes-validate.test";
import { validateLakePayload } from "./data/lakes-validate";
import {
  datumName, describeLake, formatFeet, lakeMonths, lakeStatement, targetLines,
  withdrawnSentence
} from "./lakes-model";
import type { TerminalLake } from "./types";

const walker = validateLakePayload(payload()).lakes[0]!;
const one = (value: Record<string, unknown>): TerminalLake =>
  validateLakePayload(payload({ lakes: [value] })).lakes[0]!;

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
    const [gauge] = describeLake(walker, "#000000").gauges;
    const view = { level: gauge!.level, volume: gauge!.volume!,
      source: describeLake(walker, "#000000").source };
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
    const [view] = describeLake(walker, "#000000").gauges;
    for (const card of [view!.level, view!.volume!]) {
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
    const months = lakeMonths(walker, "#123456");
    expect(months).toHaveLength(1);
    expect(months[0]).toMatchObject({
      key: "2026-08", label: "Aug 2026", storageAf: 1160000, percent: null,
      normalAf: 1100000, normalYears: 10, color: "#123456"
    });
  });

  it("draws Walker Lake as it was: one gauge, a level, a volume, the same rows", () => {
    const view = describeLake(walker, "#000000");
    expect(view.armsNote).toBeNull();
    expect(view.gauges).toHaveLength(1);
    const [gauge] = view.gauges;
    expect(gauge!.heading).toBeNull();
    expect(gauge!.noVolume).toBeNull();
    expect(gauge!.level.heading).toBe("Surface level");
    expect(gauge!.level.headline).toBe("3,914.96 feet");
    expect(gauge!.volume?.headline).toBe("1,153,000 acre-feet");
    expect(gauge!.months).toEqual(lakeMonths(walker, "#000000"));
    expect(view.source.map((row) => row.label)).toEqual([
      "Publisher", "Station", "Level datum", "Volume table", "Record starts", "Readings held"]);
    expect(view.source[1]!.value).toBe("10288500");
    expect(view.source[3]!.value).toBe("Lopes and Smith (2007), in use from Oct 1, 2014");
    expect(view.source[5]!.value).toBe("4200 readings over 11.7 years");
  });

  it("states a missing volume plainly and draws no volume chart", () => {
    const view = describeLake(one(lake({ volume: null })), "#000000");
    const [gauge] = view.gauges;
    expect(gauge!.volume).toBeNull();
    expect(gauge!.months).toEqual([]);
    expect(gauge!.noVolume).toBe("No reviewed table that turns a water level into a volume "
      + "exists for this lake, so this site shows its surface level only.");
    expect(view.source.find((row) => row.label === "Volume table")?.value).toBe("None reviewed");
  });

  it("draws a lake measured by arm as named arms with no level for the whole lake", () => {
    const view = describeLake(one(armedLake()), "#000000");
    expect(view.gauges.map((gauge) => gauge.heading)).toEqual(["South Arm", "North Arm"]);
    expect(view.gauges.map((gauge) => gauge.station)).toEqual(["10010000", "10010100"]);
    expect(view.armsNote).toBe("The survey measures the South Arm and the North Arm at "
      + "different gauges. The parts of the lake stand at different levels, so this site "
      + "shows each part and no level for the whole lake.");
    expect(view.gauges[1]!.noVolume).toContain("for the North Arm,");
    expect(view.source.find((row) => row.label === "Stations")?.value)
      .toBe("South Arm 10010000, North Arm 10010100");
    expect(view.source.find((row) => row.label === "Level datum")?.value)
      .toBe("National Geodetic Vertical Datum of 1929");
  });

  it("states a target as a named line with a gap in feet and never a percent", () => {
    expect(targetLines(walker)).toEqual([
      "No restoration or regulatory target is published for this lake."]);
    const below = one(lake({ targets: [target()],
      elevation: { ...lake().elevation, current: 6382.75 } }));
    expect(targetLines(below)).toEqual(["Target: 6,392 ft, State Water Resources Control "
      + "Board Decision 1631 (1994). The surface level is 9.25 feet below the target."]);
    const otherDatum = one(lake({ targets: [target({ vertical_datum: "NAVD88" })] }));
    expect(targetLines(otherDatum)[0]).toContain("use different datums, so no gap is shown.");
    const onArm = one(armedLake({ targets: [target({ arm: "North Arm", elevation_ft: 4189.4 })] }));
    expect(targetLines(onArm)[0]).toContain("The North Arm is 0.50 feet above the target.");
    for (const line of [...targetLines(below), ...targetLines(onArm)]) {
      expect(line).not.toMatch(/%|percent|full/i);
    }
  });

  it("states a withdrawn lake without a measurement", () => {
    const sentence = withdrawnSentence({ name: "Walker Lake", as_of: "2026-06-01",
      days_stale: 97, source_label: "U.S. Geological Survey", reason: "quiet" });
    expect(sentence).toContain("not in the current published data");
    expect(sentence).toContain("Jun 1, 2026");
  });
});
