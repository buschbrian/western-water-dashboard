import { describe, expect, it } from "vitest";
import {
  searchForSeason,
  seasonFromParam,
  seasonParam,
  snowSearchFromState,
  snowStateFromSearch
} from "./snow-url";

describe("the season in the address bar (ADR-121)", () => {
  it("names a season by its two years and reads it back as a water year", () => {
    expect(seasonParam(2026)).toBe("2025-26");
    expect(seasonFromParam("2025-26")).toBe(2026);
    expect(seasonFromParam("2099-00")).toBe(2100);
    expect(snowStateFromSearch("?season=2025-26").season).toBe(2026);
  });

  it("refuses anything that is not two consecutive years", () => {
    expect(seasonFromParam("2025-27")).toBeNull();
    expect(seasonFromParam("2026")).toBeNull();
    expect(seasonFromParam("2025–26")).toBeNull();
    expect(seasonFromParam(null)).toBeNull();
    expect(snowStateFromSearch("").season).toBeNull();
  });

  it("writes the season only when one is chosen", () => {
    const state = snowStateFromSearch("?area=160201");
    expect(snowSearchFromState(state, "")).toBe("?area=160201");
    expect(snowSearchFromState({ ...state, season: 2026 }, ""))
      .toBe("?area=160201&season=2025-26");
  });

  it("moves to another season keeping the place, and drops the day", () => {
    expect(searchForSeason("?area=160201&day=2026-10-16&site=1%3AUT%3ASNTL", 2026))
      .toBe("?area=160201&site=1%3AUT%3ASNTL&season=2025-26");
    expect(searchForSeason("?season=2025-26&day=2026-03-13&state=UT", null))
      .toBe("?state=UT");
    expect(searchForSeason("", 2026)).toBe("?season=2025-26");
  });
});

describe("snow URL state", () => {
  it("reads a six-digit drainage area and nothing else", () => {
    expect(snowStateFromSearch("?area=160201").area).toBe("160201");
    expect(snowStateFromSearch("?area=abc").area).toBeNull();
    expect(snowStateFromSearch("?area=1602010").area).toBeNull();
    expect(snowStateFromSearch("").area).toBeNull();
  });

  it("reads a well-formed day and refuses anything else", () => {
    expect(snowStateFromSearch("?day=2026-04-01").day).toBe("2026-04-01");
    expect(snowStateFromSearch("?day=April").day).toBeNull();
    expect(snowStateFromSearch("?day=2026-4-1").day).toBeNull();
    expect(snowStateFromSearch("").day).toBeNull();
  });

  it("reads a station identifier and refuses anything else", () => {
    expect(snowStateFromSearch("?site=1030%3ACO%3ASNTL").site).toBe("1030:CO:SNTL");
    expect(snowStateFromSearch("?site=Arapaho+Ridge").site).toBeNull();
    expect(snowStateFromSearch("").site).toBeNull();
  });

  it("reads the reservoir source identifiers used by the upstream index", () => {
    expect(snowStateFromSearch("?upstream=6124").upstream).toBe("6124");
    expect(snowStateFromSearch("?upstream=14335040%3AOR%3ABOR").upstream)
      .toBe("14335040:OR:BOR");
    expect(snowStateFromSearch("?upstream=%2Fbad").upstream).toBeNull();
  });

  /* `?basin=` opens an area's own season card; `?area=` filters the page.
   * The two are separate for the same reason `?site=` is separate from the
   * table's narrowing controls. */
  it("reads a drainage-area code for the season card and refuses others", () => {
    expect(snowStateFromSearch("?basin=160201").basin).toBe("160201");
    expect(snowStateFromSearch("?basin=abc").basin).toBeNull();
    expect(snowStateFromSearch("").basin).toBeNull();
  });

  it("round-trips every reachable state", () => {
    for (const area of ["140100", null]) {
      for (const day of ["2026-04-01", null]) {
        for (const site of ["1030:CO:SNTL", null]) {
          for (const basin of ["160201", null]) {
            for (const upstream of ["6124", null]) {
              for (const season of [2026, null]) {
                const state = { area, day, site, upstream, basin, query: "",
                  band: "all" as const, status: "all" as const, season };
                expect(snowStateFromSearch(snowSearchFromState(state, ""))).toEqual(state);
              }
            }
          }
        }
      }
    }
  });

  it("drops every parameter entirely for the default view", () => {
    expect(snowSearchFromState(
      { area: null, day: null, site: null, upstream: null, basin: null, query: "", band: "all",
        status: "all", season: null },
      "?area=160201&day=2026-04-01&site=1030%3ACO%3ASNTL&basin=140100" +
      "&upstream=6124&q=alta&elev=high&status=late&season=2025-26"))
      .toBe("");
  });

  it("leaves parameters it does not own alone", () => {
    const search = snowSearchFromState(
      { area: "140100", day: null, site: null, upstream: null, basin: null, query: "",
        band: "all", status: "all", season: null },
      "?theme=dark");
    expect(search).toContain("theme=dark");
    expect(search).toContain("area=140100");
    expect(search).not.toContain("day=");
  });

  /* The three table controls. They are separate from `?area=`, which is the
   * shared cross-page vocabulary and changes the whole page; these only
   * narrow the table under it. */
  it("carries a search, an elevation band and a reporting status", () => {
    expect(snowStateFromSearch("?q=alta&elev=high&status=late"))
      .toMatchObject({ query: "alta", band: "high", status: "late" });
  });

  it("falls back to no narrowing for values it does not recognise", () => {
    expect(snowStateFromSearch("?elev=summit&status=broken"))
      .toMatchObject({ band: "all", status: "all" });
  });

  /* A search box is the one field a link can carry arbitrary text in, and
   * the value is only ever a case-insensitive substring test. */
  it("trims and caps the search text", () => {
    expect(snowStateFromSearch("?q=%20%20alta%20%20").query).toBe("alta");
    expect(snowStateFromSearch(`?q=${"x".repeat(200)}`).query).toHaveLength(60);
  });

  it("leaves a whitespace-only search out of the address bar", () => {
    expect(snowSearchFromState(
      { area: null, day: null, site: null, upstream: null, basin: null, query: "   ",
        band: "all", status: "all", season: null }, ""))
      .toBe("");
  });
});
