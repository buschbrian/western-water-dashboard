import { SITE_ADDRESS } from "./reservoir-share-model";
import {
  describeReservoir, percentFullBasis, providerName,
  type DetailBaseline, type DetailMonth
} from "./state/detail";
import type { BaselineChoice, BaselineId, Reservoir } from "./types";
import { formatAcreFeet, formatDate } from "./viz/format";
import { headlinePercent } from "./viz/symbols";

export interface StorageShareFrame {
  name: string;
  storage: string;
  full: { percent: string; basis: string } | null;
  comparison: DetailBaseline;
  months: readonly DetailMonth[];
  readingDate: string;
  late: string | null;
  source: string;
}

export interface StorageShareInput {
  reservoir: Reservoir;
  label: string;
  baseline: BaselineId;
  choices: readonly BaselineChoice[];
  minimumYears: number;
}

/** The reservoir page's storage figures, ready for a frame without a level. */
export function storageShareFrame(input: StorageShareInput): StorageShareFrame | null {
  const { reservoir, label, baseline, choices, minimumYears } = input;
  if (!Number.isFinite(reservoir.current_storage_af)) return null;
  const view = describeReservoir(reservoir, "", baseline, choices, minimumYears);
  return {
    name: label,
    storage: `${formatAcreFeet(reservoir.current_storage_af)} acre-feet`,
    full: headlinePercent(reservoir) === null ? null
      : { percent: view.percent, basis: percentFullBasis(reservoir) },
    comparison: view.baseline,
    months: view.months,
    readingDate: `Reading date: ${formatDate(reservoir.as_of)}`,
    late: view.late,
    source: `Readings: ${providerName(reservoir)} · ${SITE_ADDRESS}`
  };
}
