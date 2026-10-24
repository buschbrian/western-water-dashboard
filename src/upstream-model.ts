/*
 * What is above a reservoir, as storage rather than a list of names
 * (ADR-127). Pure, so it is tested without a browser.
 *
 * The upstream set is the committed trace (ADR-077). Nothing here measures
 * anything new: each total is `rollupOfScoped`, the same sum of acre-feet
 * over the same full levels the storage map uses for a drainage area, applied
 * to the set the trace names. Rows are grouped by the drainage area each
 * reservoir sits in, largest store of water first, so Lake Powell's
 * sixty-odd upstream reservoirs read as a handful of basins.
 */
import { asScoped, percentFull, rollupOfScoped, sizeBasis, type StatewideRollup } from "./data/rollup";
import type { Reservoir } from "./types";

export interface UpstreamRow {
  reservoir: Reservoir;
  label: string;
  /** Percent of the reservoir's full level, or of its highest recorded storage. */
  percent: number | null;
}

export interface UpstreamGroup {
  code: string;
  name: string;
  rows: UpstreamRow[];
  rollup: StatewideRollup;
}

export interface UpstreamSummary {
  rows: UpstreamRow[];
  groups: UpstreamGroup[];
  rollup: StatewideRollup;
  /** Stations the trace names that today's roster does not publish. */
  notPublished: number;
}

/** Fewer rows than this are listed as they are; more are grouped by basin. */
export const GROUP_AFTER = 8;

export function upstreamSummary(
  stations: readonly string[], roster: readonly Reservoir[],
  label: (reservoir: Reservoir) => string
): UpstreamSummary {
  const byStation = new Map(roster
    .filter((reservoir) => reservoir.source_station_id)
    .map((reservoir) => [reservoir.source_station_id as string, reservoir]));
  const found = stations
    .map((station) => byStation.get(station))
    .filter((reservoir): reservoir is Reservoir => reservoir !== undefined);
  const bySize = (a: UpstreamRow, b: UpstreamRow): number =>
    sizeBasis(b.reservoir) - sizeBasis(a.reservoir) || a.label.localeCompare(b.label);
  const rows = found
    .map((reservoir) => ({ reservoir, label: label(reservoir), percent: percentFull(reservoir) }))
    .sort(bySize);

  const grouped = new Map<string, UpstreamRow[]>();
  for (const row of rows) {
    const code = row.reservoir.huc6 ?? "";
    const bucket = grouped.get(code);
    if (bucket) bucket.push(row);
    else grouped.set(code, [row]);
  }
  const groups = [...grouped.entries()]
    .map(([code, members]) => ({
      code,
      name: members[0]?.reservoir.huc6_name || "Drainage area not known",
      rows: members,
      rollup: rollupOfScoped(asScoped(members.map((row) => row.reservoir)))
    }))
    .sort((a, b) => b.rollup.storageAf - a.rollup.storageAf || a.name.localeCompare(b.name));

  return {
    rows,
    groups,
    rollup: rollupOfScoped(asScoped(found)),
    notPublished: stations.length - found.length
  };
}
