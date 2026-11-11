import { describe, expect, it } from "vitest";
import { readSnowpackSeasonFixture } from "./data/payload-fixture";
import { validatePrecipitationPayload } from "./data/precip-validate";
import { EMPTY_OPENING_ROSTERS } from "./data/opening-scope";
import { snowPlace } from "./snow-place";
import { precipitationUpstreamPlace, upstreamConditions } from "./upstream-conditions-model";
import { reservoirContext } from "./reservoir-context-model";

const dates = Array.from({ length: 12 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
function inputs() {
  const snow = readSnowpackSeasonFixture();
  const sample = snow.sites[0]!;
  snow.sites = [
    { ...sample, station: "a", late: false, series: dates.map((date) => [date, 0, 1]) },
    { ...sample, station: "b", late: false, series: dates.map((date) => [date, 2, 1]) },
    { ...sample, station: "outside", late: false, series: dates.map((date) => [date, 100, 1]) }
  ];
  const rain = validatePrecipitationPayload({ schema_version: 1, generated_at: "2026-10-13T00:00:00Z",
    as_of: dates.at(-1), water_year: 2027, series_dates: dates,
    sites: ["a", "b", "outside"].map((station) => ({ station, latest_date: dates.at(-1), late: false,
      series_days: dates.map((_, i) => i), series_values: dates.map((_, i) => i * (station === "outside" ? 100 : 1)) })) });
  return { rain, snow };
}

describe("upstream conditions", () => {
  it("means only members and gives each measurement its date and reporting count", () => {
    const { rain, snow } = inputs();
    const view = upstreamConditions(["a", "b", "missing"], rain, snow);
    expect(view.week).toEqual({ inches: 7, sites: 2, date: dates.at(-1) });
    expect(view.season).toEqual({ inches: 11, sites: 2, date: dates.at(-1) });
    expect(view.snow).toEqual({ inches: 1, sites: 2, date: dates.at(-1) });
    expect(view.rainMissing).toBe(1);
    expect(view.snowMissing).toBe(1);
  });
  it("does not turn an empty or screened set into zero precipitation", () => {
    const { rain, snow } = inputs();
    expect(upstreamConditions([], rain, snow)).toMatchObject({ week: null, season: null, snow: null });
    const place = snowPlace(snow, EMPTY_OPENING_ROSTERS, { state: "all", area: null, level: 6 });
    expect(precipitationUpstreamPlace(place, { name: "Held", screen: "no trace" })).toBeNull();
    const narrowed = precipitationUpstreamPlace(place, { name: "Test", upstream_reservoirs: [], upstream_snow_sites: ["a"] });
    expect(narrowed?.stations).toEqual(["a"]);
    expect(narrowed?.payload.sites.map((site) => site.station)).toEqual(["a"]);
  });
  it("aligns 30 days by calendar date and preserves missing inflow and reset days", () => {
    const { rain } = inputs();
    rain.sites[0]!.readings = new Map([...rain.sites[0]!.readings, [dates[5]!, -1]]);
    const context = reservoirContext(["a"], rain, null, null, {
      release: { start: "2026-10-11", end: "2026-10-12", values: [20, 21], source_url: "https://data.usbr.gov/" }
    }, "2026-10-12");
    expect(context.dates).toHaveLength(30);
    expect(context.rows.every((row) => row.values.length === 30)).toBe(true);
    expect(context.rows[0]?.values[23]).toBeNull(); // Oct 6 accumulation fell
    expect(context.rows[1]?.values.every((value) => value === null)).toBe(true); // no Mead proxy
    expect(context.rows[2]?.values.slice(-3)).toEqual([null, 20, 21]);
  });
});
