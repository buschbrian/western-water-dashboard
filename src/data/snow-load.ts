import type { SnowpackPayload } from "../types";
import { fetchWithin } from "./fetch";
import { validateSnowpackPayload } from "./snow-validate";

/*
 * The snow payload carries a full water year of daily values for every site,
 * about seven times the reservoir file. The reservoir deadline is sized for
 * that smaller file, so this one waits longer before declaring the fetch
 * dead -- but it still has a deadline, because a spinner that cannot resolve
 * is an error the reader is not being told about.
 */
export const SNOW_TIMEOUT_MS = 30000;

export async function loadSnowpack(
  url = import.meta.env.DEV ? "./snowpack.json" : "./data/snowpack.json"
): Promise<SnowpackPayload> {
  const response = await fetchWithin(url, SNOW_TIMEOUT_MS);
  return validateSnowpackPayload(await response.json() as unknown);
}

/** Where a finished season is published: the same path in development and
 * in the build, because the build copies `data/snow/` as it stands. */
export function archivedSeasonUrl(waterYear: number): string {
  return `./data/snow/snowpack-wy${waterYear}.json`;
}

/**
 * One finished season (ADR-121), through the same validator and the same
 * deadline as the current file. A full season is the largest file this page
 * can ask for -- 4.7 MB raw, 365 KB gzipped for 2025-26 -- so nothing calls
 * this on first paint: it runs when the reader chooses that season, or when
 * the season chart is about to be seen.
 *
 * A file that answers for another water year is refused rather than drawn
 * under the wrong season's name.
 */
export async function loadArchivedSeason(waterYear: number): Promise<SnowpackPayload> {
  const payload = await loadSnowpack(archivedSeasonUrl(waterYear));
  if (payload.water_year !== waterYear) {
    throw new Error(`${archivedSeasonUrl(waterYear)} holds water year ${payload.water_year}`);
  }
  return payload;
}
