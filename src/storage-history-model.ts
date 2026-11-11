import type { StorageHistory } from "./data/storage-history";
import { serializeCsv } from "./data/export";
import { waterYearLabel, waterYearOf, type YearTier } from "./reservoir-elevation-model";
import type { WaterYearPlot } from "./viz/elevation-years";

const DAY = 86_400_000;
const iso = (day: number): string => new Date(day * DAY).toISOString().slice(0, 10);
export const STORAGE_MONTH_STARTS = [[0, "Oct"], [31, "Nov"], [61, "Dec"], [92, "Jan"], [123, "Feb"],
  [152, "Mar"], [183, "Apr"], [213, "May"], [244, "Jun"], [274, "Jul"], [305, "Aug"], [336, "Sep"]] as const;

function calendarPosition(day: string): number {
  const year = Number(day.slice(5, 7)) >= 10 ? 1999 : 2000;
  return (Date.parse(`${year}${day.slice(4)}`) - Date.parse("1999-10-01")) / DAY;
}

export interface StorageYear {
  label: string;
  tier: YearTier;
  points: [number, number | null][];
  highest: number;
  lowest: number;
  last: { date: string; value: number };
}

export interface StorageYears extends WaterYearPlot {
  lines: StorageYear[];
  tickStep: number;
  monthly: boolean;
}

export function storageYears(history: StorageHistory, asOf: string): StorageYears | null {
  const end = history.end < asOf ? history.end : asOf;
  const newest = waterYearOf(asOf);
  const start = Date.parse(history.start) / DAY;
  const lines: StorageYear[] = [];
  for (let year = newest; year >= newest - 5; year -= 1) {
    const opens = Date.parse(`${year - 1}-10-01`) / DAY;
    const closes = Math.min(Date.parse(`${year}-09-30`) / DAY, Date.parse(end) / DAY);
    const points: [number, number | null][] = [];
    let last: StorageYear["last"] | null = null;
    const values: number[] = [];
    for (let day = Math.max(opens, start); day <= closes; day += 1) {
      const value = history.values[day - start] ?? null;
      points.push([calendarPosition(iso(day)), value]);
      if (value !== null) { values.push(value); last = { date: iso(day), value }; }
    }
    if (!last) continue;
    lines.push({ label: waterYearLabel(year), tier: year === newest ? "current"
      : year === newest - 1 ? "previous" : "earlier", points,
    highest: Math.max(...values), lowest: Math.min(...values), last });
  }
  if (!lines.length) return null;
  const values = lines.flatMap((line) => [line.highest, line.lowest]);
  const low = Math.min(...values), high = Math.max(...values);
  const room = Math.max((high - low) * 0.08, high * 0.01, 1);
  const plotLow = low >= 0 ? Math.max(0, low - room) : low - room;
  const plotHigh = high + room;
  const span = plotHigh - plotLow;
  const magnitude = 10 ** Math.floor(Math.log10(span / 5));
  const tickStep = [1, 2, 5, 10].map((m) => m * magnitude).find((s) => span / s <= 5) ?? magnitude * 10;
  return { lines, low: plotLow, high: plotHigh, drawn: [], sharedLabels: [], tickStep,
    monthly: history.data_frequency === "monthly",
    ariaLabel: `Water stored at ${history.name}, in acre-feet, by water year. Each year starts on October 1. `
      + "Gaps have no reading. Values for each year are in the table below." };
}

export function storageHistoryCsv(history: StorageHistory): string {
  const first = Date.parse(history.start) / DAY;
  return serializeCsv(history.values.flatMap((value, index) => value === null ? [] : [{
    date: iso(first + index), storage_af: value
  }]), [
    { header: "date", value: (r) => r.date }, { header: "storage_af", value: (r) => r.storage_af },
    { header: "source_station_id", value: () => history.source_station_id },
    { header: "data_frequency", value: () => history.data_frequency },
    { header: "source_url", value: () => history.source_url }
  ]);
}
