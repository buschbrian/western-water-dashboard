export type Topic = "reservoirs" | "snow" | "drought" | "out_of_scope";
export type Operation = "lookup" | "compare" | "list" | "provenance" | "change" | "upstream";

export interface ResolvedIntent {
  topic: Topic;
  operation: Operation;
  entities: string[];
  level: 2 | 4 | 6 | 8 | null;
  unsupported: boolean;
}

export interface AnswerFact {
  label: string;
  value: string | number | null;
}

export interface AnswerSource {
  label: string;
  url: string;
}

export interface DeterministicAnswer {
  answer: string;
  facts: AnswerFact[];
  sources: AnswerSource[];
  followUps: string[];
  link: string;
}

const MAX_ROWS = 25;

function normalized(value: unknown): string {
  return String(value ?? "").toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function number(value: unknown, digits = 0): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("en-US", { maximumFractionDigits: digits })
    : "not available";
}

function entityMatches(record: Record<string, unknown>, entities: readonly string[]): boolean {
  if (entities.length === 0) return true;
  const text = normalized([
    record.name, record.huc6_name, record.county_name, record.state,
    record.operator, record.source_label, record.station, record.huc6
  ].join(" "));
  return entities.some((entity) => text.includes(normalized(entity)));
}

function sourceList(records: readonly Record<string, unknown>[]): AnswerSource[] {
  const found = new Map<string, string>();
  for (const record of records) {
    const label = String(record.source_label ?? "Published dashboard data");
    const url = String(record.source_url ?? "./data.html");
    found.set(`${label}|${url}`, url);
  }
  return [...found.entries()].map(([key, url]) => ({ label: key.split("|")[0]!, url }));
}

function reservoirAnswer(index: Record<string, unknown>, intent: ResolvedIntent): DeterministicAnswer {
  const all = Array.isArray(index.records) ? index.records as Record<string, unknown>[] : [];
  const records = all.filter((record) => entityMatches(record, intent.entities)).slice(0, MAX_ROWS);
  if (records.length === 0) return refusal("No published reservoir matches that name or place.");
  const facts = records.flatMap((record) => [
    { label: `${String(record.name)} storage`, value: number(record.current_storage_af) + " acre-feet" },
    { label: `${String(record.name)} full`, value: number(record.pct_of_capacity, 1) + "%" },
    { label: `${String(record.name)} observation date`, value: String(record.as_of ?? "not available") }
  ]).slice(0, MAX_ROWS);
  const names = records.map((record) => String(record.name));
  const answer = intent.operation === "compare" && records.length >= 2
    ? records.map((record) => `${String(record.name)} is ${number(record.pct_of_capacity, 1)}% full`).join("; ") + "."
    : records.length === 1
      ? `${names[0]} stores ${number(records[0]!.current_storage_af)} acre-feet and is ${number(records[0]!.pct_of_capacity, 1)}% full as of ${String(records[0]!.as_of)}.`
      : `I found ${records.length} published reservoirs: ${names.join(", ")}.`;
  return {
    answer, facts, sources: sourceList(records),
    followUps: ["Compare these reservoirs", "Show the source for this reading"],
    link: records.length === 1
      ? `./reservoir.html?name=${encodeURIComponent(String(records[0]!.source_station_id ?? records[0]!.name))}`
      : "./overview.html"
  };
}

function snowAnswer(index: Record<string, unknown>, intent: ResolvedIntent): DeterministicAnswer {
  const sites = Array.isArray(index.sites) ? index.sites as Record<string, unknown>[] : [];
  const rollups = Array.isArray(index.rollups) ? index.rollups as Record<string, unknown>[] : [];
  const upstream = Array.isArray(index.upstream) ? index.upstream as Record<string, unknown>[] : [];
  if (intent.operation === "upstream") {
    const matches = upstream.filter((record) => entityMatches({
      name: record.reservoir_name, station: record.reservoir_station_id
    }, intent.entities)).slice(0, MAX_ROWS);
    if (matches.length === 0) return refusal("No reviewed upstream snow relationship matches that reservoir.");
    const first = matches[0]!;
    const stationIds = Array.isArray(first.upstream_snow_sites) ? first.upstream_snow_sites : [];
    return {
      answer: `${String(first.reservoir_name)} has ${stationIds.length} snow sites in its reviewed upstream index.`,
      facts: stationIds.slice(0, MAX_ROWS).map((station) => ({ label: "Upstream snow site", value: String(station) })),
      sources: [{ label: "U.S. Geological Survey network-linked drainage index", url: "https://api.water.usgs.gov/nldi" }],
      followUps: ["Show the current snow conditions for this basin"],
      link: `./snow.html?upstream=${encodeURIComponent(String(first.reservoir_station_id))}`
    };
  }
  const candidates = [...rollups, ...sites]
    .filter((record) => entityMatches(record, intent.entities)).slice(0, MAX_ROWS);
  if (candidates.length === 0) return refusal("No current snow site or drainage area matches that request.");
  const facts = candidates.map((record) => ({
    label: String(record.huc6_name ?? record.name),
    value: record.mean_percent_of_normal_median !== undefined
      ? `${number(record.mean_percent_of_normal_median, 1)}% of normal`
      : `${number(record.snow_water_equivalent_inches, 1)} inches`
  }));
  return {
    answer: candidates.length === 1
      ? `${facts[0]!.label} reports ${facts[0]!.value} as of ${String(candidates[0]!.date)}.`
      : `I found ${candidates.length} current snow records for that request.`,
    facts, sources: [{ label: String(index.source ?? "Published snow data"), url: "./data.html" }],
    followUps: ["Which reservoirs are downstream of these sites?"], link: "./snow.html"
  };
}

function droughtAnswer(index: Record<string, unknown>, intent: ResolvedIntent): DeterministicAnswer {
  const level = String(intent.level ?? 6);
  const levels = index.levels as Record<string, Record<string, unknown>> | undefined;
  const current = levels?.[level];
  const units = Array.isArray(current?.units) ? current.units as Record<string, unknown>[] : [];
  const records = units.filter((record) => {
    const code = record[`huc${level}`];
    const name = record[`huc${level}_name`];
    return entityMatches({ huc6: code, huc6_name: name }, intent.entities);
  }).slice(0, MAX_ROWS);
  if (records.length === 0) return refusal("No current drought area matches that name or code.");
  const facts = records.map((record) => {
    const code = String(record[`huc${level}`]);
    const name = String(record[`huc${level}_name`]);
    const cumulative = record.percent_of_area_at_least as Record<string, unknown> | undefined;
    return { label: `${name} (${code}), D3 or worse`, value: `${number(cumulative?.d3, 1)}%` };
  });
  return {
    answer: records.length === 1
      ? `${facts[0]!.label} covers ${facts[0]!.value} of measured land for the map dated ${String(current?.map_date)}.`
      : `I found ${records.length} drought areas for that request.`,
    facts,
    sources: [{ label: "U.S. Drought Monitor", url: "https://droughtmonitor.unl.edu/" }],
    followUps: ["How did this change from last week?", "Show reservoir storage for this area"],
    link: `./drought.html?level=${level}`
  };
}

export function refusal(message: string): DeterministicAnswer {
  return {
    answer: message,
    facts: [], sources: [],
    followUps: ["Ask about current reservoir storage", "Ask about current snow or drought conditions"],
    link: "./data.html"
  };
}

export function answerFromIndex(
  index: Record<string, unknown>, intent: ResolvedIntent
): DeterministicAnswer {
  if (intent.unsupported || intent.topic === "out_of_scope") {
    return refusal("I can answer only from published dashboard facts. I cannot forecast, explain causes, or give water-use advice.");
  }
  if (intent.topic === "reservoirs") return reservoirAnswer(index, intent);
  if (intent.topic === "snow") return snowAnswer(index, intent);
  if (intent.topic === "drought") return droughtAnswer(index, intent);
  return refusal("That question is outside the published dashboard data.");
}

export function validateIntent(value: unknown): ResolvedIntent | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const topics: Topic[] = ["reservoirs", "snow", "drought", "out_of_scope"];
  const operations: Operation[] = ["lookup", "compare", "list", "provenance", "change", "upstream"];
  const entities = Array.isArray(item.entities)
    ? item.entities.filter((entity): entity is string => typeof entity === "string") : [];
  const level = item.level === null || [2, 4, 6, 8].includes(Number(item.level))
    ? item.level as 2 | 4 | 6 | 8 | null : null;
  if (!topics.includes(item.topic as Topic) || !operations.includes(item.operation as Operation)
      || entities.length > 4 || entities.some((entity) => entity.length > 100)
      || typeof item.unsupported !== "boolean") return null;
  return { topic: item.topic as Topic, operation: item.operation as Operation,
    entities, level, unsupported: item.unsupported };
}
