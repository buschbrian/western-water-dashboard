/*
 * ADR-156: an area total read as seasonal storage, steady pools and flood
 * space. The first block holds the committed payload to it since the first
 * region was ruled (ADR-171): an area with no ruled water is unchanged, and
 * one with a ruled water adds up. The rest drives the split with fixtures.
 */
import { describe, expect, it } from "vitest";
import { readPayload } from "./payload-fixture";
import {
  areaLineOf, asScoped, rollupOfScoped, scopeReservoirs, sizeBasis, statewideRollup,
  type StatewideRollup
} from "./rollup";
import { monthKeys, monthlyRollup } from "./months";
import { isSeasonalStorage } from "./area-line";
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

const characterised = (reservoirs: readonly Reservoir[]): boolean =>
  reservoirs.some((row) => row.operating_character != null);

/* ADR-171 ruled the first region. An area that holds no ruled water gives
 * the total it gave before; one that does splits into lines that add up to
 * its plain total. Nothing here names today's figures. */
describe("only an area holding a ruled water moves (ADR-156, ADR-171)", () => {
  it("carries only reviewed characters, each with an HTTPS source", () => {
    for (const row of rows.filter((entry) => entry.operating_character != null)) {
      expect(["restricted", "run_of_river", "flood_space"], row.name)
        .toContain(row.operating_character!.character);
      expect(row.operating_character!.source_url.startsWith("https://"), row.name).toBe(true);
    }
  });

  it("gives every area with no ruled water, at every level and scope, the total it gave before", () => {
    for (const area of areas()) {
      if (characterised(area.rows)) continue;
      for (const lakePowell of ["include", "exclude"] as const) {
        for (const lakeMead of ["include", "exclude"] as const) {
          for (const baseline of ["recent", "climate"] as const) {
            const options = { lakePowell, lakeMead, baseline,
              minimumBaselineYears: payload.climate_normals?.minimum_years ?? 0 };
            const now = statewideRollup(area.rows, options);
            const plain = plainTotal(scopeReservoirs(area.rows, options));
            const label = `${area.name} ${lakePowell} ${lakeMead} ${baseline}`;
            expect(now, label).toEqual(statewideRollup(withoutCharacters(area.rows), options));
            expect(now.storageAf, label).toBe(plain.storageAf);
            expect(now.percentFull, label).toBe(plain.percentFull);
            expect(now.steadyPools, label).toBeNull();
            expect(now.floodSpace, label).toBeNull();
          }
        }
      }
    }
  });

  it("splits an area holding a ruled water into lines that add up to its plain total", () => {
    for (const area of areas()) {
      if (!characterised(area.rows)) continue;
      const total = rollupOfScoped(asScoped(area.rows));
      const plain = plainTotal(area.rows);
      close(total.storageAf + (total.steadyPools?.storageAf ?? 0) + (total.floodSpace?.storageAf ?? 0),
        plain.storageAf, area.name);
      close(total.capacityAf + (total.steadyPools?.capacityAf ?? 0) + (total.floodSpace?.capacityAf ?? 0),
        plain.capacityAf, area.name);
    }
  });

  it("gives every drainage figure with no ruled water the figure it gave before", () => {
    const plainRows = withoutCharacters(rows);
    for (const level of [2, 4, 6, 8]) {
      const now = storageByArea(rows, level);
      const before = storageByArea(plainRows, level);
      for (const [code, context] of before) {
        const inside = rows.filter((row) => drainageCodeAtLevel(row.huc6, row.huc8, level) === code);
        if (characterised(inside)) continue;
        expect(now.get(code), `${level} ${code}`).toEqual(context);
      }
    }
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
      .some((line) => line.includes("seasonal storage")))
      .toBe(rows.some((row) => !isSeasonalStorage(row)));
  });
});
