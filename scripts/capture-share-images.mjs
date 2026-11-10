/* The existing browser capture, over the build's generated list (ADR-154).
 * A timeout or failed frame keeps the figure-free fallback. */
import { createServer } from "node:http";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const WIDTH = 1200, HEIGHT = 630;
const PAGE_DEADLINE_MS = 30_000;
const RUN_DEADLINE_MS = 5 * 60_000;
const CONCURRENCY = 4;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".woff": "font/woff", ".jpg": "image/jpeg" };
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function validTargets(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error("No share targets were generated");
  const files = new Set();
  for (const target of value) {
    if (!target || typeof target.file !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.file)
      || files.has(target.file) || typeof target.name !== "string" || !target.name
      || !["reservoir", "scope", "page"].includes(target.kind)
      || (target.frame !== null && (typeof target.frame !== "string"
        || !(target.kind === "reservoir"
          ? /^reservoir\.html\?name=[^&]+&view=share$/.test(target.frame)
          : target.frame === `share/${target.file}.frame.html`)))) {
      throw new Error("Invalid or duplicate share target");
    }
    files.add(target.file);
  }
  return value;
}

export async function validPng(file) {
  try {
    const bytes = await readFile(file);
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= 15_000 && signature.every((byte, index) => bytes[index] === byte)
      && bytes.readUInt32BE(16) === WIDTH && bytes.readUInt32BE(20) === HEIGHT;
  } catch { return false; }
}

export async function capturePool(targets, concurrency, capture, stopped = () => false) {
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (!stopped() && next < targets.length) await capture(targets[next++]);
  }));
}

function warn(message) { console.log(`::warning title=Share images::${message}`); }

function serve(dist) {
  const server = createServer(async (request, response) => {
    try {
      const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
      const file = path.resolve(dist, `.${relative.endsWith("/") ? `${relative}index.html` : relative}`);
      if (!file.startsWith(`${dist}${path.sep}`)) { response.writeHead(403).end(); return; }
      const body = await readFile(file);
      response.writeHead(200, { "content-type": TYPES[path.extname(file)] || "text/plain" }).end(body);
    } catch { response.writeHead(404).end(); }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function capture(browser, origin, target, dist) {
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1, colorScheme: "light", reducedMotion: "reduce" });
  const temporary = path.join(dist, "share", `${target.file}.capture.png`);
  try {
    await context.route((url) => url.hostname !== "127.0.0.1", (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_DEADLINE_MS);
    page.setDefaultNavigationTimeout(PAGE_DEADLINE_MS);
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`${origin}/${target.frame}`, { waitUntil: "load" });
    if (target.kind === "reservoir") {
      await page.waitForFunction(() => ["level", "storage"].includes(window.__reservoirReady?.share));
    }
    await page.evaluate(() => document.fonts.ready);
    const frame = await page.evaluate(() => ({
      name: document.querySelector("h1")?.textContent ?? "",
      kind: window.__reservoirReady?.share ?? document.body.dataset.shareFrame,
      figure: document.querySelector(".share-figure, .figure")?.textContent ?? "",
      date: document.querySelector(".share-date")?.textContent ?? "",
      chart: Boolean(document.querySelector("#reservoir-trend-chart svg, #reservoir-elevation-chart svg")),
      fits: document.documentElement.scrollHeight <= window.innerHeight
        && document.documentElement.scrollWidth <= window.innerWidth
    }));
    if (frame.name !== target.name || !frame.figure || !frame.fits || errors.length
      || (target.kind !== "reservoir" && frame.kind !== target.kind)
      || (target.kind === "reservoir" && (!frame.chart || !/^Reading date: /.test(frame.date)))) {
      throw new Error(`Frame did not draw: ${JSON.stringify({ ...frame, errors })}`);
    }
    await page.screenshot({ path: temporary, type: "png", timeout: PAGE_DEADLINE_MS });
    if (!(await validPng(temporary))) throw new Error("Invalid screenshot");
    await rename(temporary, path.join(dist, "share", `${target.file}.png`));
  } finally {
    await rm(temporary, { force: true });
    await context.close().catch(() => {});
  }
}

export async function run(dist, { deadlineMs = RUN_DEADLINE_MS, concurrency = CONCURRENCY } = {}) {
  const targets = validTargets(JSON.parse(await readFile(path.join(dist, "share/targets.json"), "utf8")));
  const started = Date.now();
  let server, browser, deadline, stopped = false, captured = 0;
  try {
    if (!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) throw new Error("No installed browser was selected");
    const { chromium } = await import("playwright");
    server = await serve(dist);
    browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      timeout: PAGE_DEADLINE_MS });
    deadline = setTimeout(() => {
      stopped = true;
      warn("Capture reached its run budget; remaining targets keep their fallbacks");
      void browser.close().catch(() => {});
    }, deadlineMs);
    const origin = `http://127.0.0.1:${server.address().port}`;
    await capturePool(targets.filter((target) => target.frame), concurrency, async (target) => {
      try { await capture(browser, origin, target, dist); captured++; }
      catch (error) { warn(`share/${target.file}.png keeps its fallback: ${String(error).slice(0, 240)}`); }
    }, () => stopped);
  } catch (error) {
    warn(`Fallbacks are published: ${String(error).slice(0, 300)}`);
  } finally {
    clearTimeout(deadline);
    await browser?.close().catch(() => {});
    if (server) await new Promise((resolve) => server.close(resolve));
  }
  const missing = [];
  for (const target of targets) {
    if (!(await validPng(path.join(dist, "share", `${target.file}.png`)))) missing.push(target.file);
  }
  const notices = targets.filter((target) => !target.frame).length;
  const report = { total: targets.length, captured, notices, failed: targets.length - notices - captured,
    fallbacks: targets.length - captured,
    elapsedSeconds: Math.round((Date.now() - started) / 100) / 10, concurrency, deadlineMs, missing };
  await writeFile(path.join(dist, "share/capture-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
  return missing.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = process.argv.indexOf("--dist");
  const dist = path.resolve(REPO_ROOT, flag >= 0 ? process.argv[flag + 1] : "dist");
  process.exit(await run(dist));
}
