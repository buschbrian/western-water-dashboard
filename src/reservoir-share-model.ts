/*
 * The share frame: what the picture behind a shared link says (ADR-141).
 *
 * `reservoir.html?name=...&view=share` draws one 1200 by 630 frame of the
 * reservoir's name, its surface level with the datum, the reading date, the
 * water-year chart with its key, and who published the readings and where
 * the page is, with no navigation and no map. A picture travels without its
 * page, so it carries its own source line. The deploy opens the
 * frame in a browser and saves it as the image a link card shows.
 *
 * Pure, like every `*-model.ts`. The level and its datum are the words the
 * reservoir page's own level card uses, so the picture cannot say one thing
 * and the page another.
 */
import { describeElevation } from "./reservoir-elevation-model";
import type { Reservoir } from "./types";
import { formatDate } from "./viz/format";

export const VIEW_PARAM = "view";
export const SHARE_VIEW = "share";

/** The frame is 1200 by 630 pixels, the large link-card size. */
export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 630;

/** The chart is drawn at this many times its size so its type reads on a card. */
export const SHARE_CHART_SCALE = 2;
/** The chart's own height in viewBox units; it is drawn 300 pixels high,
 * which leaves room under it for the key and the source line. */
export const SHARE_CHART_HEIGHT = 150;

/** True when the link asks for the share frame. */
export function isShareView(search: string): boolean {
  return new URLSearchParams(search).get(VIEW_PARAM) === SHARE_VIEW;
}

/** The site's address as a reader types it, for a picture with no link. */
export const SITE_ADDRESS = "buschbrian.github.io/western-water-dashboard";

export interface ShareFrame {
  name: string;
  level: string;
  basis: string;
  readingDate: string;
  /** Who published the readings, and the site's address. */
  source: string;
}

/** The frame's words, or null for a reservoir with no reviewed surface level. */
export function shareFrame(reservoir: Reservoir, label: string, runDate: string): ShareFrame | null {
  const elevation = reservoir.elevation;
  const view = describeElevation(reservoir, runDate);
  if (!elevation || !view) return null;
  return {
    name: label,
    level: view.card.headline,
    basis: view.card.basis,
    readingDate: `Reading date: ${formatDate(elevation.as_of)}`,
    /* Every reviewed level is a Bureau of Reclamation series (ADR-135). */
    source: `Readings: Bureau of Reclamation · ${SITE_ADDRESS}`
  };
}
