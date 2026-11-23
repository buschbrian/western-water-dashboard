import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAIN_PREVIEWS, pageSnapshots } from "./page-previews";
import { readDroughtCoverage, readSnowpack, readSnowpackEarlySeasonFixture, readSnowpackSeasonFixture } from "../data/payload-fixture";
import { validatePrecipitationHistory, validatePrecipitationPayload } from "../data/precip-validate";
import { formatInches, precipitationView } from "../precip-model";
import { validateRiverPayload } from "../data/rivers-validate";
import { naturalRiverGauge, riverGauge, riverPayload } from "../data/river-fixture";
import { FLOW_CLASS_WORDS, groupGauges, summaryDate } from "../rivers-model";
import type { RiverGauge } from "../types";
import { headlineFloor, newestFloored, newestHeadline, regionCurve } from "../snow-model";
import { formatDate, formatPercent } from "../viz/format";

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
    const plural = (count: number) => `${count} ${count === 1 ? "gauge" : "gauges"}.`;
    const text = frame.lines.join(" ");
    expect(frame.figure).toBe(`${rivers.gauges.length} river gauges`);
    expect(frame.lines.length).toBeLessThanOrEqual(6);
    expect(frame.lines[0]).toBe(`Newest reading: ${formatDate(summaryDate(rivers.gauges)!)}.`);
    expect(text).toContain(`Compared with normal: ${plural(compared.length)}`);
    expect(text).toContain(`Flow only, with dams upstream: ${plural(shaped.length)}`);
    for (const gauge of rivers.gauges) expect(text).not.toContain(gauge.name);
    for (const [key, word] of Object.entries(FLOW_CLASS_WORDS)) {
      const count = compared.filter((gauge) => gauge.flow_class === key).length;
      if (count) expect(text).toContain(`${word}: ${count}.`);
      else expect(text).not.toContain(`${word}:`);
    }
  });

  it("names each reason a natural gauge is not compared, and uses the singular", () => {
    const frameFor = (gauges: RiverGauge[]) => pageSnapshots({ rivers: riverPayload(gauges) })
      .find((entry) => entry.file === "page-rivers")!.lines;
    const compared = naturalRiverGauge({ source_station_id: "09000001" });
    const short = naturalRiverGauge({ source_station_id: "09000002" }, "ten_years_or_fewer");
    const missing = naturalRiverGauge({ source_station_id: "09000003" }, "percentile_missing");
    const shaped = riverGauge({ source_station_id: "09000004" });

    expect(frameFor([compared, short, missing, shaped])).toEqual([
      `Newest reading: ${formatDate(compared.as_of)}.`,
      "Compared with normal: 1 gauge.",
      "Normal: 1.",
      "Not compared, 10 years of record or fewer: 1 gauge.",
      "Not compared, no normal for this date: 1 gauge.",
      "Flow only, with dams upstream: 1 gauge."
    ]);
    expect(frameFor([compared, shaped]).join(" ")).not.toContain("Not compared");
    expect(frameFor([short, missing, short]).join(" ")).toContain(
      "Compared with normal: 0 gauges. Not compared, 10 years of record or fewer: 2 gauges.");
  });

  it("leaves missing domains with a notice instead of manufacturing measurements", () => {
    const frames = pageSnapshots({});
    expect(frames).toHaveLength(4);
    expect(frames.every((frame) => frame.figure === "Open the page for readings")).toBe(true);
  });
});
