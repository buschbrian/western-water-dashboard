import { readFile, writeFile, rename, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { validateReservoirPayload } from "../data/validate";
import { validateSnowpackPayload } from "../data/snow-validate";
import { validateDroughtCoverage } from "../data/drought-validate";
import { appendDigest, digestEntry, validateDigestLedger, weekOf, type WeeklyDigestLedger } from "../weekly-digest-model";

function localDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (key: string): string => parts.find((value) => value.type === key)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function writeWeeklyDigest(root: string,
  options: { output?: string; published?: string } = {}): Promise<string> {
  const published = options.published ?? new Date().toISOString();
  const day = localDay(new Date(published));
  const path = options.output ?? resolve(root, "data/weekly-digest.json");
  let ledger: WeeklyDigestLedger;
  try { ledger = validateDigestLedger(JSON.parse(await readFile(path, "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    ledger = { schema_version: 1, entries: [] };
  }
  if (ledger.entries.some((entry) => entry.week === weekOf(day))) {
    return `Weekly digest already captured for this week; ${ledger.entries.length} entries unchanged`;
  }
  async function json(file: string): Promise<unknown> { return JSON.parse(await readFile(resolve(root, file), "utf8")); }
  async function optional<T>(file: string, validate: (value: unknown) => T): Promise<T | null> {
    try { return validate(await json(file)); }
    catch { console.warn(`Weekly digest: ${file} is unavailable; its section will say so`); return null; }
  }
  const payload = validateReservoirPayload(await json("reservoirs.json"));
  const [snow, drought] = await Promise.all([
    optional("snowpack.json", validateSnowpackPayload),
    optional("data/drought/usdm-huc6.json", validateDroughtCoverage)
  ]);
  const next = appendDigest(ledger, digestEntry(payload, snow, drought, day, published));
  if (next === ledger) return `Weekly digest already captured for this week; ${ledger.entries.length} entries unchanged`;
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(next, null, 2) + "\n", "utf8");
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
  return `Captured weekly digest ${next.entries.at(-1)!.week}; ${next.entries.length} frozen entries`;
}
