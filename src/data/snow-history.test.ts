import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateSnowHistory } from "./snow-history";

const read = (file: string): Record<string, any> =>
  JSON.parse(readFileSync(file, "utf8")) as Record<string, any>;

describe("the snow water history file", () => {
  it("validates the committed file against its own header", () => {
    const raw = read("snow_history.json");
    const history = validateSnowHistory(raw);
    expect(history.sites.size).toBe(raw.available_site_count);
    expect(history.last_water_year - history.first_water_year + 1)
      .toBe(raw.sites.find((site: { available: boolean }) => site.available).years.length);
  });

  it("refuses precipitation, a negative snow value and a repeated station", () => {
    expect(() => validateSnowHistory(read("precipitation_history.json"))).toThrow(/measurement/);
    const raw = read("snow_history.json");
    const available = raw.sites.find((site: { available: boolean }) => site.available);
    const negative = structuredClone(raw);
    negative.sites.find((site: { station: string }) => site.station === available.station).years[0][0] = -5;
    expect(() => validateSnowHistory(negative)).toThrow(/invalid snow/);
    const repeated = structuredClone(raw);
    repeated.sites.push(structuredClone(available));
    expect(() => validateSnowHistory(repeated)).toThrow(/repeated/);
  });
});
