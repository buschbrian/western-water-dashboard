/*
 * Hydrologic unit codes as the runtime reads them, and the per-basin rollup.
 *
 * Drainage assignment happens in the pipeline (huc.py); every record arrives
 * with its codes already set, so this module validates and slices them, and
 * totals storage per basin.
 */

import type { NullableNumber, OperatingCharacter } from "../types";
import { isSeasonalStorage } from "./area-line";

/**
 * The shape of a hydrologic unit code, at any level this project reads.
 *
 * Codes are fixed-width and zero-padded, and the levels are the even numbers
 * from 2 to 12 -- a region is two digits, a subregion four, a basin six, and
 * so on down. So the test is "an even count of digits, at most twelve", which
 * also rejects the five- and seven-digit strings that are not a level at all
 * and would otherwise be waved through by a looser `\d+`.
 *
 * One constant because four places were each carrying their own `/^\d{6}$/`,
 * and every one of them would have had to be found again the first time a
 * payload arrived at another level.
 */
export const HUC_CODE = /^(?:\d{2}){1,6}$/;

/**
 * A record's drainage-area code at a drawn level (ADR-103).
 *
 * Coarser than the basin is a slice, because fixed-width codes nest
 * (ADR-050). Finer than the basin is the record's own `huc8` -- a subbasin
 * is a prefix of nothing, so it cannot be sliced out of `huc6` -- and null
 * when the record carries none, so a caller leaves it out rather than
 * filing a six-digit code among eight-digit ones.
 */
export function drainageCodeAtLevel(
  huc6: string | null | undefined,
  huc8: string | null | undefined,
  level: number
): string | null {
  if (level >= 8) return typeof huc8 === "string" && huc8.length === 8 ? huc8 : null;
  if (typeof huc6 !== "string" || huc6.length < level) return null;
  return huc6.slice(0, level);
}

/**
 * The fields a rollup needs. Declared structurally rather than as
 * `Reservoir` so tests can build three-line fixtures, and so a future
 * candidate site that is not yet a published reservoir can be rolled up too.
 */
export interface HucMember {
  name: string;
  huc6?: string | null;
  huc6_name?: string | null;
  current_storage_af: number;
  capacity_af?: NullableNumber;
  record_max_af: number;
  operating_character?: OperatingCharacter | null;
}

export interface HucRollup {
  huc6: string;
  name: string;
  /** Reservoirs counted, after removing duplicates. */
  count: number;
  storageAf: number;
  capacityAf: number;
  /** Capacity-weighted: sum(storage) / sum(capacity). Null with no denominator. */
  percentFull: number | null;
  /** Reservoirs with no capacity and no observed maximum to stand in for one. */
  withoutCapacity: number;
  members: readonly string[];
}

const normalizeName = (name: string): string => name.trim().toLowerCase();

/**
 * The same capacity fallback the rest of the app uses: real capacity where
 * we have it, otherwise the highest storage observed since 2015. A unit
 * whose reservoirs have neither contributes nothing to the denominator, and
 * says so through `withoutCapacity`.
 */
export function capacityBasis(member: HucMember): number {
  return member.capacity_af ?? member.record_max_af;
}

/**
 * Removes duplicate sites by name. A reservoir can arrive twice when a
 * candidate list from the Reclamation facility service is merged with the
 * published inventory; counting it twice would inflate both the storage and
 * the capacity of its unit.
 */
function dedupe(members: readonly HucMember[]): HucMember[] {
  const seen = new Set<string>();
  return members.filter((member) => {
    const key = normalizeName(member.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Members grouped by unit, in first-seen order, skipping the unassigned. */
function groupByHuc(members: readonly HucMember[]): Map<string, HucMember[]> {
  const groups = new Map<string, HucMember[]>();
  for (const member of dedupe(members)) {
    const huc6 = member.huc6;
    if (huc6 === null || huc6 === undefined || huc6 === "") continue;
    const group = groups.get(huc6);
    if (group === undefined) groups.set(huc6, [member]);
    else group.push(member);
  }
  return groups;
}

/**
 * One capacity-weighted total per unit. Label the result "tracked reservoir
 * storage in this drainage area" -- it is not the percentage of all water in
 * the watershed, which is why every row carries its reservoir count and
 * combined capacity.
 */
export function rollupByHuc(members: readonly HucMember[]): HucRollup[] {
  /* Seasonal storage only, like every area total (ADR-156). */
  return [...groupByHuc(members.filter(isSeasonalStorage))].map(([huc6, group]) => {
    const storageAf = group.reduce((total, member) =>
      total + member.current_storage_af, 0);
    const capacityAf = group.reduce((total, member) =>
      total + Math.max(capacityBasis(member), 0), 0);
    return {
      huc6,
      name: group.find((member) => member.huc6_name)?.huc6_name ?? huc6,
      count: group.length,
      storageAf,
      capacityAf,
      percentFull: capacityAf > 0 ? storageAf / capacityAf * 100 : null,
      withoutCapacity: group.filter((member) => capacityBasis(member) <= 0).length,
      members: group.map((member) => member.name)
    };
  }).sort((a, b) => b.capacityAf - a.capacityAf);
}
