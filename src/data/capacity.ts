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

import type { CapacityVersion, NullableNumber, Reservoir } from "../types";

/** Select the number and its provenance together, without extrapolating. */
export function capacityVersionOn(
  reservoir: Pick<Reservoir, "capacity_history">, on: string
): CapacityVersion | null {
  let found: CapacityVersion | null = null;
  for (const version of reservoir.capacity_history ?? []) {
    if (version.effective_from !== null && version.effective_from > on) break;
    found = version;
  }
  return found && (!found.effective_to || on <= found.effective_to) ? found : null;
}

/**
 * The full level in force on `on` (an ISO date), or null where none is known.
 *
 * The flat `capacity_af` is already the version in force on `as_of`, so a
 * reservoir whose level never changed answers from it and never builds a
 * history it does not have.
 */
export function capacityOn(reservoir: Reservoir, on: string): NullableNumber {
  if (reservoir.capacity_history === undefined) return reservoir.capacity_af;
  return capacityVersionOn(reservoir, on)?.capacity_af ?? null;
}

/**
 * The same question `sizeBasis` answers, asked about a date.
 *
 * A reservoir with no traceable full level falls back to its highest recorded
 * storage exactly as it does today: that substitution is about the reservoir
 * rather than the date, so it is the same answer for every date.
 */
export function sizeBasisOn(reservoir: Reservoir, on: string): NullableNumber {
  const capacity = capacityOn(reservoir, on);
  return reservoir.capacity_history === undefined
    ? capacity ?? reservoir.record_max_af : capacity;
}

/** The current month contains no readings after the latest observation. */
export function monthObservationDate(reservoir: Reservoir, month: string): string {
  const end = monthEndDate(month);
  return month === reservoir.as_of.slice(0, 7) && end > reservoir.as_of
    ? reservoir.as_of : end;
}

/**
 * The last day of a payload month, which is the date its summary describes.
 *
 * A month's storage is a whole month of readings, and a month in which the
 * full level changed is divided by the level in force at its end: one month,
 * one denominator, and the one that the month's last reading was taken under.
 * The alternative, publishing no percentage for that month, draws it as a
 * month the reservoir never reported, which is a different fact. The current
 * partial month has no readings after `as_of`, so `monthObservationDate`
 * stops there instead of at a month end that has not happened yet.
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
