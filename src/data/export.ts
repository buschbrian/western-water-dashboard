import type { TableRow } from "../state/table";
import type { SiteRow } from "../snow-model";
import type { MonthlyRecord, Reservoir, SourceKey } from "../types";

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => CsvValue;
}

function quoteCsv(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC-4180 rows with a fixed, caller-owned column order. */
export function serializeCsv<Row>(
  rows: readonly Row[], columns: readonly CsvColumn<Row>[]
): string {
  const lines = [
    columns.map((column) => quoteCsv(column.header)),
    ...rows.map((row) => columns.map((column) => quoteCsv(column.value(row))))
  ];
  return `${lines.map((line) => line.join(",")).join("\r\n")}\r\n`;
}

const PROVIDERS: Record<SourceKey, string> = {
  rise: "Bureau of Reclamation",
  awdb: "Natural Resources Conservation Service",
  cdec: "California Department of Water Resources",
  cdss: "Colorado Division of Water Resources",
  usgs: "U.S. Geological Survey",
  srp: "Salt River Project",
  dnrc: "Montana Department of Natural Resources and Conservation",
  cwms: "U.S. Army Corps of Engineers",
  cap: "Central Arizona Project"
};

export function reservoirProvider(reservoir: Reservoir): string {
  return PROVIDERS[reservoir.source_key];
}

export function reservoirIdentifier(reservoir: Reservoir): string | number | null {
  return reservoir.source_station_id ?? reservoir.rise_item_id;
}

export function capacitySource(reservoir: Reservoir): string {
  if (reservoir.capacity_basis === "reclamation_project_record") {
    return "Bureau of Reclamation project record";
  }
  if (reservoir.capacity_basis === "awdb_reservoir_metadata") {
    return "Natural Resources Conservation Service";
  }
  if (reservoir.capacity_basis === "cdec_reservoir_report") {
    return "California Department of Water Resources daily reservoir report";
  }
  if (reservoir.capacity_basis === "srp_reservoir_metadata") {
    return "Salt River Project reservoir record";
  }
  if (reservoir.capacity_basis === "dnrc_stage_metadata") {
    return "Montana Department of Natural Resources and Conservation reservoir record";
  }
  if (reservoir.capacity_basis === "authoritative_water_report") {
    return "Reviewed government or operator water report";
  }
  if (reservoir.capacity_basis === null) return "Not available";
  return "U.S. Army Corps of Engineers National Inventory of Dams";
}

function waterbodyStateText(states: readonly string[] | null | undefined): string {
  return (states ?? []).join("; ");
}

export const OVERVIEW_COLUMNS: readonly CsvColumn<Reservoir>[] = [
  { header: "Reservoir", value: (row) => row.name },
  { header: "State", value: (row) => row.state },
  { header: "Waterbody states", value: (row) => waterbodyStateText(row.waterbody_states) },
  { header: "Drainage area", value: (row) => row.huc6_name },
  { header: "Full (percent)", value: (row) => row.pct_of_capacity },
  { header: "Storage (acre-feet)", value: (row) => row.current_storage_af },
  { header: "Capacity (acre-feet)", value: (row) => row.capacity_af },
  { header: "Observation date", value: (row) => row.as_of },
  { header: "Measured by", value: reservoirProvider },
  { header: "Station or item identifier", value: reservoirIdentifier },
  { header: "Full-level source", value: capacitySource }
];

export function overviewCsv(reservoirs: readonly Reservoir[]): string {
  return serializeCsv(reservoirs, OVERVIEW_COLUMNS);
}

/**
 * The map's table, exported as it stands.
 *
 * Written from the same `TableRow[]` the renderer is handed, so the file
 * cannot contain a different set of reservoirs, a different order or a
 * different month from the rows the reader is looking at -- there is no
 * second query here to get subtly wrong. `Reading` carries the date or the
 * month the two storage columns describe, so a file exported from a past
 * month is not mistaken for today's.
 */
export const TABLE_COLUMNS: readonly CsvColumn<TableRow>[] = [
  { header: "Reservoir", value: (row) => row.reservoirName },
  { header: "State", value: (row) => row.state },
  { header: "Waterbody states", value: (row) => waterbodyStateText(row.waterbodyStates) },
  { header: "Drainage area", value: (row) => row.areaName },
  { header: "Full (percent)", value: (row) => row.percent },
  { header: "Storage (acre-feet)", value: (row) => row.storageAf },
  { header: "Full level (acre-feet)", value: (row) => row.capacityAf },
  { header: "Reading", value: (row) => row.reading },
  { header: "Late data", value: (row) => (row.late ? "yes" : "no") }
];

export function tableCsv(rows: readonly TableRow[]): string {
  return serializeCsv(rows, TABLE_COLUMNS);
}

interface PointGeometry {
  type: "Point";
  /** GeoJSON is longitude first, then latitude, in WGS84. */
  coordinates: [number, number];
}

interface PointFeature<Properties extends object> {
  type: "Feature";
  id: string | number;
  geometry: PointGeometry;
  properties: Properties;
}

function pointFeature<Properties extends object>(
  id: string | number,
  lon: number,
  lat: number,
  properties: Properties
): PointFeature<Properties> {
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties
  };
}

function featureCollection(features: readonly PointFeature<object>[]): string {
  return `${JSON.stringify({ type: "FeatureCollection", features }, null, 2)}\n`;
}

/** The exact reservoir rows on screen, as WGS84 points with raw values. */
export function tableGeoJson(rows: readonly TableRow[]): string {
  return featureCollection(rows.map((row) => pointFeature(
    row.sourceIdentifier ?? row.name,
    row.lon,
    row.lat,
    {
      reservoir: row.reservoirName,
      state: row.state,
      waterbody_states: row.waterbodyStates,
      huc6: row.huc6,
      drainage_area: row.areaName,
      full_percent: row.percent,
      storage_acre_feet: row.storageAf,
      full_level_acre_feet: row.capacityAf,
      reading: row.reading,
      late_data: row.late
    }
  )));
}

/** The exact snow-site rows on screen, as WGS84 points with raw values. */
export function snowSiteGeoJson(rows: readonly SiteRow[]): string {
  return featureCollection(rows.map((row) => pointFeature(
    row.station,
    row.lon,
    row.lat,
    {
      station: row.station,
      name: row.name,
      state: row.state,
      county: row.county,
      huc6: row.huc6,
      drainage_area: row.basinName,
      elevation_feet: row.elevationFeet,
      snow_water_inches: row.inches,
      normal_inches: row.normalInches,
      percent_of_normal: row.percent,
      observed: row.latestDate,
      late_data: row.late
    }
  )));
}

interface HistoryRow {
  reservoir: Reservoir;
  month: MonthlyRecord | null;
}

const HISTORY_COLUMNS: readonly CsvColumn<HistoryRow>[] = [
  { header: "Reservoir", value: ({ reservoir }) => reservoir.name },
  { header: "State", value: ({ reservoir }) => reservoir.state },
  {
    header: "Waterbody states",
    value: ({ reservoir }) => waterbodyStateText(reservoir.waterbody_states)
  },
  { header: "Drainage area", value: ({ reservoir }) => reservoir.huc6_name },
  { header: "Measured by", value: ({ reservoir }) => reservoirProvider(reservoir) },
  {
    header: "Station or item identifier",
    value: ({ reservoir }) => reservoirIdentifier(reservoir)
  },
  { header: "Observation date", value: ({ reservoir }) => reservoir.as_of },
  { header: "Storage (acre-feet)", value: ({ reservoir }) => reservoir.current_storage_af },
  { header: "Capacity (acre-feet)", value: ({ reservoir }) => reservoir.capacity_af },
  { header: "Full (percent)", value: ({ reservoir }) => reservoir.pct_of_capacity },
  { header: "Full-level source", value: ({ reservoir }) => capacitySource(reservoir) },
  { header: "History month", value: ({ month }) => month?.month },
  { header: "Average storage (acre-feet)", value: ({ month }) => month?.mean_af },
  { header: "Lowest storage (acre-feet)", value: ({ month }) => month?.min_af },
  { header: "Highest storage (acre-feet)", value: ({ month }) => month?.max_af },
  { header: "Closing storage (acre-feet)", value: ({ month }) => month?.end_af },
  { header: "Normal (acre-feet)", value: ({ month }) => month?.normal_af },
  { header: "Days with readings", value: ({ month }) => month?.days }
];

/**
 * One reservoir's twelve months, as a file.
 *
 * The name remains the bare published name; state facts sit in their own
 * columns (ADR-089). The download filename may still use a duplicate-safe
 * visible label.
 */
export function reservoirHistoryCsv(reservoir: Reservoir): string {
  const months: readonly (MonthlyRecord | null)[] = reservoir.monthly.length
    ? reservoir.monthly : [null];
  return serializeCsv(
    months.map((month) => ({ reservoir, month })), HISTORY_COLUMNS);
}

function safeFilenamePart(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function overviewCsvFilename(date: string): string {
  return `western-reservoirs-${date.slice(0, 10)}.csv`;
}

export function reservoirGeoJsonFilename(date: string): string {
  return `western-reservoirs-${date.slice(0, 10)}.geojson`;
}

export function snowGeoJsonFilename(date: string): string {
  return `western-snow-sites-${date.slice(0, 10)}.geojson`;
}

/**
 * What one reservoir's file is called.
 *
 * Takes the label, so two reservoirs sharing a name do not produce one
 * filename -- "lost-creek-2026-08-19.csv" downloaded twice is the second
 * file quietly replacing the first, or sitting beside it as a numbered
 * duplicate nothing distinguishes (ADR-066).
 */
export function reservoirCsvFilename(label: string, date: string): string {
  return `${safeFilenamePart(label) || "reservoir"}-${date.slice(0, 10)}.csv`;
}
