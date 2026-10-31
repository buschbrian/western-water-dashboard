/*
 * Hydrologic unit codes as the runtime reads them.
 *
 * Drainage assignment happens in the pipeline (huc.py); every record arrives
 * with its codes already set, so this module only validates and slices them.
 */

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
