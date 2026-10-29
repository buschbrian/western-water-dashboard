import type { SoilMoisturePayload } from "../types";
import { fetchWithin } from "./fetch";
import { PRECIPITATION_TIMEOUT_MS } from "./precip-load";
import { validateSoilMoisturePayload } from "./soil-validate";

/* Fetched only when a reader turns the precipitation map to soil moisture
 * (ADR-142), so a reader who never does pays nothing for it. */
export async function loadSoilMoisture(
  url = import.meta.env.DEV ? "./soil_moisture.json" : "./data/soil_moisture.json"
): Promise<SoilMoisturePayload> {
  const response = await fetchWithin(url, PRECIPITATION_TIMEOUT_MS);
  return validateSoilMoisturePayload(await response.json() as unknown);
}
