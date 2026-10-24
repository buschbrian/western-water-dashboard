import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { findReservoir } from "../state/selection";
import { snowStateFromSearch } from "../state/snow-url";
import {
  buildPlaces, foldText, onlyMatch, parsePlaceIndex, placeHref, placeText, searchPlaces,
  type PlaceIndex
} from "./place-search-model";

const INDEX: PlaceIndex = parsePlaceIndex({
  reservoirs: [
    { name: "Lost Creek", state: "OR" },
    { name: "Lost Creek", state: "UT" },
    { name: "Clear Lake", state: "CA" },
    { name: "Clear Lake", state: "OR" },
    { name: "Lake Powell", state: "UT" },
    { name: "Grant Lake", state: null },
    { name: "Lago Bajío", state: "CA" }
  ],
  areas: [
    { level: 2, code: "14", name: "Upper Colorado Region", states: "AZ,CO,NM,UT,WY" },
    { level: 4, code: "1401", name: "Colorado Headwaters", states: "CO,UT" },
    { level: 6, code: "140100", name: "Colorado Headwaters", states: "CO,UT" },
    { level: 6, code: "170501", name: "Middle Snake-Boise", states: "ID,OR" },
    { level: 6, code: "170701", name: "Middle Columbia", states: "OR,WA" },
    { level: 8, code: "14010001", name: "Colorado Headwaters", states: "CO" },
    { level: 8, code: "17050119", name: "Willow", states: "OR" },
    { level: 8, code: "17070104", name: "Willow", states: "OR" },
    { level: 8, code: "14060006", name: "Willow", states: "UT" }
  ],
  sites: [
    { station: "1030:CO:SNTL", name: "Arapaho Ridge", state: "CO" },
    { station: "1031:UT:SNTL", name: "Lost Creek Summit", state: "UT" }
  ]
});
const PLACES = buildPlaces(INDEX);
const texts = (query: string) => searchPlaces(PLACES, query).map(placeText);

describe("the place index", () => {
  it("refuses a file that is not one and drops rows it cannot link", () => {
    expect(() => parsePlaceIndex({ reservoirs: [] })).toThrow();
    expect(parsePlaceIndex({
      reservoirs: [{ name: "" }, { name: "A", state: "UT" }],
      areas: [{ level: 6, code: "1401" }, { level: 4, code: "1401" }],
      sites: [{ name: "No station" }]
    })).toEqual({
      reservoirs: [{ name: "A", state: "UT" }],
      areas: [{ level: 4, code: "1401", name: "1401", states: "" }],
      sites: []
    });
  });
});

describe("matching", () => {
  it("ignores case, accents and punctuation", () => {
    expect(foldText("  Lago  BAJÍO ")).toBe("lago bajio");
    expect(foldText("Middle Snake-Boise")).toBe("middle snake boise");
    expect(texts("bajio")).toEqual(["Lago Bajío · Reservoir · California"]);
    expect(texts("SNAKE boise")).toEqual([
      "Middle Snake-Boise · Basin",
      "Willow · Subbasin · Oregon, in Middle Snake-Boise basin"
    ]);
  });

  it("puts exact names first, then names that start with the query, then the rest", () => {
    expect(texts("lost creek")).toEqual([
      "Lost Creek · Reservoir · Oregon",
      "Lost Creek · Reservoir · Utah",
      "Lost Creek Summit · Snow site · Utah"
    ]);
    expect(texts("lake").slice(0, 2)).toEqual([
      "Lake Powell · Reservoir · Utah", "Clear Lake · Reservoir · California"]);
    expect(texts("owell")).toEqual(["Lake Powell · Reservoir · Utah"]);
  });

  it("matches a name with its place when the query names both", () => {
    expect(texts("lost creek or")).toEqual(["Lost Creek · Reservoir · Oregon"]);
    expect(texts("willow utah")).toEqual(["Willow · Subbasin · Utah"]);
  });

  it("returns at most eight results and nothing for an empty query", () => {
    const many = buildPlaces({
      reservoirs: Array.from({ length: 20 }, (_, i) => ({ name: `Lake ${i}`, state: "UT" })),
      areas: [], sites: []
    });
    expect(searchPlaces(many, "lake")).toHaveLength(8);
    expect(searchPlaces(PLACES, "  ")).toEqual([]);
  });

  it("never opens an ambiguous result on its own", () => {
    expect(onlyMatch(searchPlaces(PLACES, "lost creek"), "lost creek")).toBeNull();
    expect(onlyMatch(searchPlaces(PLACES, "colorado headwaters"), "colorado headwaters"))
      .toBeNull();
    expect(onlyMatch(searchPlaces(PLACES, "lake powell"), "Lake Powell")?.name)
      .toBe("Lake Powell");
    expect(onlyMatch(searchPlaces(PLACES, "arapaho"), "arapaho")?.id).toBe("1030:CO:SNTL");
  });
});

describe("telling places apart", () => {
  it("names each result's type and, where it is known, its state", () => {
    expect(texts("arapaho")).toEqual(["Arapaho Ridge · Snow site · Colorado"]);
    expect(texts("grant")).toEqual(["Grant Lake · Reservoir"]);
    expect(texts("colorado headwaters")).toEqual([
      "Colorado Headwaters · Subregion",
      "Colorado Headwaters · Basin",
      "Colorado Headwaters · Subbasin"
    ]);
  });

  it("adds states, then the containing area, to a shared area name", () => {
    expect(texts("willow")).toEqual([
      "Willow · Subbasin · Oregon, in Middle Columbia basin",
      "Willow · Subbasin · Oregon, in Middle Snake-Boise basin",
      "Willow · Subbasin · Utah"
    ]);
  });

  it("never shows two results that read the same, on the published index", async () => {
    const published = parsePlaceIndex(JSON.parse(await readFile(
      resolve(process.cwd(), "data/assistant/places.json"), "utf8")) as unknown);
    const all = buildPlaces(published).map(placeText);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("links", () => {
  const first = (query: string) => searchPlaces(PLACES, query)[0]!;

  it("opens a reservoir by the label its page resolves, state added only when shared", () => {
    expect(placeHref(first("lake powell"), "snow")).toBe("./reservoir.html?name=Lake%20Powell");
    const [oregon, utah] = searchPlaces(PLACES, "lost creek");
    expect(placeHref(oregon!, "map")).toBe("./reservoir.html?name=Lost%20Creek%2C%20OR");
    expect(placeHref(utah!, "map")).toBe("./reservoir.html?name=Lost%20Creek%2C%20UT");
  });

  it("opens a snow site on the snow page with every state in view", () => {
    const href = placeHref(first("arapaho"), "drought");
    expect(href).toBe("./snow.html?state=all&site=1030%3ACO%3ASNTL");
    expect(snowStateFromSearch(href.split("?")[1]!).site).toBe("1030:CO:SNTL");
  });

  it("opens an area on the page's own topic, with its level unless it is a basin", () => {
    const [subregion, basin, subbasin] = searchPlaces(PLACES, "colorado headwaters");
    expect(placeHref(basin!, "snow")).toBe("./snow.html?state=all&area=140100");
    expect(placeHref(subregion!, "drought")).toBe("./drought.html?state=all&area=1401&level=4");
    expect(placeHref(subbasin!, "overview"))
      .toBe("./overview.html?state=all&area=14010001&level=8");
    expect(placeHref(first("upper colorado"), "map")).toBe("./?state=all&area=14&level=2");
  });

  it("sends an area from a page without areas to the storage map", () => {
    const basin = searchPlaces(PLACES, "colorado headwaters")[1]!;
    for (const page of ["reservoir", "methods", "data", "lakes"] as const) {
      expect(placeHref(basin, page)).toBe("./?state=all&area=140100");
    }
  });
});

describe("the published index", () => {
  it("links every reservoir to exactly the reservoir it names", async () => {
    const published = parsePlaceIndex(JSON.parse(await readFile(
      resolve(process.cwd(), "data/assistant/places.json"), "utf8")) as unknown);
    const reservoirs = buildPlaces(published).filter((place) => place.kind === "reservoir");
    expect(reservoirs.length).toBe(published.reservoirs.length);
    reservoirs.forEach((entry, at) => {
      const name = new URL(placeHref(entry, "map"), "https://x/").searchParams.get("name");
      expect(findReservoir(published.reservoirs, name)).toBe(published.reservoirs[at]);
    });
  });
});
