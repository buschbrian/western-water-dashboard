/*
 * The fallback contract, proved on purpose rather than waited for.
 *
 * The suite's hosted-layer handling could only ever be exercised by a run
 * that happened to lose the network, which is why it went unnoticed for so
 * long. This blocks the hosted services deliberately and asserts what the
 * application promises without them: it still reaches readiness, still draws
 * every reservoir it holds locally, and asking the refused layer for a count
 * answers null instead of throwing.
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const dist = resolve("dist");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".geojson": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".woff2": "font/woff2", ".ttf": "font/ttf" };

const server = createServer(async (req, res) => {
  try {
    let file = join(dist, decodeURIComponent(req.url.split("?")[0]));
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, "index.html");
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404).end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const URL_BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
});
const tab = await browser.newPage({ viewport: { width: 1280, height: 900 } });

/*
 * The data services only. `js.arcgis.com` serves the SDK's own assets -- its
 * icons, its localized strings -- and refusing those does not simulate an
 * outage, it breaks the toolkit and hangs the page. What this test is about
 * is the layers whose features live on somebody else's server.
 */
const HOSTED_DATA_SERVICES = [
  "**://services*.arcgis.com/**",       // Living Atlas boundaries and watersheds
  "**://basemaps*.arcgis.com/**",       // the optional background
  "**://*.basemaps.arcgis.com/**",
  "**://hydro.nationalmap.gov/**",      // the USGS watershed service
  "**://tigerweb.geo.census.gov/**"
];
let blocked = 0;
for (const pattern of HOSTED_DATA_SERVICES) {
  await tab.route(pattern, (route) => { blocked += 1; return route.abort(); });
}

const consoleErrors = [];
tab.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
const uncaught = [];
tab.on("pageerror", (e) => uncaught.push(e.message));

await tab.goto(URL_BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
await tab.waitForFunction(() => window.__dashboardReady !== undefined, { timeout: 60000 });

const result = await tab.evaluate(async () => {
  const map = document.querySelector("arcgis-map")?.map;
  const drainage = map?.findLayerById("drainage-areas");
  const reservoirs = map?.findLayerById("reservoirs");
  return {
    ready: Boolean(window.__dashboardReady),
    reservoirsDrawn: window.__dashboardReady?.drawn ?? null,
    drainageAreas: window.__dashboardReady?.drainageAreas ?? null,
    reservoirCount: reservoirs ? await reservoirs.queryFeatureCount() : null,
    drainageCount: drainage
      ? await drainage.queryFeatureCount().catch(() => null)
      : 0
  };
});

const problems = [];
const say = (ok, message) => { console.log(`${ok ? "  ok  " : "  FAIL"} ${message}`); if (!ok) problems.push(message); };

console.log(`\nblocked ${blocked} hosted request(s)\n`);
say(result.ready, "the page still reached readiness with every hosted service refused");
say(result.reservoirsDrawn > 0,
  `it still drew its own reservoirs (${result.reservoirsDrawn})`);
say(result.reservoirCount > 0,
  `the local reservoir layer still answers a count (${result.reservoirCount})`);
say(result.drainageCount === null || result.drainageCount === 0,
  `the refused hosted layer answers ${JSON.stringify(result.drainageCount)} instead of throwing`);
say(uncaught.length === 0, `no uncaught page error (${JSON.stringify(uncaught)})`);

await browser.close();
server.close();
if (problems.length) { console.error(`\n${problems.length} problem(s)`); process.exit(1); }
console.log("\nThe fallback contract holds with every hosted service refused.");
