import { describe, expect, it } from "vitest";
import { validateSnowSiteInventory } from "./snow-sites-load";

const site = {
  station: "1030:CO:SNTL",
  name: "Arapaho Ridge",
  state: "CO",
  county: "Grand",
  lat: 40.35098,
  lon: -106.38141,
  elevation_feet: 10_960,
  begins: "2002-08-01",
  huc6: "140100",
  huc6_name: "Colorado Headwaters",
  provider_huc6: "140100"
};

describe("the reviewed snow-site inventory", () => {
  it("accepts the small point-context contract", () => {
    const inventory = validateSnowSiteInventory({
      schema_version: 1,
      retrieved: "2026-08-18",
      site_count: 1,
      sites: [site]
    });
    expect(inventory.sites[0]?.station).toBe(site.station);
  });

  it("refuses a count that would make readiness overstate the layer", () => {
    expect(() => validateSnowSiteInventory({
      schema_version: 1,
      retrieved: "2026-08-18",
      site_count: 2,
      sites: [site]
    })).toThrow(/site_count/);
  });

  it("refuses duplicate station identities", () => {
    expect(() => validateSnowSiteInventory({
      schema_version: 1,
      retrieved: "2026-08-18",
      site_count: 2,
      sites: [site, { ...site }]
    })).toThrow(/repeats station/);
  });
});
