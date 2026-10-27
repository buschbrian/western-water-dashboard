import { describe, expect, it } from "vitest";
import { isReservoirElevation, validateElevationHistory } from "./elevation-validate";
import { readPayload } from "./payload-fixture";
import { validateReservoirPayload } from "./validate";
import { syntheticElevation, syntheticProjectElevation } from "./elevation-fixture";

function payloadWith(elevation: unknown): unknown {
  const payload = readPayload();
  const [first, ...rest] = payload.reservoirs;
  return { ...payload, reservoirs: [{ ...first!, elevation }, ...rest] };
}

describe("a reservoir's surface level (ADR-135)", () => {
  it("accepts a payload with no level block on any reservoir", () => {
    const payload = readPayload();
    const stripped = {
      ...payload,
      reservoirs: payload.reservoirs.map(({ elevation: _drop, ...rest }) => rest)
    };
    expect(() => validateReservoirPayload(stripped)).not.toThrow();
  });

  it("accepts a payload with a level block", () => {
    expect(() => validateReservoirPayload(payloadWith(syntheticElevation()))).not.toThrow();
  });

  it("refuses a level that carries a percentage change", () => {
    expect(isReservoirElevation({ ...syntheticElevation(), change_365d_pct: -1.2 })).toBe(false);
    expect(() => validateReservoirPayload(
      payloadWith({ ...syntheticElevation(), change_7d_pct: 0.1 }))).toThrow(/Invalid reservoir record/);
  });

  it("refuses a level with no datum", () => {
    expect(isReservoirElevation(syntheticElevation({ vertical_datum: "" }))).toBe(false);
  });

  it("refuses a reference level with no authority or one spelled as a share", () => {
    const [level] = syntheticElevation().reference_levels;
    expect(isReservoirElevation(syntheticElevation({
      reference_levels: [{ ...level!, authority: "" }] }))).toBe(false);
    expect(isReservoirElevation(syntheticElevation({
      reference_levels: [{ ...level!, pct: 50 } as never] }))).toBe(false);
  });

  it("accepts a project datum only with its name and stated relation", () => {
    const project = syntheticProjectElevation();
    expect(isReservoirElevation(project)).toBe(true);
    const { datum_relation: _relation, ...unstated } = project;
    expect(isReservoirElevation(unstated)).toBe(false);
    expect(isReservoirElevation({ ...project, datum_relation: {
      ...project.datum_relation!, source_url: "" } })).toBe(false);
    expect(isReservoirElevation({ ...syntheticElevation(),
      datum_relation: project.datum_relation })).toBe(false);
    expect(isReservoirElevation({ ...project, record_starts: {
      ...project.record_starts!, source_url: "" } })).toBe(false);
    expect(isReservoirElevation({ ...project, derived_offset: {
      ...project.derived_offset!, sources: [] } })).toBe(false);
  });

  it("refuses an offset with no measurement date", () => {
    const offset = { ...syntheticElevation().datum_offset!, measured: "" };
    expect(isReservoirElevation(syntheticElevation({ datum_offset: offset }))).toBe(false);
    expect(isReservoirElevation(syntheticElevation({ datum_offset: null }))).toBe(true);
  });
});

describe("the elevation history", () => {
  const history = {
    schema_version: 1, fetched_at: "2026-10-27T12:00:00+00:00", run_date: "2026-10-27", unit: "ft",
    reservoirs: [{
      name: "Testwater", source_station_id: "1", source_item_id: 2, vertical_datum: "NGVD29",
      start: "2026-10-01", end: "2026-10-03", values: [3500, null, 3501.5]
    }]
  };

  it("accepts one value for each day, a missing day as null", () => {
    expect(validateElevationHistory(history).reservoirs[0]!.values).toHaveLength(3);
  });

  it("refuses a series that does not fill its dates", () => {
    expect(() => validateElevationHistory({
      ...history, reservoirs: [{ ...history.reservoirs[0]!, values: [3500, 3501] }]
    })).toThrow(/do not fill/);
  });

  it("refuses an unknown structure version", () => {
    expect(() => validateElevationHistory({ ...history, schema_version: 2 })).toThrow(/version/);
  });
});
