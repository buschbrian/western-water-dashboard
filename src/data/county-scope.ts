/*
 * County choices and the drainage areas that cross one county, for the
 * drought page's place filter (ADR-091).
 *
 * The weekly drought figures stay keyed by hydrologic unit. A county pick
 * therefore does not invent a county drought total: it asks the same hosted
 * Census boundary service the map already draws, then asks the hosted WBD
 * layer which published units intersect that county. The page still shows
 * each selected drainage area whole and says so beside the controls.
 *
 * Both requests have one deadline. A hosted service is not allowed to turn a
 * filter into a loader that never ends, and a failed county lookup costs the
 * county narrowing rather than the weekly drought figures already in hand.
 */
import { COUNTIES_SERVICE_URL } from "../arcgis/reference-layers";
import {
  DRAWABLE_LEVELS,
  watershedCodeField,
  watershedServiceUrl
} from "../arcgis/watershed-layers";
import type { DrainageAreaBox } from "./boundaries";
import { DATA_TIMEOUT_MS } from "./fetch";
import { isUsStateCode } from "./state-vocabulary";

const COUNTY_NAME_FIELD = "NAME";
const COUNTY_STATE_FIELD = "STATE_ABBR";
const COUNTY_FIPS_FIELD = "FIPS";
const COUNTY_FIPS = /^\d{5}$/;

/* About 110 m at the equator. This generalizes the geometry used only to
 * select whole drainage rows; it is never used to compute a drought share or
 * draw a boundary. The service probe behind ADR-091 reduced Utah County's
 * request from 450 KB to 12 KB without changing its HUC-2/4/6/8 matches. */
const COUNTY_QUERY_OFFSET_DEGREES = "0.001";

export interface CountyChoice {
  fips: string;
  name: string;
  state: string;
}

export interface CountyDrainageScope {
  codes: ReadonlySet<string>;
  box: DrainageAreaBox;
}

interface ArcgisFeature {
  attributes?: Record<string, unknown>;
  geometry?: { rings?: unknown };
}

interface ArcgisResponse {
  error?: { message?: unknown };
  features?: ArcgisFeature[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arcgisResponse(value: unknown, source: string): ArcgisResponse {
  if (!isObject(value)) throw new Error(`${source} returned an unreadable response`);
  if (isObject(value.error)) {
    const message = typeof value.error.message === "string"
      ? value.error.message : "the service refused the query";
    throw new Error(`${source}: ${message}`);
  }
  return value as ArcgisResponse;
}

async function query(
  url: string, init?: RequestInit, timeoutMs = DATA_TIMEOUT_MS
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: "no-cache",
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(`${url} did not answer within ${timeoutMs}ms`);
    }
    throw error;
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} loading ${url}`);
  return response.json() as Promise<unknown>;
}

/** Every county in a chosen state, keyed by five-digit FIPS. */
export async function loadCountyChoices(
  state: string, serviceUrl = COUNTIES_SERVICE_URL
): Promise<CountyChoice[]> {
  if (!isUsStateCode(state)) return [];
  const params = new URLSearchParams({
    where: `${COUNTY_STATE_FIELD}='${state}'`,
    outFields: [COUNTY_FIPS_FIELD, COUNTY_NAME_FIELD, COUNTY_STATE_FIELD].join(","),
    orderByFields: `${COUNTY_NAME_FIELD} ASC`,
    returnGeometry: "false",
    f: "json"
  });
  const value = arcgisResponse(
    await query(`${serviceUrl}/query?${params.toString()}`), "The county service");
  const choices: CountyChoice[] = [];
  for (const feature of value.features ?? []) {
    const attributes = feature.attributes;
    const fips = attributes?.[COUNTY_FIPS_FIELD];
    const name = attributes?.[COUNTY_NAME_FIELD];
    const featureState = attributes?.[COUNTY_STATE_FIELD];
    if (typeof fips !== "string" || !COUNTY_FIPS.test(fips)
      || typeof name !== "string" || name === ""
      || featureState !== state) continue;
    choices.push({ fips, name, state });
  }
  return choices.sort((left, right) => left.name.localeCompare(right.name));
}

function geometryBox(rings: unknown): DrainageAreaBox | null {
  if (!Array.isArray(rings)) return null;
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const ring of rings) {
    if (!Array.isArray(ring)) continue;
    for (const point of ring) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const [x, y] = point as unknown[];
      if (typeof x !== "number" || typeof y !== "number"
        || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      west = Math.min(west, x);
      south = Math.min(south, y);
      east = Math.max(east, x);
      north = Math.max(north, y);
    }
  }
  return [west, south, east, north].every(Number.isFinite)
    ? [[west, south], [east, north]] : null;
}

/**
 * The hydrologic units at `level` whose polygons intersect one county.
 * Returns codes only; every drought share still comes from the committed
 * weekly payload at that same level.
 */
export async function loadCountyDrainageScope(
  fips: string,
  level: number,
  countyServiceUrl = COUNTIES_SERVICE_URL,
  drainageServiceUrl = watershedServiceUrl(level)
): Promise<CountyDrainageScope> {
  if (!COUNTY_FIPS.test(fips)) throw new Error("The county code is not valid");
  if (!DRAWABLE_LEVELS.includes(level)) {
    throw new Error(`Hydrologic level ${level} cannot be queried`);
  }

  const countyParams = new URLSearchParams({
    where: `${COUNTY_FIPS_FIELD}='${fips}'`,
    outFields: [COUNTY_FIPS_FIELD, COUNTY_NAME_FIELD, COUNTY_STATE_FIELD].join(","),
    returnGeometry: "true",
    outSR: "4326",
    maxAllowableOffset: COUNTY_QUERY_OFFSET_DEGREES,
    geometryPrecision: "5",
    f: "json"
  });
  const county = arcgisResponse(
    await query(`${countyServiceUrl}/query?${countyParams.toString()}`),
    "The county service");
  const geometry = county.features?.[0]?.geometry;
  const rings = geometry?.rings;
  const box = geometryBox(rings);
  if (!geometry || !Array.isArray(rings) || !box) {
    throw new Error(`The county service returned no boundary for ${fips}`);
  }

  const codeField = watershedCodeField(level);
  const body = new URLSearchParams({
    where: "1=1",
    geometry: JSON.stringify(geometry),
    geometryType: "esriGeometryPolygon",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: codeField,
    returnGeometry: "false",
    returnDistinctValues: "true",
    f: "json"
  });
  const drainage = arcgisResponse(await query(`${drainageServiceUrl}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  }), "The drainage-area service");
  const codePattern = new RegExp(`^\\d{${level}}$`);
  const codes = new Set<string>();
  for (const feature of drainage.features ?? []) {
    const code = feature.attributes?.[codeField];
    if (typeof code === "string" && codePattern.test(code)) codes.add(code);
  }
  return { codes, box };
}
