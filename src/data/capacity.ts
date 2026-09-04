/*
 * Which full level was the answer on a given date (ADR-111).
 *
 * A reservoir's denominator is not always one number. An owner or regulator
 * can limit a reservoir to less than it physically holds, and a spillway can
 * be enlarged; both are dated, and both would otherwise rewrite history --
 * dividing every earlier month by today's figure makes a restriction that
 * started this year look like it always applied, and reports a reservoir at
 * its allowed limit as 69% full for years it was operated to a different one.
 *
 * The payload carries the versions once per reservoir rather than a
 * denominator on every reading, so provenance stays in one place and the file
 * every reader fetches does not grow by a figure per month (ADR-051). This is
 * the only module that picks between them.
 */

import type { NullableNumber, Reservoir } from "../types";

/**
 * The full level in force on `on` (an ISO date), or null where none is known.
 *
 * The flat `capacity_af` is already the version in force on `as_of`, so a
 * reservoir whose level never changed answers from it and never builds a
 * history it does not have.
 */
export function capacityOn(reservoir: Reservoir, on: string): NullableNumber {
  const versions = reservoir.capacity_history;
  const first = versions?.[0];
  if (!versions || first === undefined) return reservoir.capacity_af;
  /* The versions are contiguous and ordered, and the pipeline has checked
   * that the earliest one is in force by the first reading, so the last
   * version to have started is the one in force. ISO dates compare as text,
   * which is why the payload writes them that way. */
  let found = first;
  for (const version of versions) {
    if (version.effective_from !== null && version.effective_from > on) break;
    found = version;
  }
  return found.capacity_af;
}

/**
 * The same question `sizeBasis` answers, asked about a date.
 *
 * A reservoir with no traceable full level falls back to its highest recorded
 * storage exactly as it does today: that substitution is about the reservoir
 * rather than the date, so it is the same answer for every date.
 */
export function sizeBasisOn(reservoir: Reservoir, on: string): number {
  return capacityOn(reservoir, on) ?? reservoir.record_max_af;
}

/**
 * The last day of a payload month, which is the date its summary describes.
 *
 * A month's storage is a whole month of readings, and a restriction that
 * began inside that month applies to the end of it. ADR-111 puts the month in
 * the interval its month end falls in, so one month is never split between
 * two denominators.
 */
export function monthEndDate(month: string): string {
  const [year, index] = month.split("-");
  const at = Number(index);
  if (!/^\d{4}$/.test(year ?? "") || !Number.isInteger(at) || at < 1 || at > 12) {
    return month;
  }
  const end = new Date(Date.UTC(Number(year), at, 0));
  return end.toISOString().slice(0, 10);
}
