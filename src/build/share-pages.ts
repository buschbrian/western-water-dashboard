import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { asScoped, rollupOfScoped } from "../data/rollup";
import { stateName } from "../data/state-vocabulary";
import { validateReservoirPayload } from "../data/validate";
import { reservoirInState } from "../overview-model";
import { SITE_ADDRESS } from "../reservoir-share-model";
import { baselineChoices, periodLabel } from "../state/baseline";
import { describeAreaSplit } from "../state/storage-summary";
import { creditLine } from "../state/figures-text";
import { providerName } from "../state/detail";
import { reservoirLabel } from "../state/selection";
import { validateShareLedger } from "../share-ledger";
import type { Region, Reservoir, ReservoirPayload } from "../types";
import { formatAcreFeet, formatDate, formatPercent } from "../viz/format";
import { escapeHtml as escape, shareFrameDocument } from "./share-frame";
import { pageSnapshots } from "./page-previews";
import { writeWeeklyPages } from "./weekly-pages";
import { validateSnowpackPayload } from "../data/snow-validate";
import { validatePrecipitationHistory, validatePrecipitationPayload } from "../data/precip-validate";
import { validateDroughtCoverage } from "../data/drought-validate";
import { validateRiverPayload } from "../data/rivers-validate";

const BASE = `https://${SITE_ADDRESS}`;
const STATES = ["AZ", "CA", "CO", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"];

export interface SharePage {
  slug: string;
  name: string;
  destination: string;
  frame: string | null;
  html: string;
  frameHtml: string | null;
  kind: "reservoir" | "scope";
}

function pageHtml(slug: string, name: string, destination: string, current: boolean, policy: string): string {
  const title = `${name} — Western Water Dashboard`;
  const description = current ? `Readings, dates and sources for ${name}. Open the page for the current figures.`
    : `${name} is not in the current published data. No current water figure is shown.`;
  const target = `../${destination}`;
  const image = `${BASE}/share/${slug}.png`;
  const alt = `${name} on the Western Water Dashboard. A dated chart when available; otherwise open the page for readings.`;
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="${escape(policy)}" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
${current ? `<meta http-equiv="refresh" content="0; url=${escape(target)}" />` : ""}
<link rel="icon" type="image/svg+xml" href="../favicon.svg" />
<link rel="canonical" href="${escape(`${BASE}/${destination}`)}" />
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Western Water Dashboard" />
<meta property="og:title" content="${escape(title)}" />
<meta property="og:description" content="${escape(description)}" />
<meta property="og:url" content="${BASE}/share/${slug}.html" />
<meta property="og:image" content="${image}" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${escape(alt)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escape(title)}" />
<meta name="twitter:description" content="${escape(description)}" />
<meta name="twitter:image" content="${image}" />
<meta name="twitter:image:alt" content="${escape(alt)}" />
<style>body{margin:0;padding:3rem 1.25rem;background:#f3eee6;color:#2f342f;font-family:Arial,sans-serif;line-height:1.5}main{max-width:36rem;margin:auto}a{color:#356b6f}</style>
</head><body><main><h1>${escape(name)}</h1><p>${escape(description)}</p>
<p><a href="${escape(target)}">Open the dashboard page for ${escape(name)}</a>.</p></main></body></html>\n`;
}

function scopeFrame(name: string, rows: Reservoir[], payload: ReservoirPayload, policy: string): string {
  const baseline = payload.default_baseline ?? "recent";
  const total = rollupOfScoped(asScoped(rows), {
    baseline, minimumBaselineYears: payload.climate_normals?.minimum_years ?? 0
  });
  const dates = total.coverage;
  const period = periodLabel(baselineChoices(payload), baseline);
  const normal = total.percentOfNormal === null ? "No normal comparison is available."
    : `${formatPercent(total.percentOfNormal)} of normal (${period}); ${total.normalCovers} of ${total.seasonalCount} reservoirs have this comparison.`;
  /* Seasonal storage apart from steady pools and flood-control basins
   * (ADR-156), only where the place holds them. */
  const split = describeAreaSplit(name, total) ?? [];
  const dateText = dates.earliestDate && dates.latestDate
    ? `${formatDate(dates.earliestDate)} to ${formatDate(dates.latestDate)}` : "No readings";
  const lines = [
    `${total.count} reservoirs · ${total.stale} with late readings.`,
    `Reading dates: ${dateText}.`,
    normal,
    ...split,
    "Percent full uses the combined full levels; these have different definitions.",
    "Lake Powell and Lake Mead are included where they are in this view."
  ];
  return shareFrameDocument({ name, figure: `${formatPercent(total.percentFull)} full`,
    stored: `${formatAcreFeet(total.storageAf)} acre-feet stored`, lines,
    source: creditLine(rows.map(providerName)) }, policy, "scope");
}

export function sharePages(payload: ReservoirPayload, ledger: unknown, regions: readonly Region[], policy = "default-src 'self'; style-src 'unsafe-inline'"): SharePage[] {
  const addresses = validateShareLedger(ledger);
  if (new Set(regions.map((region) => region.huc2)).size !== regions.length
    || regions.some((region) => !/^\d{2}$/.test(region.huc2) || !region.name.trim())) {
    throw new Error("Invalid share-card regions");
  }
  const pages: SharePage[] = addresses.map((entry) => {
    const reservoir = payload.reservoirs.find((row) => row.source_station_id === entry.source_station_id);
    const name = reservoir ? reservoirLabel(reservoir, payload.reservoirs) : entry.name;
    const destination = `reservoir.html?name=${encodeURIComponent(entry.source_station_id)}`;
    return { slug: entry.slug, name, destination, kind: "reservoir",
      frame: reservoir ? `${destination}&view=share` : null, frameHtml: null,
      html: pageHtml(entry.slug, name, destination, Boolean(reservoir), policy) };
  });
  const scopes = [
    { slug: "west", name: "Western reservoir storage", query: "", rows: payload.reservoirs },
    ...STATES.map((code) => ({ slug: `state-${code.toLowerCase()}`, name: stateName(code),
      query: `?state=${code}`, rows: payload.reservoirs.filter((row) => reservoirInState(row, code)) })),
    ...regions.map((region) => ({ slug: `region-${region.huc2}`, name: region.name,
      query: `?area=${region.huc2}`, rows: payload.reservoirs.filter((row) => (row.huc8 ?? row.huc6)?.startsWith(region.huc2)) }))
  ];
  for (const scope of scopes) {
    const destination = `overview.html${scope.query}`;
    pages.push({ slug: scope.slug, name: scope.name, destination, kind: "scope",
      frame: `share/${scope.slug}.frame.html`,
      frameHtml: scopeFrame(scope.name, scope.rows, payload, policy),
      html: pageHtml(scope.slug, scope.name, destination, true, policy) });
  }
  return pages;
}

export async function writeSharePages(root: string, outDir: string): Promise<void> {
  const json = async (file: string): Promise<unknown> => JSON.parse(await readFile(resolve(root, file), "utf8"));
  const payload = validateReservoirPayload(await json("reservoirs.json"));
  const ledger = validateShareLedger(await json("data/share-ledger.json"));
  const reference = await json("reference.json") as {
    geography: { watersheds: { scopes: Record<string, { units: Region[] }> } }
  };
  const shell = await readFile(resolve(root, "reservoir.html"), "utf8");
  const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(shell)?.[1];
  if (!policy) throw new Error("The reservoir page has no content policy");
  const pages = sharePages(payload, ledger, reference.geography.watersheds.scopes["west-huc2"]!.units, policy);
  const folder = resolve(outDir, "share");
  await mkdir(folder, { recursive: true });
  for (const page of pages) {
    await writeFile(resolve(folder, `${page.slug}.html`), page.html);
    await copyFile(resolve(root, "public/share/fallback.png"), resolve(folder, `${page.slug}.png`));
    if (page.frameHtml) await writeFile(resolve(folder, `${page.slug}.frame.html`), page.frameHtml);
  }
  async function optional<T>(file: string, validate: (value: unknown) => T): Promise<T | null> {
    try { return validate(await json(file)); }
    catch (error) { console.warn(`Preview for ${file} has no figures:`, String(error)); return null; }
  }
  const snapshots = pageSnapshots({
    snow: await optional("snowpack.json", validateSnowpackPayload),
    precipitation: await optional("precipitation.json", validatePrecipitationPayload),
    precipitationHistory: await optional("precipitation_history.json", validatePrecipitationHistory),
    drought: await optional("data/drought/usdm-huc6.json", validateDroughtCoverage),
    rivers: await optional("rivers.json", validateRiverPayload)
  });
  for (const snapshot of snapshots) {
    await copyFile(resolve(root, "public/share/fallback.png"), resolve(folder, `${snapshot.file}.png`));
    await writeFile(resolve(folder, `${snapshot.file}.frame.html`), shareFrameDocument({
      ...snapshot, source: `${snapshot.source} · ${SITE_ADDRESS}`
    }, policy, "page"));
  }
  const weekly = await writeWeeklyPages(root, outDir, policy);
  const targets = [
    ...weekly,
    ...pages.map(({ slug, name, frame, kind }) => ({ file: slug, name, frame, kind })),
    ...snapshots.map(({ file, name }) => ({ file, name, frame: `share/${file}.frame.html`, kind: "page" }))
  ];
  await writeFile(resolve(folder, "targets.json"), JSON.stringify(targets) + "\n");
  await writeFile(resolve(folder, "ledger.json"), JSON.stringify(ledger) + "\n");
  console.log(`Generated ${pages.length} permanent share pages and fallback pictures`);
}
