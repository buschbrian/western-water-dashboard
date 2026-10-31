/*
 * The share frame: what the picture behind a shared link says (ADR-141).
 *
 * `reservoir.html?name=...&view=share` draws one 1200 by 630 frame of the
 * reservoir's name, its surface level with the datum, the reading date and
 * the water-year chart, with no navigation and no map. The deploy opens the
 * frame in a browser and saves it as the image a link card shows.
 *
 * Pure, like every `*-model.ts`. The level and its datum are the words the
 * reservoir page's own level card uses, so the picture cannot say one thing
 * and the page another.
 */
import { describeElevation } from "./reservoir-elevation-model";
import type { ElevationChart } from "./reservoir-elevation-model";
import type { Reservoir } from "./types";
import { formatDate } from "./viz/format";

export const VIEW_PARAM = "view";
export const SHARE_VIEW = "share";

/** The frame is 1200 by 630 pixels, the large link-card size. */
export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 630;

/** The chart is drawn at this many times its size so its type reads on a card. */
export const SHARE_CHART_SCALE = 2;
/** The chart's own height in viewBox units; it is drawn 330 pixels high. */
export const SHARE_CHART_HEIGHT = 165;

/** True when the link asks for the share frame. */
export function isShareView(search: string): boolean {
  return new URLSearchParams(search).get(VIEW_PARAM) === SHARE_VIEW;
}

export interface ShareFrame {
  name: string;
  level: string;
  basis: string;
  readingDate: string;
  caption: string;
}

/** The frame's words, or null for a reservoir with no reviewed surface level. */
export function shareFrame(reservoir: Reservoir, label: string, runDate: string,
  chart: ElevationChart): ShareFrame | null {
  const elevation = reservoir.elevation;
  const view = describeElevation(reservoir, runDate);
  if (!elevation || !view) return null;
  const current = chart.lines.find((line) => line.tier === "current");
  return {
    name: label,
    level: view.card.headline,
    basis: view.card.basis,
    readingDate: `Reading date: ${formatDate(elevation.as_of)}`,
    caption: "Each line is one water year, from October to September."
      + (current ? ` The dark line is ${current.label}.` : "")
  };
}
