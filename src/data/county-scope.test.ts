import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCountyChoices, loadCountyDrainageScope } from "./county-scope";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("drought county scope", () => {
  it("reads and sorts one state's five-digit county choices", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ features: [
      { attributes: { FIPS: "49051", NAME: "Wasatch County", STATE_ABBR: "UT" } },
      { attributes: { FIPS: "bad", NAME: "Broken", STATE_ABBR: "UT" } },
      { attributes: { FIPS: "49049", NAME: "Utah County", STATE_ABBR: "UT" } }
    ] }), { status: 200 })) as typeof globalThis.fetch;

    await expect(loadCountyChoices("UT", "https://counties.example/0")).resolves.toEqual([
      { fips: "49049", name: "Utah County", state: "UT" },
      { fips: "49051", name: "Wasatch County", state: "UT" }
    ]);
  });

  it("returns intersecting codes and the county's opening box", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://counties.example/0/query")) {
        return new Response(JSON.stringify({ features: [{
          attributes: { FIPS: "49049", NAME: "Utah County", STATE_ABBR: "UT" },
          geometry: { rings: [[[-112, 40], [-111, 40], [-111, 41], [-112, 40]]] }
        }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ features: [
        { attributes: { huc6: "160202" } },
        { attributes: { huc6: "160203" } },
        { attributes: { huc6: "wrong" } }
      ] }), { status: 200 });
    }) as typeof globalThis.fetch;

    const scope = await loadCountyDrainageScope(
      "49049", 6, "https://counties.example/0", "https://watersheds.example/0");
    expect([...scope.codes]).toEqual(["160202", "160203"]);
    expect(scope.box).toEqual([[-112, 40], [-111, 41]]);
  });

  it("fails closed when the service returns an error object", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      error: { message: "Query refused" }
    }), { status: 200 })) as typeof globalThis.fetch;
    await expect(loadCountyChoices("UT", "https://counties.example/0"))
      .rejects.toThrow(/Query refused/);
  });
});
