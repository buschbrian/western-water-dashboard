/*
 * The precipitation map (ADR-131): each drainage area filled by the mean of
 * its stations' totals for the window the card's day buttons choose, with
 * every station as a point on the same scale on top -- the snow map's idiom
 * and its colours (`viz/precip-classes.ts`), so the two maps read alike.
 *
 * Loaded only after the recent totals are on screen and the map is near it
 * (`precip-map-section.ts`): the numbers never wait for the map SDK. A new
 * window is a new renderer and new point symbols; nothing is rebuilt.
 *
 * The same map draws the week's soil-moisture change (ADR-142) when the
 * reader turns it to that mode: the same areas and the same points, a new
 * renderer and new symbols, so a phone loads one map and one set of areas
 * for both. Stations with no soil sensors are hidden in that mode.
 */
import ArcGISMap from "@arcgis/core/Map";
import Graphic from "@arcgis/core/Graphic";
import Point from "@arcgis/core/geometry/Point";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";

import {
  createWatershedLayer,
  watershedCodeField,
  WATERSHED_NAME_FIELD
} from "../arcgis/watershed-layers";
import type { DrainageScope } from "../data/boundaries";
import type { PrecipMapValues } from "../precip-map-model";
import { soilNoChangeText, type SoilMapValues } from "../soil-map-model";
import type { SnowSite } from "../types";
import { formatDate } from "../viz/format";
import { PRECIP_CLASSES, PRECIP_NO_VALUE_COLOR, precipClassIndex } from "../viz/precip-classes";
import { SOIL_CLASSES, soilChangeText, soilClassIndex } from "../viz/soil-classes";
import { hitLayerId, type GraphicHit } from "./hit";
import { drainageLabelingInfo } from "./layers";
import { wireMapHover, type HoverResolution } from "./map-hover";
import { followThemeBasemap } from "./theme-basemap";
import { hexRgba, viewReadyWithin, type Rgba, type ViewMapElement } from "./view-map";

const BASIN_LAYER_ID = "precip-basins";
const SITE_LAYER_ID = "precip-sites";
const OUTLINE = { color: "#5b6b7a", width: 0.7 };

export interface PrecipMapStatus {
  /** What the areas and points show: recent precipitation, or the week's soil-moisture change. */
  mode: "rain" | "soil";
  basemap: boolean;
  basemapDegraded: boolean;
  viewReady: boolean;
  basins: number;
  basinsWithValue: number;
  stations: number;
  withValue: number;
  notUsed: number;
}

export interface PrecipMapController {
  status: PrecipMapStatus;
  setValues(values: PrecipMapValues): void;
  setSoilValues(values: SoilMapValues): void;
}

/* Property objects, not constructed symbols: the convention `snow-map.ts`
 * and `ui/layers.ts` record. */
function basinSymbol(meanInches: number | null): unknown {
  const index = precipClassIndex(meanInches);
  return {
    type: "simple-fill",
    color: index < 0 ? [148, 155, 162, 0.12] : hexRgba(PRECIP_CLASSES[index]!.color, 0.5),
    outline: OUTLINE
  };
}

function siteSymbol(inches: number | undefined): unknown {
  const index = precipClassIndex(inches);
  return index < 0
    ? { type: "simple-marker", size: 4, color: hexRgba(PRECIP_NO_VALUE_COLOR, 0.9) as Rgba, outline: { color: "#ffffff", width: 0.5 } }
    : { type: "simple-marker", size: 6, color: hexRgba(PRECIP_CLASSES[index]!.color, 0.95), outline: { color: "#ffffff", width: 0.8 } };
}

/* The steady class is nearly white, so soil points take the area outline's
 * ink rather than a white ring. */
function soilSiteSymbol(points: number | null | undefined): unknown {
  const index = soilClassIndex(points);
  return index < 0
    ? { type: "simple-marker", size: 4, color: hexRgba(PRECIP_NO_VALUE_COLOR, 0.9) as Rgba, outline: { color: "#ffffff", width: 0.5 } }
    : { type: "simple-marker", size: 6, color: hexRgba(SOIL_CLASSES[index]!.color, 0.95), outline: { color: OUTLINE.color, width: 0.8 } };
}

function soilBasinSymbol(meanPoints: number | null): unknown {
  const index = soilClassIndex(meanPoints);
  return {
    type: "simple-fill",
    color: index < 0 ? [148, 155, 162, 0.12] : hexRgba(SOIL_CLASSES[index]!.color, 0.55),
    outline: OUTLINE
  };
}

const percentText = (value: number | null): string => value === null ? "no value" : `${value.toFixed(1)}%`;

const windowWords = (days: number): string => days === 1 ? "the last day" : `the last ${days} days`;
const inchesText = (inches: number): string => inches < 0.05 ? "less than 0.1 in" : `${inches.toFixed(1)} in`;

export async function createPrecipMap(
  element: ViewMapElement,
  card: HTMLElement,
  scope: DrainageScope,
  sites: readonly SnowSite[]
): Promise<PrecipMapController> {
  const { level, areas } = scope;
  const codeField = watershedCodeField(level);
  const basinRenderer = (values: PrecipMapValues | null): unknown => ({
    type: "unique-value",
    field: codeField,
    defaultSymbol: basinSymbol(null),
    uniqueValueInfos: areas.map((area) => ({
      value: area.huc6,
      symbol: basinSymbol(values?.areas.get(area.huc6)?.meanInches ?? null)
    }))
  });
  const soilRenderer = (values: SoilMapValues): unknown => ({
    type: "unique-value",
    field: codeField,
    defaultSymbol: soilBasinSymbol(null),
    uniqueValueInfos: areas.map((area) => ({
      value: area.huc6,
      symbol: soilBasinSymbol(values.areas.get(area.huc6)?.meanPoints ?? null)
    }))
  });
  const basinLayer = createWatershedLayer({
    id: BASIN_LAYER_ID,
    level,
    codes: areas.map((area) => area.huc6),
    renderer: basinRenderer(null),
    labelsVisible: true,
    labelingInfo: drainageLabelingInfo(WATERSHED_NAME_FIELD, level)
  });
  const siteLayer = new GraphicsLayer({ id: SITE_LAYER_ID });
  const siteByStation = new Map(sites.map((site) => [site.station, site]));
  const graphics = new Map<string, Graphic>();
  for (const site of sites) {
    const graphic = new Graphic({
      geometry: new Point({ longitude: site.lon, latitude: site.lat }),
      attributes: { station: site.station }
    });
    graphic.symbol = siteSymbol(undefined) as never;
    graphics.set(site.station, graphic);
    siteLayer.add(graphic);
  }

  const status: PrecipMapStatus = {
    mode: "rain", basemap: false, basemapDegraded: false, viewReady: false,
    basins: areas.length, basinsWithValue: 0,
    stations: graphics.size, withValue: 0, notUsed: graphics.size
  };
  let current: PrecipMapValues | null = null;
  let soil: SoilMapValues | null = null;

  /* The fill is the background and the sites read on top of it. */
  const map = new ArcGISMap({ layers: [basinLayer, siteLayer] });
  await followThemeBasemap(map, (basemapStatus) => {
    status.basemap = basemapStatus.basemap;
    status.basemapDegraded = basemapStatus.degraded;
  });
  element.map = map;

  const controller: PrecipMapController = {
    status,
    setValues(values) {
      current = values;
      soil = null;
      status.mode = "rain";
      basinLayer.renderer = basinRenderer(values) as never;
      for (const [station, graphic] of graphics) {
        graphic.visible = true;
        graphic.symbol = siteSymbol(values.sites.get(station)) as never;
      }
      status.basinsWithValue = areas.filter((area) => (values.areas.get(area.huc6)?.meanInches ?? null) !== null).length;
      status.withValue = [...graphics.keys()].filter((station) => values.sites.has(station)).length;
      status.notUsed = graphics.size - status.withValue;
    },
    setSoilValues(values) {
      soil = values;
      status.mode = "soil";
      basinLayer.renderer = soilRenderer(values) as never;
      for (const [station, graphic] of graphics) {
        graphic.visible = values.sites.has(station);
        graphic.symbol = soilSiteSymbol(values.sites.get(station)?.change_points) as never;
      }
      status.basinsWithValue = areas.filter((area) => (values.areas.get(area.huc6)?.meanPoints ?? null) !== null).length;
      status.withValue = [...graphics.keys()].filter((station) => values.sites.get(station)?.change_points != null).length;
      status.notUsed = graphics.size - status.withValue;
    }
  };

  const soilHover = (results: readonly GraphicHit[], values: SoilMapValues): HoverResolution | null => {
    const week = values.endDate && values.startDate
      ? ` from ${formatDate(values.startDate)} to ${formatDate(values.endDate)}` : "";
    for (const result of results) {
      const attributes = result.graphic?.attributes;
      if (!attributes) continue;
      const layerId = hitLayerId(result);
      if (layerId === SITE_LAYER_ID) {
        const site = siteByStation.get(String(attributes["station"]));
        const reading = site ? values.sites.get(site.station) : undefined;
        if (!site || !reading) continue;
        return {
          content: {
            heading: site.name,
            lines: [
              reading.change_points === null
                ? `No change: ${soilNoChangeText(reading).toLowerCase()}`
                : `${soilChangeText(reading.change_points)}${week}`,
              `Soil water ${percentText(reading.start_percent)} then ${percentText(reading.end_percent)}, `
                + `mean of ${reading.depths_inches.join(", ")} in`,
              `${Math.round(site.elevation_feet).toLocaleString("en-US")} feet, ${site.huc6_name}`
            ]
          },
          graphic: result.graphic
        };
      }
      if (layerId === BASIN_LAYER_ID) {
        const area = values.areas.get(String(attributes[codeField]));
        if (!area) continue;
        return {
          content: {
            heading: String(attributes[WATERSHED_NAME_FIELD]),
            lines: [
              area.meanPoints === null
                ? `Too few stations with a change: ${area.stations} of the ${area.floor} needed`
                : `Mean ${soilChangeText(area.meanPoints)}${week}`,
              `${area.stations} station${area.stations === 1 ? "" : "s"} with a change`
            ]
          },
          graphic: result.graphic
        };
      }
    }
    return null;
  };

  wireMapHover(element, {
    card,
    include: () => [siteLayer, basinLayer],
    resolve: (results: readonly GraphicHit[]): HoverResolution | null => {
      if (soil) return soilHover(results, soil);
      if (!current) return null;
      const end = current.endDate ? `, to ${formatDate(current.endDate)}` : "";
      for (const result of results) {
        const attributes = result.graphic?.attributes;
        if (!attributes) continue;
        const layerId = hitLayerId(result);
        if (layerId === SITE_LAYER_ID) {
          const site = siteByStation.get(String(attributes["station"]));
          if (!site) continue;
          const inches = current.sites.get(site.station);
          return {
            content: {
              heading: site.name,
              lines: [
                inches === undefined
                  ? `No total for ${windowWords(current.window)}: no value on both days, or the gauge total fell`
                  : `${inchesText(inches)} in ${windowWords(current.window)}${end}`,
                `${Math.round(site.elevation_feet).toLocaleString("en-US")} feet, ${site.huc6_name}`
              ]
            },
            graphic: result.graphic
          };
        }
        if (layerId === BASIN_LAYER_ID) {
          const area = current.areas.get(String(attributes[codeField]));
          if (!area) continue;
          return {
            content: {
              heading: String(attributes[WATERSHED_NAME_FIELD]),
              lines: [
                area.meanInches === null
                  ? `Too few stations with a total: ${area.stations} of the ${area.floor} needed`
                  : `Mean ${inchesText(area.meanInches)} in ${windowWords(current.window)}${end}`,
                `${area.stations} station${area.stations === 1 ? "" : "s"} with a total`
              ]
            },
            graphic: result.graphic
          };
        }
      }
      return null;
    }
  });

  await viewReadyWithin(element);
  status.viewReady = Boolean(element.view?.ready);
  return controller;
}
