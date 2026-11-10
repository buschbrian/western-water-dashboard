import { isMeasured, worstClassCounts } from "../drought-model";
import { formatInches, precipitationView } from "../precip-model";
import { summaryRow } from "../rivers-model";
import {
  headlineFloor, newestFloored, newestHeadline, normalPeriodLabel,
  percentAmounts, PERCENT_BASIS_SENTENCE, regionCurve
} from "../snow-model";
import type { DroughtCoveragePayload, PrecipitationHistory, PrecipitationPayload, RiverPayload, SnowpackPayload } from "../types";
import { formatDate, formatPercent } from "../viz/format";
import { NO_DROUGHT_LABEL } from "../viz/drought-classes";
import type { FrameContent } from "./share-frame";

export const MAIN_PREVIEWS = [
  { page: "index", image: "west" }, { page: "overview", image: "west" },
  { page: "snow", image: "page-snow" }, { page: "precipitation", image: "page-precipitation" },
  { page: "drought", image: "page-drought" }, { page: "rivers", image: "page-rivers" }
] as const;

export interface SnapshotInputs {
  snow?: SnowpackPayload | null;
  precipitation?: PrecipitationPayload | null;
  precipitationHistory?: PrecipitationHistory | null;
  drought?: DroughtCoveragePayload | null;
  rivers?: RiverPayload | null;
}

export interface PageSnapshot extends FrameContent { file: string }

export function pageSnapshots(input: SnapshotInputs): PageSnapshot[] {
  const frames: PageSnapshot[] = [
    { file: "page-snow", name: "Western snowpack" },
    { file: "page-precipitation", name: "Western precipitation" },
    { file: "page-drought", name: "Western drought" },
    { file: "page-rivers", name: "River flow" }
  ].map((entry) => ({ ...entry, figure: "Open the page for readings", lines: [],
    source: "Western Water Dashboard" }));
  const snow = input.snow;
  if (snow) {
    const points = regionCurve(snow), floor = headlineFloor(snow.site_count, 2);
    const latest = newestHeadline(points, floor);
    const reading = latest ?? newestFloored(points, floor);
    if (reading) {
      const frame = frames[0]!;
      frame.figure = latest ? `${formatPercent(latest.percent)} of normal`
        : reading.meanInches !== null && reading.meanInches !== undefined
          ? `${reading.meanInches.toFixed(1)} inches of snow water` : "Open the page for readings";
      frame.lines = [`Reading date: ${formatDate(reading.date)}.`,
        `${reading.reportingSites} of ${snow.site_count} sites report; at least half are required.`,
        latest ? percentAmounts(latest) ?? "" : "There is too little normal snow for this date to compare against.",
        `Normal uses ${normalPeriodLabel(snow)}.`, latest ? PERCENT_BASIS_SENTENCE : ""].filter(Boolean);
      frame.source = "Readings: Natural Resources Conservation Service";
    }
  }
  if (snow && input.precipitation && input.precipitationHistory) {
    const view = precipitationView(snow.sites.map((site) => site.station), input.precipitation,
      input.precipitationHistory, snow.sites);
    const headline = view.headline;
    if (headline) {
      const frame = frames[1]!;
      frame.figure = `${formatInches(headline.inches)} since 1 October`;
      frame.lines = [`Reading date: ${formatDate(headline.date)}.`,
        `Mean over ${view.stations.length} measurement sites; ${view.late} sites with late data are left out.`,
        `Median for this date: ${formatInches(headline.medianInches)}.`,
        `History: ${view.firstWaterYear} through ${view.lastWaterYear}.`,
        "These gauges measure rain and snow caught at the mountain sites."];
      frame.source = "Readings: Natural Resources Conservation Service";
    }
  }
  if (input.drought) {
    const drought = input.drought, frame = frames[2]!;
    frame.figure = `${drought.units.filter(isMeasured).length} measured areas`;
    frame.lines = [`Map date: ${formatDate(drought.map_date)}. Released ${formatDate(drought.release_date)}.`,
      ...worstClassCounts(drought.units, NO_DROUGHT_LABEL).map((entry) => `${entry.label}: ${entry.count} areas.`),
      "Counts use each area's worst class, over its measured land."];
    frame.source = drought.attribution;
  }
  if (input.rivers) {
    const rivers = input.rivers, frame = frames[3]!;
    frame.figure = `${rivers.gauges.length} river gauges`;
    frame.lines = rivers.gauges.map((gauge) => `${gauge.name}: ${summaryRow(gauge, null).flow} cubic feet per second (${formatDate(gauge.as_of)}).`);
    frame.source = `Readings: U.S. Geological Survey. Daily means; ${rivers.stale_count} ${rivers.stale_count === 1 ? "gauge" : "gauges"} with late data`;
  }
  return frames;
}
