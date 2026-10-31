import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { naturalRiverGauge, riverBand, riverDays, riverGauge, riverPayload } from "./river-fixture";
import { REFUSED_RIVER_FIELDS, flowClass, validateRiverPayload } from "./rivers-validate";

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("validateRiverPayload", () => {
  it("accepts the synthetic payload and today's committed file", () => {
    expect(validateRiverPayload(copy(riverPayload())).gauges).toHaveLength(1);
    const committed = JSON.parse(readFileSync(new URL("../../rivers.json", import.meta.url), "utf8"));
    const payload = validateRiverPayload(committed);
    expect(payload.gauge_count + payload.withdrawn_count).toBeGreaterThan(0);
  });

  it("keeps a day with no value as a gap", () => {
    const values = Array.from({ length: 30 }, (_, i) => (i === 10 ? null : 5));
    const payload = validateRiverPayload(copy(riverPayload([riverGauge({ daily: riverDays("2026-10-26", values) })])));
    expect(payload.gauges[0]!.daily[10]!.cfs).toBeNull();
  });

  it.each(REFUSED_RIVER_FIELDS)("refuses %s on a gauge and on the envelope", (field) => {
    const gauge = { ...riverGauge(), [field]: 1 };
    expect(() => validateRiverPayload(copy(riverPayload([gauge as never])))).toThrow(field);
    expect(() => validateRiverPayload({ ...copy(riverPayload()), [field]: 1 })).toThrow(field);
  });

  it("refuses a comparison with normal on a shaped gauge", () => {
    const gauge = { ...riverGauge(), compared_with_normal: true };
    expect(() => validateRiverPayload(copy(riverPayload([gauge as never])))).toThrow("never compared");
    const banded = { ...riverGauge(), normal_band: riverBand() };
    expect(() => validateRiverPayload(copy(riverPayload([banded as never])))).toThrow("never compared");
    const classed = { ...riverGauge(), flow_class: null };
    expect(() => validateRiverPayload(copy(riverPayload([classed as never])))).toThrow("never compared");
  });

  it("accepts a natural gauge with its band, or with its reason and nothing else", () => {
    const compared = validateRiverPayload(copy(riverPayload([riverGauge(), naturalRiverGauge()])));
    expect(compared.gauges[1]!.compared_with_normal).toBe(true);
    const withheld = validateRiverPayload(copy(riverPayload([
      naturalRiverGauge({}, "fewer_than_30_years")])));
    expect(withheld.gauges[0]!.compared_with_normal).toBe(false);
  });

  it("refuses a natural gauge whose class, band or reason does not hold together", () => {
    const gauge = naturalRiverGauge();
    const bad: [unknown, string][] = [
      [{ ...gauge, flow_class: "much_above_normal" }, "does not follow"],
      [{ ...gauge, normal_band: riverBand("2026-10-25") }, "reading's date"],
      [{ ...gauge, normal_band: riverBand(gauge.as_of, { years: 29 }) }, "malformed"],
      [{ ...gauge, normal_band: riverBand(gauge.as_of, { p25: 450 }) }, "malformed"],
      [{ ...gauge, normal_band: { ...riverBand(gauge.as_of), percentile: 50 } }, "malformed"],
      [{ ...gauge, normal_withheld: "fewer_than_30_years" }, "malformed"],
      [{ ...gauge, compared_with_normal: false }, "says why"],
      [{ ...naturalRiverGauge({}, "percentile_missing"), normal_withheld: "guessed" }, "says why"],
      [{ ...gauge, tier: "short" }, "unknown tier"]
    ];
    for (const [record, match] of bad) {
      expect(() => validateRiverPayload(copy(riverPayload([record as never])))).toThrow(match);
    }
  });

  it("classes a flow the way the pipeline does, nearer normal at a boundary", () => {
    const band = riverBand();
    expect([99, 100, 199, 200, 400, 401, 500, 501].map((cfs) => flowClass(cfs, band))).toEqual([
      "much_below_normal", "below_normal", "below_normal", "normal", "normal",
      "above_normal", "above_normal", "much_above_normal"]);
  });

  it("refuses a window that skips a day or does not end on the current reading", () => {
    const gauge = riverGauge();
    const skipped = copy(gauge);
    skipped.daily.splice(5, 1);
    skipped.daily.unshift({ date: "2026-09-01", cfs: 1, approval: null, qualifiers: [] });
    expect(() => validateRiverPayload(copy(riverPayload([skipped])))).toThrow("consecutive");
    expect(() => validateRiverPayload(copy(riverPayload([{ ...gauge, current_cfs: 1 }]))))
      .toThrow("current reading");
    const short = { ...gauge, daily: gauge.daily.slice(1) };
    expect(() => validateRiverPayload(copy(riverPayload([short])))).toThrow("30");
  });

  it("refuses a negative flow and an unreadable flag", () => {
    const gauge = copy(riverGauge());
    gauge.daily[3]!.cfs = -1;
    expect(() => validateRiverPayload(copy(riverPayload([gauge])))).toThrow("readable days");
    const flagged = copy(riverGauge());
    (flagged.daily[3] as unknown as Record<string, unknown>).qualifiers = "ESTIMATED";
    expect(() => validateRiverPayload(copy(riverPayload([flagged])))).toThrow("readable days");
  });

  it("refuses a withdrawal notice that carries a measurement", () => {
    const payload = copy(riverPayload([]));
    payload.withdrawn = [{ name: "Gone River", as_of: "2026-07-01", days_stale: 118,
      source_label: "U.S. Geological Survey", reason: "quiet", source_station_id: "1",
      current_cfs: 3 } as never];
    payload.withdrawn_count = 1;
    expect(() => validateRiverPayload(payload)).toThrow("carries no measurement");
  });

  it("refuses counts that disagree with the lists", () => {
    expect(() => validateRiverPayload({ ...copy(riverPayload()), gauge_count: 2 })).toThrow("gauge_count");
    expect(() => validateRiverPayload({ ...copy(riverPayload()), stale_count: 1 })).toThrow("stale_count");
  });
});
