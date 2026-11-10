export interface ShareAddress {
  source_station_id: string;
  name: string;
  slug: string;
}

export function validateShareLedger(value: unknown): ShareAddress[] {
  if (!Array.isArray(value)) throw new Error("The share ledger must be a list");
  const stations = new Set<string>();
  const slugs = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry.source_station_id !== "string" || !entry.source_station_id.trim()
      || typeof entry.name !== "string" || !entry.name.trim()
      || typeof entry.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.slug)
      || /^(?:state-|region-|west$)/.test(entry.slug)
      || stations.has(entry.source_station_id) || slugs.has(entry.slug)) {
      throw new Error("Invalid or duplicate permanent share address");
    }
    stations.add(entry.source_station_id);
    slugs.add(entry.slug);
  }
  return value as ShareAddress[];
}
