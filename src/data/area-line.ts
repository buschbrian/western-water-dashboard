/*
 * Which line of an area total a reservoir is added to (ADR-156).
 *
 * Seasonal storage is ordinary storage and `restricted` storage: both fill and
 * draw down with the seasons, so together they carry the headline percent full
 * and the comparison with normal. A `run_of_river` pool is held at one level by
 * choice, and a `flood_space` basin is kept empty on purpose; a percent full of
 * either is true and says nothing about supply, so each is totalled on its own
 * line. A reservoir's own figures never change (ADR-114).
 *
 * Its own module, with no imports but a type, so every summer can use it
 * without pulling the rollup's dependencies in behind it.
 */
import type { OperatingCharacter } from "../types";

export type AreaLine = "seasonal" | "steady" | "flood";

export interface HasOperatingCharacter {
  operating_character?: OperatingCharacter | null;
}

export function areaLineOf(reservoir: HasOperatingCharacter): AreaLine {
  const character = reservoir.operating_character?.character;
  return character === "run_of_river" ? "steady"
    : character === "flood_space" ? "flood" : "seasonal";
}

export function isSeasonalStorage(reservoir: HasOperatingCharacter): boolean {
  return areaLineOf(reservoir) === "seasonal";
}
