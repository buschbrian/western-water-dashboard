/* The full level a reading is divided by is the one that was in force when
 * the reading was taken (ADR-111). Held against synthetic versions rather
 * than the payload, which carries none yet -- and against the payload for the
 * one thing it can say, which is that none of it has changed. */
import { describe, expect, it } from "vitest";
import { capacityOn, monthEndDate, sizeBasisOn } from "./capacity";
import { readPayload } from "./payload-fixture";
import type { CapacityVersion, Reservoir } from "../types";

const reservoirs = readPayload().reservoirs;

/* One real record, given a full level that changed. Vail Lake's figures:
 * 45,207 acre-feet at the spillway, limited to 31,395 by its owner. */
const RESTRICTED: CapacityVersion[] = [
  { capacity_af: 45207, capacity_basis: "max_storage",
    effective_from: null, effective_to: "2019-06-30" },
  { capacity_af: 31395, capacity_basis: "operating_restriction",
    effective_from: "2019-07-01", effective_to: null,
    authority: "Rancho California Water District",
    source_url: "https://www.ranchowater.com/DocumentCenter/View/1869",
    source_checked: "2026-09-04" }
];

/** A copy with no dated full level, whatever the payload happens to carry. */
function withoutHistory(reservoir: Reservoir): Reservoir {
  const copy = { ...reservoir };
  delete copy.capacity_history;
  return copy;
}

function dated(versions: CapacityVersion[] = RESTRICTED): Reservoir {
  const [first] = reservoirs;
  if (!first) throw new Error("the payload has no reservoirs");
  return {
    ...first,
    capacity_af: versions[versions.length - 1]?.capacity_af ?? null,
    capacity_basis: versions[versions.length - 1]?.capacity_basis ?? null,
    physical_capacity_af: 45207,
    capacity_history: versions
  };
}

describe("the full level in force on a date", () => {
  it("gives an earlier reading the level that applied then", () => {
    const reservoir = dated();
    expect(capacityOn(reservoir, "2015-01-01")).toBe(45207);
    expect(capacityOn(reservoir, "2019-06-30")).toBe(45207);
  });

  it("starts on the day the limit takes effect, not the day after", () => {
    const reservoir = dated();
    expect(capacityOn(reservoir, "2019-07-01")).toBe(31395);
    expect(capacityOn(reservoir, "2026-09-04")).toBe(31395);
  });

  it("answers from the one full level where nothing changed", () => {
    const [reservoir] = reservoirs;
    expect(reservoir).toBeDefined();
    if (!reservoir) return;
    expect(capacityOn(reservoir, "2015-01-01")).toBe(reservoir.capacity_af);
    expect(capacityOn(reservoir, reservoir.as_of)).toBe(reservoir.capacity_af);
  });

  it("falls back to the highest recorded storage, whatever the date", () => {
    const [first] = reservoirs;
    if (!first) return;
    const untraced: Reservoir = withoutHistory({ ...first, capacity_af: null });
    expect(sizeBasisOn(untraced, "2015-01-01")).toBe(untraced.record_max_af);
    expect(sizeBasisOn(untraced, untraced.as_of)).toBe(untraced.record_max_af);
  });

  it("keeps a reservoir enlarged later on its earlier level", () => {
    /* The same mechanism the other way round: Success Lake's spillway was
     * enlarged in March 2025, and a 2019 reading must not be divided by a
     * pool that did not exist yet. */
    const reservoir = dated([
      { capacity_af: 82300, capacity_basis: "cdec_reservoir_report",
        effective_from: null, effective_to: "2025-03-19" },
      { capacity_af: 112000, capacity_basis: "authoritative_water_report",
        effective_from: "2025-03-20", effective_to: null }
    ]);
    expect(capacityOn(reservoir, "2019-06-30")).toBe(82300);
    expect(capacityOn(reservoir, "2025-03-20")).toBe(112000);
  });
});

describe("the date a month is divided by", () => {
  it("is the last day of that month", () => {
    expect(monthEndDate("2025-10")).toBe("2025-10-31");
    expect(monthEndDate("2026-02")).toBe("2026-02-28");
    expect(monthEndDate("2024-02")).toBe("2024-02-29");
    expect(monthEndDate("2025-12")).toBe("2025-12-31");
  });

  it("echoes a month it cannot read rather than inventing a date", () => {
    expect(monthEndDate("2025-13")).toBe("2025-13");
    expect(monthEndDate("later")).toBe("later");
  });
});
