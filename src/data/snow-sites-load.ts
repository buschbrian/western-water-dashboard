/*
 * The reviewed snow-station inventory, fetched at runtime for optional map
 * context. This is intentionally not `snowpack.json`: a point layer needs
 * stable names and coordinates, not four megabytes of daily series.
 */
import type { SnowSiteInventoryPayload, SnowSiteInventorySite } from "../types";
import { fetchWithin } from "./fetch";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInventorySite(value: unknown): value is SnowSiteInventorySite {
  if (!isObject(value)) return false;
  return typeof value.station === "string" && value.station.length > 0 &&
    typeof value.name === "string" && value.name.length > 0 &&
    typeof value.state === "string" &&
    typeof value.county === "string" &&
    typeof value.lat === "number" && Number.isFinite(value.lat) &&
    value.lat >= -90 && value.lat <= 90 &&
    typeof value.lon === "number" && Number.isFinite(value.lon) &&
    value.lon >= -180 && value.lon <= 180 &&
    typeof value.elevation_feet === "number" && Number.isFinite(value.elevation_feet) &&
    typeof value.begins === "string" &&
    typeof value.huc6 === "string" && value.huc6.length === 6 &&
    typeof value.huc6_name === "string" &&
    (value.provider_huc6 === null || typeof value.provider_huc6 === "string");
}

export function validateSnowSiteInventory(value: unknown): SnowSiteInventoryPayload {
  if (!isObject(value) || !Array.isArray(value.sites)) {
    throw new Error("snow_sites.json must be an object with a sites array");
  }
  if (!Number.isInteger(value.schema_version) || typeof value.retrieved !== "string") {
    throw new Error("snow_sites.json is missing inventory metadata");
  }
  const badSite = value.sites.findIndex((site) => !isInventorySite(site));
  if (badSite >= 0) {
    throw new Error(`Invalid snow site inventory record at index ${badSite}`);
  }
  if (!Number.isInteger(value.site_count) || value.site_count !== value.sites.length) {
    throw new Error("snow_sites.json site_count does not match the sites array");
  }
  const stations = new Set<string>();
  for (const site of value.sites as SnowSiteInventorySite[]) {
    if (stations.has(site.station)) {
      throw new Error(`snow_sites.json repeats station ${site.station}`);
    }
    stations.add(site.station);
  }
  return value as unknown as SnowSiteInventoryPayload;
}

export async function loadSnowSiteInventory(
  timeoutMs: number,
  url = import.meta.env.DEV ? "./snow_sites.json" : "./data/snow_sites.json"
): Promise<SnowSiteInventoryPayload> {
  const response = await fetchWithin(url, timeoutMs);
  return validateSnowSiteInventory(await response.json() as unknown);
}
