import { describe, expect, it } from "vitest";
import type { DrainageArea } from "./data/boundaries";
import { EMPTY_OPENING_ROSTERS, type OpeningRosters } from "./data/opening-scope";
import { readSnowpackSeasonFixture } from "./data/payload-fixture";
import { siteRows } from "./snow-model";
import { snowPlace } from "./snow-place";

/* Rosters built from the frozen season's own areas, so the test does not
 * depend on today's reference export. */
function rostersFor(): OpeningRosters {
  const payload = readSnowpackSeasonFixture();
  const areas = new Map<string, DrainageArea>();
  for (const site of payload.sites) {
    const area = areas.get(site.huc6) ?? { huc6: site.huc6, name: site.huc6_name, states: "" };
    if (!area.states.split(",").includes(site.state)) {
      area.states = area.states ? `${area.states},${site.state}` : site.state;
    }
    areas.set(site.huc6, area);
  }
  return { ...EMPTY_OPENING_ROSTERS, areas: [...areas.values()] };
}

describe("a place's snow stations, as the snow page scopes them (ADR-128)", () => {
  it("keeps every station in a state, and no other", () => {
    const payload = readSnowpackSeasonFixture();
    const state = payload.sites[0]!.state;
    const place = snowPlace(payload, rostersFor(), { state, area: null, level: 6 });
    const expected = payload.sites.filter((site) => site.state === state).map((site) => site.station);
    expect(place.stations.length).toBeGreaterThan(0);
    expect(new Set(place.stations)).toEqual(new Set(expected));
  });

  it("holds a basin the page groups by, and narrows the stations to it", () => {
    const payload = readSnowpackSeasonFixture();
    const huc6 = payload.sites[0]!.huc6;
    const place = snowPlace(payload, rostersFor(), { state: "all", area: huc6, level: 6 });
    expect(place.area).toBe(huc6);
    expect(place.scope.selection.area).toBe(huc6);
    expect(place.stations).toEqual(siteRows(place.payload, huc6).map((row) => row.station));
    expect(place.stations.every((station) =>
      payload.sites.find((site) => site.station === station)?.huc6 === huc6)).toBe(true);
  });

  it("drops an area that is not published, so the caller can refuse it", () => {
    const payload = readSnowpackSeasonFixture();
    const place = snowPlace(payload, rostersFor(), { state: "all", area: "999999", level: 6 });
    expect(place.scope.selection.area).toBeNull();
  });
});
