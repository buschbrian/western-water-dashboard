import { describe, expect, it } from "vitest";
import { embedCode } from "./embed";
import { storyRequestFromSearch } from "./story-url";

describe("story embed code", () => {
  it("keeps a selected place and level, including an explicit everywhere", () => {
    for (const query of ["?view=precip&state=all", "?view=strip&state=UT&area=1405&level=4"]) {
      const request = storyRequestFromSearch(query);
      const code = embedCode(request, "Precipitation");
      expect(code).not.toBeNull();
      const source = /src="([^"]+)"/.exec(code!)![1]!.replaceAll("&amp;", "&");
      const url = new URL(source);
      expect(url.origin).toBe("https://buschbrian.github.io");
      expect(url.pathname).toBe("/western-water-dashboard/story.html");
      expect(storyRequestFromSearch(url.search)).toEqual(request);
      expect(code).toContain('loading="lazy"');
      expect(code).toContain('sandbox="allow-scripts allow-same-origin allow-popups"');
    }
  });

  it("uses the station identity for an upstream view and escapes the iframe title", () => {
    const request = storyRequestFromSearch("?view=upstream&reservoir=509&theme=dark");
    const code = embedCode(request, 'Water above "Powell" <test>')!;
    expect(code).toContain("reservoir=509");
    expect(code).toContain("theme=dark");
    expect(code).toContain('title="Water above &quot;Powell&quot; &lt;test&gt;"');
    expect(code).not.toContain("<test>");
  });

  it("refuses invalid places or views instead of silently widening the embed", () => {
    expect(embedCode(storyRequestFromSearch("?view=precip"), "Test")).toBeNull();
    expect(embedCode(storyRequestFromSearch("?view=strip&state=XX"), "Test")).toBeNull();
  });
});
