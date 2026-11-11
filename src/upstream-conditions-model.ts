import { newestSetDay, SET_SHARE } from "./precip-model";
import { stormTotals } from "./precip-storm-model";
import { payloadForStationSet, regionDepthCurve } from "./snow-model";
import type { SnowPlace } from "./snow-place";
import type { PrecipitationPayload, SnowpackPayload, UpstreamTrace } from "./types";

export const UPSTREAM_CAUTION = "These measurements do not show where the water went. "
  + "They are not reservoir inflow and do not show the cause of a change in storage.";

export interface UpstreamReading {
  inches: number;
  date: string;
  sites: number;
}

export function upstreamConditions(stations: readonly string[], rain: PrecipitationPayload,
  snow: SnowpackPayload): { week: UpstreamReading | null; season: UpstreamReading | null;
    snow: UpstreamReading | null; indexed: number; rainMissing: number; snowMissing: number } {
  const set = new Set(stations);
  const rainSites = rain.sites.filter((site) => set.has(site.station));
  const snowSites = snow.sites.filter((site) => set.has(site.station));
  const totals = stormTotals(stations, rain);
  const week = totals.windows.find((window) => window.days === 7);
  const day = rainSites.length ? newestSetDay(rain.series_dates, rainSites.filter((site) => !site.late)) : undefined;
  const values = day ? rainSites.filter((site) => !site.late).flatMap((site) => {
    const value = site.readings.get(day);
    return value === undefined ? [] : [value];
  }) : [];
  const eligibleSnow = snowSites.filter((site) => !site.late);
  const depths = regionDepthCurve({ ...snow, sites: eligibleSnow });
  const depth = eligibleSnow.length === 0 ? undefined : [...depths].reverse().find((point) =>
    point.reportingSites >= Math.ceil(eligibleSnow.length * SET_SHARE));
  return {
    indexed: stations.length, rainMissing: stations.length - rainSites.length,
    snowMissing: stations.length - snowSites.length,
    week: week?.meanInches !== null && week?.meanInches !== undefined && totals.endDate
      ? { inches: week.meanInches, date: totals.endDate, sites: week.totals.length } : null,
    season: day && values.length ? { inches: values.reduce((sum, value) => sum + value, 0) / values.length,
      date: day, sites: values.length } : null,
    snow: depth ? { inches: depth.meanInches, date: depth.date, sites: depth.reportingSites } : null
  };
}

/** A page-local set intersects the place already resolved by the address bar. */
export function precipitationUpstreamPlace(place: SnowPlace, trace: UpstreamTrace | undefined): SnowPlace | null {
  if (!trace || trace.screen != null) return null;
  const stations = new Set(trace.upstream_snow_sites);
  return { ...place, stations: place.stations.filter((station) => stations.has(station)),
    payload: payloadForStationSet(place.payload, trace.upstream_snow_sites) };
}
