/*
 * The header's "Find a place" search: what it offers, how it matches and
 * where each result goes. Pure, so every rule is tested without a page.
 *
 * The names arrive at runtime in `data/assistant/places.json` (ADR-002),
 * written by `tools/build_assistant_indexes.py`. Every link is one an
 * existing page already reads: `reservoir.html?name=` with the label
 * `reservoirLabel` writes, `?state=all&area=&level=` as the place menus
 * write it (docs/architecture/scopes.md), and the snow page's own `?site=`.
 */
import { DEFAULT_LEVEL } from "../data/boundaries";
import { reservoirLabel } from "../state/selection";
import { isUsStateCode, parseStateList, stateName } from "../data/state-vocabulary";
import type { PageId } from "./page-header";

export const PLACE_INDEX_URL = "./data/assistant/places.json";
export const PLACE_RESULT_LIMIT = 8;

export interface PlaceIndex {
  reservoirs: { name: string; state: string | null }[];
  areas: { level: number; code: string; name: string; states: string }[];
  sites: { station: string; name: string; state: string | null }[];
}

export type PlaceKind = "reservoir" | "area" | "site";

export interface Place {
  kind: PlaceKind;
  name: string;
  /** What the result is, in the words the place menus use. */
  type: string;
  /** Where it is, or null when nothing published says. */
  location: string | null;
  /** The reservoir's link label, the area's code or the site's station. */
  id: string;
  /** Area level, for the link. */
  level?: number;
  /** The folded name, matched against the folded query. */
  key: string;
  /** Name, type and location folded together, for multi-word queries. */
  words: string[];
}

export const AREA_TYPES: Readonly<Record<number, string>> = {
  2: "Region", 4: "Subregion", 6: "Basin", 8: "Subbasin"
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** The fetched file, or a thrown error the search can put in its list. */
export function parsePlaceIndex(value: unknown): PlaceIndex {
  const root = value as Record<string, unknown> | null;
  if (!root || typeof root !== "object" || !Array.isArray(root.reservoirs) ||
    !Array.isArray(root.areas) || !Array.isArray(root.sites)) {
    throw new Error("places.json is not a place index");
  }
  const rows = (list: unknown[]) => list.filter((row): row is Record<string, unknown> =>
    Boolean(row) && typeof row === "object");
  const reservoirs = rows(root.reservoirs).flatMap((row) => {
    const name = text(row.name);
    return name ? [{ name, state: text(row.state) }] : [];
  });
  const areas = rows(root.areas).flatMap((row) => {
    const code = text(row.code);
    const level = Number(row.level);
    if (!code || !/^\d+$/.test(code) || code.length !== level) return [];
    return [{ level, code, name: text(row.name) ?? code, states: text(row.states) ?? "" }];
  });
  const sites = rows(root.sites).flatMap((row) => {
    const station = text(row.station);
    const name = text(row.name);
    return station && name ? [{ station, name, state: text(row.state) }] : [];
  });
  return { reservoirs, areas, sites };
}

/** Case, accents and punctuation do not matter: "Hetch-Hetchy" is "hetch hetchy". */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’.]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function areaStates(states: string): string | null {
  const names = parseStateList(states).filter(isUsStateCode).map(stateName);
  return names.length ? names.join(", ") : null;
}

function place(
  kind: PlaceKind, name: string, type: string, location: string | null,
  id: string, level?: number
): Place {
  const entry: Place = {
    kind, name, type, location, id, key: foldText(name),
    words: foldText([name, type, location ?? ""].join(" ")).split(" ")
  };
  if (level !== undefined) entry.level = level;
  return entry;
}

/** Name, type and location, as a result reads. */
export function placeText(entry: Place): string {
  return [entry.name, entry.type, entry.location].filter(Boolean).join(" · ");
}

/**
 * Every place the search offers, each one told apart from the others.
 *
 * A reservoir and a snow site say their state. An area says nothing more
 * unless another area of its size has its name -- twenty-four subbasins
 * share eleven names -- and then says its states, then the area it lies in.
 * Anything still alike after that gets its identifier, so no two results
 * ever read the same.
 */
export function buildPlaces(index: PlaceIndex): Place[] {
  const areaNames = new Map(index.areas.map((area) => [`${area.level}:${area.code}`, area.name]));
  const repeated = (keys: string[]) => {
    const counts = new Map<string, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    return (key: string) => (counts.get(key) ?? 0) > 1;
  };
  const sharedArea = repeated(index.areas.map((area) => `${area.level}:${area.name}`));
  const areaLocation = (area: PlaceIndex["areas"][number]) =>
    sharedArea(`${area.level}:${area.name}`) ? areaStates(area.states) : null;
  const sharedAreaLocation = repeated(index.areas.map((area) =>
    `${area.level}:${area.name}:${areaLocation(area) ?? ""}`));

  const places: Place[] = [
    ...index.reservoirs.map((reservoir) => place("reservoir", reservoir.name, "Reservoir",
      reservoir.state ? stateName(reservoir.state) : null,
      reservoirLabel(reservoir, index.reservoirs))),
    ...index.areas.map((area) => {
      let location = areaLocation(area);
      if (sharedAreaLocation(`${area.level}:${area.name}:${location ?? ""}`)) {
        const parentLevel = area.level - 2;
        const parent = areaNames.get(`${parentLevel}:${area.code.slice(0, parentLevel)}`);
        const parentType = AREA_TYPES[parentLevel];
        /* Region names already end in "Region". */
        const within = parent && parentType
          ? parentType === "Region" ? `in ${parent}` : `in ${parent} ${parentType.toLowerCase()}`
          : null;
        location = [location, within].filter(Boolean).join(", ") || null;
      }
      return place("area", area.name, AREA_TYPES[area.level] ?? "Drainage area",
        location, area.code, area.level);
    }),
    ...index.sites.map((site) => place("site", site.name, "Snow site",
      site.state ? stateName(site.state) : null, site.station))
  ];
  const stillAlike = repeated(places.map(placeText));
  return places.map((entry) => stillAlike(placeText(entry))
    ? { ...entry, location: [entry.location, entry.id].filter(Boolean).join(", ") }
    : entry);
}

/** How well a place answers a query: lower is better, null is no match. */
export function matchRank(entry: Place, query: string): number | null {
  if (!query) return null;
  if (entry.key === query) return 0;
  if (entry.key.startsWith(query)) return 1;
  if (entry.key.split(" ").some((word) => word.startsWith(query))) return 2;
  if (entry.key.includes(query)) return 3;
  /* "lost creek oregon": every word of the query starts a word of the
   * name, the type or the place. */
  const parts = query.split(" ");
  if (parts.length > 1 && parts.every((part) =>
    entry.words.some((word) => word.startsWith(part)))) return 4;
  return null;
}

const KIND_ORDER: Readonly<Record<PlaceKind, number>> = { reservoir: 0, area: 1, site: 2 };

/** Exact names first, then names that start with the query, then the rest. */
export function searchPlaces(
  places: readonly Place[], query: string, limit = PLACE_RESULT_LIMIT
): Place[] {
  const folded = foldText(query);
  if (!folded) return [];
  return places
    .flatMap((entry) => {
      const rank = matchRank(entry, folded);
      return rank === null ? [] : [{ entry, rank }];
    })
    .sort((a, b) => a.rank - b.rank ||
      a.entry.name.length - b.entry.name.length ||
      a.entry.name.localeCompare(b.entry.name) ||
      KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind] ||
      (a.entry.level ?? 0) - (b.entry.level ?? 0) ||
      (a.entry.location ?? "").localeCompare(b.entry.location ?? ""))
    .slice(0, limit)
    .map(({ entry }) => entry);
}

/**
 * The one result Enter may open without the reader choosing it, or null.
 *
 * Only a query with a single answer: one result, or one result whose name is
 * exactly what was typed. Two Lost Creeks are two answers, and opening the
 * first would answer a question the reader did not ask.
 */
export function onlyMatch(results: readonly Place[], query: string): Place | null {
  if (results.length === 1) return results[0]!;
  const folded = foldText(query);
  const exact = results.filter((entry) => entry.key === folded);
  return exact.length === 1 ? exact[0]! : null;
}

/** Pages that draw a drainage area; the others send an area to the storage map. */
const AREA_PAGES: Partial<Record<PageId, string>> = {
  map: "./", overview: "./overview.html", snow: "./snow.html", drought: "./drought.html"
};

/** Where a result goes from the page the reader is on. */
export function placeHref(entry: Place, current: PageId): string {
  if (entry.kind === "reservoir") {
    return `./reservoir.html?name=${encodeURIComponent(entry.id)}`;
  }
  if (entry.kind === "site") {
    return `./snow.html?state=all&site=${encodeURIComponent(entry.id)}`;
  }
  const page = AREA_PAGES[current] ?? "./";
  const level = entry.level ?? entry.id.length;
  return `${page}?state=all&area=${encodeURIComponent(entry.id)}` +
    (level === DEFAULT_LEVEL ? "" : `&level=${level}`);
}
