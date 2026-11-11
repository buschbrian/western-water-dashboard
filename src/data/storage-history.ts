import { fetchWithin } from "./fetch";

export interface StorageHistory {
  source_station_id: string;
  name: string;
  source_key: string;
  source_url: string;
  data_frequency: "daily" | "monthly";
  start: string;
  end: string;
  values: (number | null)[];
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function validateStorageHistory(value: unknown, station: string): StorageHistory {
  if (!object(value) || value.source_station_id !== station
      || !["name", "source_key", "source_url"].every((key) => typeof value[key] === "string" && value[key] !== "")
      || !String(value.source_url).startsWith("https://")
      || !["daily", "monthly"].includes(String(value.data_frequency))
      || !date(value.start) || !date(value.end) || !Array.isArray(value.values)) {
    throw new Error("The storage history has no station, source or dated series");
  }
  const count = (Date.parse(value.end) - Date.parse(value.start)) / 86_400_000 + 1;
  if (count < 1 || count !== value.values.length
      || !value.values.every((v) => v === null || (typeof v === "number" && Number.isFinite(v)))
      || !value.values.some((v) => v !== null)) throw new Error("The storage history has invalid daily values");
  return value as unknown as StorageHistory;
}

function header(value: unknown): Record<string, unknown> {
  if (!object(value) || value.schema_version !== 1 || value.unit !== "acre-ft") {
    throw new Error("Unsupported storage history version or unit");
  }
  return value;
}

export function mergeStorageHistory(archive: StorageHistory | null, current: StorageHistory | null): StorageHistory | null {
  if (!archive) return current;
  if (!current) return archive;
  if (archive.source_station_id !== current.source_station_id || archive.source_key !== current.source_key
      || archive.data_frequency !== current.data_frequency || archive.end >= current.start) {
    throw new Error("The storage histories disagree about their station or dates");
  }
  const gap = (Date.parse(current.start) - Date.parse(archive.end)) / 86_400_000 - 1;
  return { ...current, start: archive.start,
    values: [...archive.values, ...Array<null>(gap).fill(null), ...current.values] };
}

export async function loadStorageHistory(station: string | null): Promise<StorageHistory | null> {
  if (!station) return null;
  const base = "./data/storage-history/";
  const read = async (name: string): Promise<unknown> => (await fetchWithin(`${base}${name}`, 30000)).json();
  const [indexRaw, currentRaw] = await Promise.all([read("index.json"), read("current.json")]);
  const index = header(indexRaw);
  const current = header(currentRaw);
  if (!object(index.stations) || !Array.isArray(current.reservoirs)) throw new Error("Incomplete storage history index");
  const location = index.stations[station];
  if (location === undefined) return null;
  if (!object(location) || (location.archive !== null && (typeof location.archive !== "string"
      || !/^[a-f0-9]{64}\.json$/.test(location.archive)))) throw new Error("Invalid storage archive address");
  const matching = current.reservoirs.filter((r) => object(r) && r.source_station_id === station);
  if (matching.length > 1) throw new Error("Duplicate storage history station");
  const present = matching.length ? validateStorageHistory(matching[0], station) : null;
  const archive = location.archive === null ? null : header(await read(location.archive));
  return mergeStorageHistory(archive ? validateStorageHistory(archive.reservoir, station) : null, present);
}
