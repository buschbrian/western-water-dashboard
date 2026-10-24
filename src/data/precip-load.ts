import type { PrecipitationHistory, PrecipitationPayload } from "../types";
import { fetchWithin } from "./fetch";
import { validatePrecipitationHistory, validatePrecipitationPayload } from "./precip-validate";

/* The history is the larger of the two and is not needed to say anything
 * until a reader reaches the card, so it shares the snow file's longer
 * deadline rather than the reservoir one. */
export const PRECIPITATION_TIMEOUT_MS = 30000;

export async function loadPrecipitation(
  url = import.meta.env.DEV ? "./precipitation.json" : "./data/precipitation.json"
): Promise<PrecipitationPayload> {
  const response = await fetchWithin(url, PRECIPITATION_TIMEOUT_MS);
  return validatePrecipitationPayload(await response.json() as unknown);
}

export async function loadPrecipitationHistory(
  url = import.meta.env.DEV ? "./precipitation_history.json" : "./data/precipitation_history.json"
): Promise<PrecipitationHistory> {
  const response = await fetchWithin(url, PRECIPITATION_TIMEOUT_MS);
  return validatePrecipitationHistory(await response.json() as unknown);
}
