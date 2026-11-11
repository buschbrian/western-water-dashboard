/*
 * ADR-156: an area total read as seasonal storage, steady pools and flood
 * space. The machinery lands before any reservoir's character is ruled, so the
 * first block proves every published area figure is unchanged on the committed
 * payload. The rest drives the split with fixture characters only.
 */
import { describe, expect, it } from "vitest";
import { readPayload } from "./payload-fixture";
import {
  areaLineOf, asScoped, rollupOfScoped, scopeReservoirs, sizeBasis, statewideRollup,
  type StatewideRollup
} from "./rollup";
import { monthKeys, monthlyRollup } from "./months";
import { drainageCodeAtLevel, rollupByHuc } from "./huc";
import { storageByArea } from "../drought-model";
import { weeklyStorage } from "../weekly-model";
import { reservoirInState, watershedRecords } from "../overview-model";
import { describeStorage } from "../viz/weekly-summary";
import type { OperatingCharacter, Reservoir } from "../types";

const payload = readPayload();
const rows = payload.reservoirs;
const SOURCE = "https://www.example.gov/ruling";

function withoutCharacters(reservoirs: readonly Reservoir[]): Reservoir[] {
  return reservoirs.map(({ operating_character: _ignored, ...rest }) => rest as Reservoir);
}

/** A row whose full level never changed, so `capacity_af` is its only one. */
function withoutHistory(reservoir: Reservoir): Reservoir {
  const { capacity_history: _ignored, ...rest } = reservoir;
  return rest as Reservoir;
}

/** The arithmetic every area total used before ADR-156, written out again. */
function plainTotal(reservoirs: readonly Reservoir[]): {
  storageAf: number; capacityAf: number; percentFull: number | null;
} {
  const storageAf = reservoirs.reduce((sum, row) => sum + row.current_storage_af, 0);
  const capacityAf = reservoirs.reduce((sum, row) => sum + sizeBasis(row), 0);
  return { storageAf, capacityAf, percentFull: capacityAf > 0 ? storageAf / capacityAf * 100 : null };
}

/** Every area a reader can total: the West, each state, and each drainage
 * area at the region, subregion and basin levels. */
function areas(): { name: string; rows: Reservoir[] }[] {
  const found: { name: string; rows: Reservoir[] }[] = [{ name: "west", rows: [...rows] }];
  const states = new Set(rows.flatMap((row) => row.waterbody_states ?? []));
  for (const state of states) {
    found.push({ name: `state ${state}`, rows: rows.filter((row) => reservoirInState(row, state)) });
  }
  for (const level of [2, 4, 6]) {
    const codes = new Set(rows.map((row) => drainageCodeAtLevel(row.huc6, row.huc8, level))
      .filter((code): code is string => code !== null));
    for (const code of codes) {
      found.push({
        name: `drainage ${code}`,
        rows: rows.filter((row) => drainageCodeAtLevel(row.huc6, row.huc8, level) === code)
      });
    }
  }
  return found;
}

describe("ADR-156 changes no published figure while no character is reviewed", () => {
  it("starts from a payload in which no reservoir carries a character", () => {
    /* When the first region is ruled this fails on purpose: area totals then
     * move, METHOD_VERSION moves with them, and this block is replaced by the
     * measured movement. */
    expect(rows.filter((row) => row.operating_character != null).map((row) => row.name))
      .toEqual([]);
  });

  it("gives every area, at every level and scope, the total it gave before", () => {
    for (const area of areas()) {
      for (const lakePowell of ["include", "exclude"] as const) {
        for (const lakeMead of ["include", "exclude"] as const) {
          for (const baseline of ["recent", "climate"] as const) {
            const options = { lakePowell, lakeMead, baseline,
              minimumBaselineYears: payload.climate_normals?.minimum_years ?? 0 };
            const now = statewideRollup(area.rows, options);
            const before = statewideRollup(withoutCharacters(area.rows), options);
            const plain = plainTotal(scopeReservoirs(area.rows, options));
            const label = `${area.name} ${lakePowell} ${lakeMead} ${baseline}`;
            expect(now, label).toEqual(before);
            expect(now.storageAf, label).toBe(plain.storageAf);
            expect(now.capacityAf, label).toBe(plain.capacityAf);
            expect(now.percentFull, label).toBe(plain.percentFull);
            expect(now.seasonalCount, label).toBe(now.count);
            expect(now.steadyPools, label).toBeNull();
            expect(now.floodSpace, label).toBeNull();
          }
        }
      }
    }
  });

  it("gives every past month, drainage map figure, week and basin the figure it gave before", () => {
    const plainRows = withoutCharacters(rows);
    for (const month of monthKeys(rows)) {
      expect(monthlyRollup(rows, month), month).toEqual(monthlyRollup(plainRows, month));
    }
    for (const level of [2, 4, 6, 8]) {
      expect(storageByArea(rows, level)).toEqual(storageByArea(plainRows, level));
    }
    expect(weeklyStorage(rows)).toEqual(weeklyStorage(plainRows));
    expect(rollupByHuc(rows)).toEqual(rollupByHuc(plainRows));
  });
});

function ruled(value: OperatingCharacter["character"]): OperatingCharacter {
  return value === "restricted"
    ? { character: value, source_url: SOURCE, authority: "A state dam safety office",
        effective_from: "2015-05-27" }
    : { character: value, source_url: SOURCE };
}

/** The committed rows with fixture characters spread through them. */
function withFixtureCharacters(): Reservoir[] {
  return rows.map((row, index) => index % 5 === 1 ? { ...row, operating_character: ruled("run_of_river") }
    : index % 7 === 2 ? { ...row, operating_character: ruled("flood_space") }
      : index % 11 === 3 ? { ...row, operating_character: ruled("restricted") }
        : row);
}

function close(actual: number, expected: number, label: string): void {
  expect(Math.abs(actual - expected), label).toBeLessThan(1e-6 * Math.max(1, Math.abs(expected)));
}

describe("an area total in three lines", () => {
  it("puts restricted storage with seasonal storage and the other two on their own lines", () => {
    expect(areaLineOf({})).toBe("seasonal");
    expect(areaLineOf({ operating_character: null })).toBe("seasonal");
    expect(areaLineOf({ operating_character: ruled("restricted") })).toBe("seasonal");
    expect(areaLineOf({ operating_character: ruled("run_of_river") })).toBe("steady");
    expect(areaLineOf({ operating_character: ruled("flood_space") })).toBe("flood");
  });

  it("adds its three lines up to the plain total in every area", () => {
    const characterised = withFixtureCharacters();
    const byName = new Map(characterised.map((row) => [row.source_station_id + row.name, row]));
    for (const area of areas()) {
      const group = area.rows.map((row) => byName.get(row.source_station_id + row.name) ?? row);
      const total: StatewideRollup = rollupOfScoped(asScoped(group));
      const plain = plainTotal(group);
      const steady = total.steadyPools;
      const flood = total.floodSpace;
      close(total.storageAf + (steady?.storageAf ?? 0) + (flood?.storageAf ?? 0),
        plain.storageAf, area.name);
      close(total.capacityAf + (steady?.capacityAf ?? 0) + (flood?.capacityAf ?? 0),
        plain.capacityAf, area.name);
      expect(total.seasonalCount + (steady?.count ?? 0) + (flood?.count ?? 0), area.name)
        .toBe(total.count);
      /* Classes count every reservoir by its own figure (ADR-114). */
      expect(total.classes.reduce((sum, entry) => sum + entry.count, 0), area.name)
        .toBeLessThanOrEqual(total.count);
    }
  });

  it("states the flood line's empty space, never below zero for one basin", () => {
    const base = rows[0] as Reservoir;
    const basin = (storage: number, capacity: number): Reservoir => ({
      ...withoutHistory(base), current_storage_af: storage, capacity_af: capacity,
      operating_character: ruled("flood_space")
    });
    /* One basin briefly above its full level must not cancel another's space. */
    const total = rollupOfScoped(asScoped([basin(1000, 10000), basin(12000, 10000)]));
    expect(total.floodSpace).toEqual({
      count: 2, storageAf: 13000, capacityAf: 20000, emptyAf: 9000
    });
  });

  it("gives an area with no seasonal storage no headline percent", () => {
    const base = rows[0] as Reservoir;
    const pool = { ...base, operating_character: ruled("run_of_river") };
    const total = rollupOfScoped(asScoped([pool]));
    expect(total.count).toBe(1);
    expect(total.seasonalCount).toBe(0);
    expect(total.percentFull).toBeNull();
    expect(total.percentOfNormal).toBeNull();
    expect(total.steadyPools?.storageAf).toBe(base.current_storage_af);
  });

  it("keeps steady pools and flood space out of every other area figure", () => {
    const characterised = withFixtureCharacters();
    const seasonal = characterised.filter((row) => areaLineOf(row) === "seasonal");
    for (const month of monthKeys(rows).slice(-2)) {
      expect(monthlyRollup(characterised, month).percentFull)
        .toEqual(monthlyRollup(seasonal, month).percentFull);
    }
    expect(storageByArea(characterised)).toEqual(storageByArea(seasonal));
    expect(rollupByHuc(characterised)).toEqual(rollupByHuc(seasonal));
    const week = weeklyStorage(characterised);
    const seasonalWeek = weeklyStorage(seasonal);
    expect(week.percentNow).toBe(seasonalWeek.percentNow);
    expect(week.seasonalOnly).toBe(true);
    /* The water is real: the net change and each reservoir's own move still
     * count every measured reservoir. */
    expect(week.netAf).toBe(weeklyStorage(rows).netAf);
    expect(week.measured).toBe(weeklyStorage(rows).measured);
  });
});

describe("the surfaces that print an area total", () => {
  const base = rows[0] as Reservoir;
  const pool = (huc6_name: string, storage: number): Reservoir => ({
    ...base, huc6_name, current_storage_af: storage,
    operating_character: ruled("run_of_river")
  });

  it("leaves a drainage area of steady pools off the percent chart", () => {
    const records = watershedRecords([pool("Lower Snake", 900), pool("Lower Snake", 800),
      { ...base, huc6_name: "Sevier" }]);
    expect(records.map((record) => record.label)).toEqual(["Sevier"]);
  });

  it("counts only seasonal storage under a drainage area's chart figure", () => {
    const [record] = watershedRecords([pool("Mixed", 900), { ...base, huc6_name: "Mixed" }]);
    expect(record?.detail).toMatchObject({ reservoirCount: 1 });
  });

  it("says the week's combined percent is seasonal storage where it is", () => {
    const week = weeklyStorage(withFixtureCharacters());
    const lines = describeStorage(week);
    expect(lines.some((line) => line.startsWith("Their seasonal storage moved from"))).toBe(true);
    expect(describeStorage(weeklyStorage(rows))
      .some((line) => line.includes("seasonal storage"))).toBe(false);
  });
});
