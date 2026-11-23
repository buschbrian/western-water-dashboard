import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAIN_PREVIEWS, pageSnapshots } from "./page-previews";
import { readDroughtCoverage, readSnowpack, readSnowpackEarlySeasonFixture, readSnowpackSeasonFixture } from "../data/payload-fixture";
import { validatePrecipitationHistory, validatePrecipitationPayload } from "../data/precip-validate";
import { formatInches, precipitationView } from "../precip-model";
import { validateRiverPayload } from "../data/rivers-validate";
import { FLOW_CLASS_WORDS, groupGauges } from "../rivers-model";
import { headlineFloor, newestFloored, newestHeadline, regionCurve } from "../snow-model";
import { formatPercent } from "../viz/format";

describe("main-page preview pictures", () => {
  it("names all six main pages and reuses the daily West picture for both storage pages", () => {
    expect(MAIN_PREVIEWS.map((entry) => entry.page)).toEqual([
      "index", "overview", "snow", "precipitation", "drought", "rivers"
    ]);
    expect(MAIN_PREVIEWS.slice(0, 2).map((entry) => entry.image)).toEqual(["west", "west"]);
  });

  it("gives each main page matching crawler tags in its static HTML", () => {
    for (const entry of MAIN_PREVIEWS) {
      const html = readFileSync(`${entry.page}.html`, "utf8");
      const image = `https://buschbrian.github.io/western-water-dashboard/share/${entry.image}.png`;
      expect(html).toContain(`<meta property="og:image" content="${image}"`);
      expect(html).toContain(`<meta name="twitter:image" content="${image}"`);
      expect(html).toContain('name="twitter:card" content="summary_large_image"');
      expect(html).toContain('property="og:image:width" content="1200"');
      expect(html).toContain('property="og:image:height" content="630"');
      expect(html.match(/property="og:image"/g)).toHaveLength(1);
    }
  });

  for (const snow of [readSnowpackSeasonFixture(), readSnowpackEarlySeasonFixture()]) {
    it(`keeps the snow page's comparison floor in water year ${snow.water_year}`, () => {
      const frame = pageSnapshots({ snow }).find((entry) => entry.file === "page-snow")!;
      const points = regionCurve(snow);
      const latest = newestHeadline(points, headlineFloor(snow.site_count, 2));
      const reading = latest ?? newestFloored(points, headlineFloor(snow.site_count, 2));
      expect(frame.lines.join(" ")).toContain(reading!.date.slice(0, 4));
      expect(frame.figure).toBe(latest ? `${formatPercent(latest.percent)} of normal`
        : `${reading!.meanInches!.toFixed(1)} inches of snow water`);
    });
  }

  it("uses the published worst-class counts and states the drought map date", () => {
    const drought = readDroughtCoverage();
    const frame = pageSnapshots({ drought }).find((entry) => entry.file === "page-drought")!;
    expect(frame.lines.join(" ")).toContain(drought.map_date.slice(0, 4));
    expect(frame.source).toBe(drought.attribution);
  });

  it("uses the precipitation card's fixed site set and formats the unit once", () => {
    const snow = readSnowpack();
    const precipitation = validatePrecipitationPayload(JSON.parse(readFileSync("precipitation.json", "utf8")));
    const precipitationHistory = validatePrecipitationHistory(JSON.parse(readFileSync("precipitation_history.json", "utf8")));
    const view = precipitationView(snow.sites.map((site) => site.station), precipitation, precipitationHistory, snow.sites);
    const frame = pageSnapshots({ snow, precipitation, precipitationHistory }).find((entry) => entry.file === "page-precipitation")!;
    expect(frame.figure).toBe(view.headline ? `${formatInches(view.headline.inches)} since 1 October` : "Open the page for readings");
    if (view.headline) expect(frame.lines.join(" ")).toContain(`Mean over ${view.stations.length} measurement sites`);
    expect(frame.figure).not.toMatch(/\bin inches\b/);
  });

  it("counts river gauges by the page's groups and classes, in a few lines", () => {
    const rivers = validateRiverPayload(JSON.parse(readFileSync("rivers.json", "utf8")));
    const frame = pageSnapshots({ rivers }).find((entry) => entry.file === "page-rivers")!;
    const { natural, shaped } = groupGauges(rivers.gauges);
    const compared = natural.filter((gauge) => gauge.compared_with_normal);
    const text = frame.lines.join(" ");
    expect(frame.figure).toBe(`${rivers.gauges.length} river gauges`);
    expect(frame.lines.length).toBeLessThanOrEqual(5);
    expect(text).toContain(`Compared with normal: ${compared.length} gauge`);
    expect(text).toContain(`Flow only, with dams upstream: ${shaped.length} gauge`);
    for (const gauge of rivers.gauges) expect(text).not.toContain(gauge.name);
    for (const [key, word] of Object.entries(FLOW_CLASS_WORDS)) {
      const count = compared.filter((gauge) => gauge.flow_class === key).length;
      if (count) expect(text).toContain(`${word}: ${count}.`);
      else expect(text).not.toContain(`${word}:`);
    }
  });

  it("counts natural gauges with no comparison apart, and uses the singular", () => {
    const rivers = validateRiverPayload(JSON.parse(readFileSync("rivers.json", "utf8")));
    const natural = rivers.gauges.find((gauge) => gauge.tier === "natural" && gauge.compared_with_normal);
    const shaped = rivers.gauges.find((gauge) => gauge.tier !== "natural");
    if (!natural || !shaped) return;
    const withheld = { ...natural, compared_with_normal: false, normal_band: null, flow_class: null,
      normal_withheld: "ten_years_or_fewer", short_record: null } as unknown as typeof natural;
    const frame = pageSnapshots({ rivers: { ...rivers, gauges: [natural, withheld, shaped] } })
      .find((entry) => entry.file === "page-rivers")!;
    const text = frame.lines.join(" ");
    expect(text).toContain("Compared with normal: 1 gauge.");
    expect(text).toContain("Not compared, too little record: 1 gauge.");
    expect(text).toContain("Flow only, with dams upstream: 1 gauge.");
  });

  it("leaves missing domains with a notice instead of manufacturing measurements", () => {
    const frames = pageSnapshots({});
    expect(frames).toHaveLength(4);
    expect(frames.every((frame) => frame.figure === "Open the page for readings")).toBe(true);
  });
});
