import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sharePages } from "./share-pages";
import { validateReservoirPayload } from "../data/validate";
import { reservoirInState } from "../overview-model";

const daily = validateReservoirPayload(JSON.parse(readFileSync("reservoirs.json", "utf8")));
const payload = { ...daily, withdrawn: [], reviewed_holds: [], reservoirs: [
  { ...daily.reservoirs[0]!, source_station_id: "509", name: "Lake Powell", state: "UT", waterbody_states: ["UT"], huc6: "140700" },
  { ...daily.reservoirs[0]!, source_station_id: "A", name: "Shared water", state: "OR", waterbody_states: ["OR", "ID"], huc6: "170101" }
] };
const ledger = [
  { source_station_id: "509", name: "Lake Powell", slug: "lake-powell" },
  { source_station_id: "A", name: "Shared water", slug: "reservoir-shared" }
];
const regions = [
  { huc2: "14", name: "Upper Colorado Region" },
  { huc2: "15", name: "Lower Colorado Region" },
  { huc2: "16", name: "Great Basin Region" },
  { huc2: "17", name: "Pacific Northwest Region" },
  { huc2: "18", name: "California Region" }
];

describe("permanent share pages", () => {
  it("generates every ledger address and all eleven states, five regions and the West", () => {
    const pages = sharePages(payload, ledger, regions);
    expect(pages).toHaveLength(ledger.length + 17);
    expect(new Set(pages.map((page) => page.slug)).size).toBe(pages.length);
    const powell = pages.find((page) => page.slug === "lake-powell")!;
    expect(powell.destination).toBe("reservoir.html?name=509");
    expect(powell.frame).toBe("reservoir.html?name=509&view=share");
    expect(powell.html).toContain('property="og:image" content="https://buschbrian.github.io/western-water-dashboard/share/lake-powell.png"');
    expect(powell.html).toContain('name="twitter:card" content="summary_large_image"');
  });

  it("keeps a renamed station's address and uses its current label", () => {
    const renamed = structuredClone(payload);
    renamed.reservoirs.find((row) => row.source_station_id === "509")!.name = "New Powell name";
    const page = sharePages(renamed, ledger, regions).find((entry) => entry.slug === "lake-powell")!;
    expect(page.name).toBe("New Powell name");
    expect(page.destination).toBe("reservoir.html?name=509");
  });

  it("keeps a removed station's page without redirecting or publishing a measurement", () => {
    const removed = { ...payload, reservoirs: payload.reservoirs.filter((row) => row.source_station_id !== "509") };
    const page = sharePages(removed, ledger, regions).find((entry) => entry.slug === "lake-powell")!;
    expect(page.frame).toBeNull();
    expect(page.html).toContain("not in the current published data");
    expect(page.html).not.toContain('http-equiv="refresh"');
    expect(page.html).not.toMatch(/\d[\d,.]* (feet|acre-feet)|\d+(\.\d+)?%/);
  });

  it("escapes labels in HTML and refuses unsafe or duplicate addresses", () => {
    const renamed = structuredClone(payload);
    renamed.reservoirs[0]!.name = '<img src=x onerror="bad()">';
    const pages = sharePages(renamed, ledger, regions);
    expect(pages.map((page) => page.html).join("")).not.toContain('<img src=x');
    expect(() => sharePages(payload, [{ source_station_id: "x", name: "x", slug: "../bad" }], [])).toThrow();
    expect(() => sharePages(payload, [...ledger, ledger[0]], [])).toThrow();
  });

  it("uses the charts page's waterbody-state membership for each scope frame", () => {
    const utah = sharePages(payload, ledger, regions).find((page) => page.slug === "state-ut")!;
    const count = payload.reservoirs.filter((row) => reservoirInState(row, "UT")).length;
    expect(utah.frameHtml).toContain(`${count} reservoirs`);
    expect(utah.destination).toBe("overview.html?state=UT");
    expect(utah.frameHtml).toContain("Reading dates:");
    expect(utah.frameHtml).toContain("Lake Powell and Lake Mead are included where they are in this view.");
  });
});
