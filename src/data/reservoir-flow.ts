import type { ReservoirWaterFlow } from "../types";

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isReservoirWaterFlow(value: unknown, station: unknown): value is ReservoirWaterFlow {
  if (!object(value) || !["509", "6124"].includes(String(station)) || value.unit !== "ft^3/s") return false;
  for (const measure of ["inflow", "release"] as const) {
    const entry = value[measure];
    if (entry === null) continue;
    if (!object(entry) || typeof entry.current !== "number" || !Number.isFinite(entry.current)
        || (measure === "release" && entry.current < 0)
        || typeof entry.as_of !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.as_of)
        || !Number.isFinite(Date.parse(entry.as_of)) || new Date(entry.as_of).toISOString().slice(0, 10) !== entry.as_of
        || entry.source_item_id !== (station === "509" ? (measure === "inflow" ? 511 : 4315) : 6125)
        || typeof entry.definition !== "string" || entry.definition.length === 0
        || !["source_url", "definition_url"].every((key) => typeof entry[key] === "string" && entry[key].startsWith("https://"))) return false;
    if (station === "6124" && measure === "inflow") return false;
  }
  if (station === "6124" && (typeof value.inflow_unavailable !== "string" || !value.inflow_unavailable
      || typeof value.inflow_review_url !== "string" || !value.inflow_review_url.startsWith("https://"))) return false;
  return (value.inflow_unavailable === null || typeof value.inflow_unavailable === "string")
    && (value.inflow_review_url === null || (typeof value.inflow_review_url === "string" && value.inflow_review_url.startsWith("https://")));
}
