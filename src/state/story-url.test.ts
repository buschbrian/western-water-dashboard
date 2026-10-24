import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  invalidSentence, reservoirPageHref, snowPageHref, storyPlaceFromSearch,
  storyRequestFromSearch, storyThemeFromSearch, STORY_VIEWS, type StoryInvalid
} from "./story-url";

describe("story view links (ADR-128)", () => {
  it("reads a precipitation view for a state", () => {
    expect(storyRequestFromSearch("?view=precip&state=UT")).toEqual({
      ok: true, view: "precip", place: { state: "UT", area: null, level: 6 }, theme: null
    });
  });

  it("reads an area and its level, with the state left as everywhere", () => {
    expect(storyRequestFromSearch("?view=strip&area=1405&level=4")).toEqual({
      ok: true, view: "strip", place: { state: "all", area: "1405", level: 4 }, theme: null
    });
    expect(storyPlaceFromSearch("?state=CO&area=14010001&level=8"))
      .toEqual({ state: "CO", area: "14010001", level: 8 });
  });

  it("refuses a view it does not have, or none", () => {
    for (const search of ["", "?view=map", "?view=", "?state=UT"]) {
      const request = storyRequestFromSearch(search);
      expect(request.ok).toBe(false);
      if (!request.ok) expect(request.reason).toBe("view");
    }
  });

  it("refuses a place it cannot read, rather than widening to everywhere", () => {
    expect(storyPlaceFromSearch("?view=precip")).toBe("place-missing");
    expect(storyPlaceFromSearch("?state=XX")).toBe("place");
    expect(storyPlaceFromSearch("?state=MX")).toBe("place");
    expect(storyPlaceFromSearch("?area=140")).toBe("place");
    expect(storyPlaceFromSearch("?area=1401000101")).toBe("place");
    expect(storyPlaceFromSearch("?area=abc")).toBe("place");
    expect(storyPlaceFromSearch("?state=UT&level=3")).toBe("place");
    expect(storyPlaceFromSearch("?state=UT&level=x")).toBe("place");
    expect(storyPlaceFromSearch("?state=all")).toEqual({ state: "all", area: null, level: 6 });
  });

  it("reads an upstream view by the reservoir's name or station", () => {
    expect(storyRequestFromSearch("?view=upstream&reservoir=Lake%20Powell")).toEqual({
      ok: true, view: "upstream", reservoir: "Lake Powell", theme: null
    });
    expect(storyRequestFromSearch("?view=upstream&reservoir=%20%20")).toEqual({
      ok: false, view: "upstream", reason: "reservoir-missing", theme: null
    });
  });

  it("reads the theme, and follows the system for anything else", () => {
    expect(storyThemeFromSearch("?theme=light")).toBe("light");
    expect(storyThemeFromSearch("?theme=dark")).toBe("dark");
    expect(storyThemeFromSearch("?theme=system")).toBeNull();
    expect(storyThemeFromSearch("")).toBeNull();
    expect(storyRequestFromSearch("?view=nothing&theme=dark").theme).toBe("dark");
  });

  it("links to the full page with the same place, and always says the state", () => {
    expect(snowPageHref({ state: "UT", area: null, level: 6 })).toBe("snow.html?state=UT");
    expect(snowPageHref({ state: "all", area: "1405", level: 4 }))
      .toBe("snow.html?state=all&area=1405&level=4");
    expect(reservoirPageHref("Lost Creek, OR")).toBe("reservoir.html?name=Lost+Creek%2C+OR");
  });

  it("has one sentence for every reason", () => {
    const reasons: StoryInvalid[] = ["view", "place-missing", "place", "reservoir-missing",
      "reservoir-unknown", "reservoir-not-published"];
    const sentences = reasons.map(invalidSentence);
    expect(new Set(sentences).size).toBe(reasons.length);
    for (const sentence of sentences) expect(sentence).toMatch(/^[A-Z].*\.$/);
    for (const view of STORY_VIEWS) expect(invalidSentence("view")).toContain(view);
  });

  it("is not linked from the site's navigation", async () => {
    const header = await readFile(resolve(process.cwd(), "src/ui/page-header.ts"), "utf8");
    expect(header).not.toContain("story.html");
  });
});
