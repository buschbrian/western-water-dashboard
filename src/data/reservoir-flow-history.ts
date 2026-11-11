import { fetchWithin } from "./fetch";
import { validateStorageHistory } from "./storage-history";
import { isReservoirWaterFlow } from "./reservoir-flow";

export interface FlowHistory {
  start: string;
  end: string;
  values: (number | null)[];
  source_url: string;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadReservoirFlowHistory(station: string): Promise<Partial<Record<"inflow" | "release", FlowHistory>>> {
  const response = await fetchWithin("./data/reservoir_flow_history.json");
  const payload: unknown = await response.json();
  if (!object(payload) || payload.schema_version !== 1 || payload.unit !== "ft^3/s" || !Array.isArray(payload.reservoirs)) {
    throw new Error("Invalid reservoir flow history header");
  }
  const matches = payload.reservoirs.filter((row) => object(row) && row.source_station_id === station);
  if (matches.length > 1) throw new Error("Duplicate reservoir flow history");
  const row = matches[0];
  if (!object(row)) return {};
  const result: Partial<Record<"inflow" | "release", FlowHistory>> = {};
  for (const measure of ["inflow", "release"] as const) {
    const entry = row[measure];
    if (entry === undefined) continue;
    if (!object(entry)) throw new Error("Invalid reservoir flow series");
    validateStorageHistory({ ...entry, name: "Reservoir flow", source_station_id: station,
      source_key: "rise", data_frequency: "daily" }, station);
    if (!isReservoirWaterFlow({ unit: "ft^3/s", inflow: null, release: null, inflow_unavailable: null,
      inflow_review_url: null, [measure]: { ...entry, current: 0, as_of: entry.end } }, station)) {
      throw new Error("Unreviewed reservoir flow history");
    }
    if (measure === "release" && (entry.values as (number | null)[]).some((value) => value !== null && value < 0)) {
      throw new Error("Negative release in reservoir flow history");
    }
    result[measure] = entry as unknown as FlowHistory;
  }
  return result;
}
