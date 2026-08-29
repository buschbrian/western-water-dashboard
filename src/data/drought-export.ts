import { changesByArea, droughtChanges, droughtSeverityIndex } from "../drought-model";
import type { StorageContext } from "../drought-model";
import type { DroughtAtLeast, DroughtCoveragePayload, DroughtUnit } from "../types";
import { serializeCsv, type CsvColumn } from "./export";

interface DroughtExportRow {
  unit: DroughtUnit;
  storage: StorageContext | null;
  previous: DroughtAtLeast | null;
  change: number | null;
}

function measuredShare(unit: DroughtUnit): number {
  if (unit.measured) return unit.measured.percent_of_area;
  return unit.percent_of_area ? 100 : 0;
}

export function droughtCsv(
  payload: DroughtCoveragePayload,
  units: readonly DroughtUnit[],
  storage: ReadonlyMap<string, StorageContext> | null
): string {
  const previous = new Map((payload.previous?.units ?? []).map((unit) => [
    unit.huc6, unit.percent_of_area_at_least
  ]));
  const changes = changesByArea(droughtChanges(units, payload.previous));
  const rows: DroughtExportRow[] = units.map((unit) => ({
    unit,
    storage: storage?.get(unit.huc6) ?? null,
    previous: previous.get(unit.huc6) ?? null,
    change: changes.get(unit.huc6)?.points ?? null
  }));
  const columns: readonly CsvColumn<DroughtExportRow>[] = [
    { header: "Area code", value: ({ unit }) => unit.huc6 },
    { header: "Area name", value: ({ unit }) => unit.huc6_name },
    { header: "Map date", value: () => payload.map_date },
    { header: "Release date", value: () => payload.release_date },
    { header: "Measured share (percent)", value: ({ unit }) => measuredShare(unit) },
    { header: "No drought (percent)", value: ({ unit }) => unit.percent_of_area?.none },
    { header: "D0 (percent)", value: ({ unit }) => unit.percent_of_area?.d0 },
    { header: "D1 (percent)", value: ({ unit }) => unit.percent_of_area?.d1 },
    { header: "D2 (percent)", value: ({ unit }) => unit.percent_of_area?.d2 },
    { header: "D3 (percent)", value: ({ unit }) => unit.percent_of_area?.d3 },
    { header: "D4 (percent)", value: ({ unit }) => unit.percent_of_area?.d4 },
    { header: "D0 or worse (percent)", value: ({ unit }) => unit.percent_of_area_at_least?.d0 },
    { header: "D1 or worse (percent)", value: ({ unit }) => unit.percent_of_area_at_least?.d1 },
    { header: "D2 or worse (percent)", value: ({ unit }) => unit.percent_of_area_at_least?.d2 },
    { header: "D3 or worse (percent)", value: ({ unit }) => unit.percent_of_area_at_least?.d3 },
    { header: "D4 (cumulative percent)", value: ({ unit }) => unit.percent_of_area_at_least?.d4 },
    { header: "Drought severity index", value: ({ unit }) => droughtSeverityIndex(unit) },
    { header: "Previous map date", value: () => payload.previous?.map_date },
    { header: "Previous release date", value: () => payload.previous?.release_date },
    { header: "Previous D0 or worse (percent)", value: ({ previous: item }) => item?.d0 },
    { header: "Previous D1 or worse (percent)", value: ({ previous: item }) => item?.d1 },
    { header: "Previous D2 or worse (percent)", value: ({ previous: item }) => item?.d2 },
    { header: "Previous D3 or worse (percent)", value: ({ previous: item }) => item?.d3 },
    { header: "Previous D4 (percent)", value: ({ previous: item }) => item?.d4 },
    { header: "D3-or-worse change (points)", value: ({ change }) => change },
    { header: "Reservoirs with a full level", value: ({ storage: item }) => item?.reservoirCount },
    { header: "Combined reservoir storage (percent full)", value: ({ storage: item }) => item?.percent }
  ];
  return serializeCsv(rows, columns);
}

export function droughtCsvFilename(mapDate: string, level: number): string {
  return `western-drought-huc${level}-${mapDate.slice(0, 10)}.csv`;
}
