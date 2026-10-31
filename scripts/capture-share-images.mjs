/*
 * The picture behind a shared reservoir link (ADR-141).
 *
 * Serves the built `dist/`, opens each reservoir's share frame
 * (`reservoir.html?name=...&view=share`) in Chromium at 1200 by 630 and saves
 * the screenshot as `dist/share/<file>.png`, the file the share page's
 * `og:image` names.
 *
 * `dist/share/<file>.png` already holds the committed fallback image: the
 * build copies `public/share/` whole. A capture is written beside it and
 * replaces it only when it is a valid 1200 by 630 PNG of a frame that drew,
 * so no failure here, however early, can leave a broken `og:image`. A failed
 * capture is a warning and the fallback stays; the exit code is non-zero only
 * when an image is missing or is not a PNG of the right size after all.
 *
 *   node scripts/capture-share-images.mjs [--dist dist]
 *
 * Uses the browser the browser suites use: Playwright (installed by
 * scripts/install-playwright.sh, never a package dependency) and the Chromium
 * named by PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH. scripts/share-images.sh finds one
 * on the machine when it is unset; nothing is downloaded.
 */
import { createServer } from "node:http";
import { readFile, rename, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const WIDTH = 1200;
const HEIGHT = 630;
const PAGE_DEADLINE_MS = 60_000;
const RUN_DEADLINE_MS = 5 * 60_000;
const MINIMUM_BYTES = 15_000;

/* One entry per share page in public/share/. src/deploy.test.ts holds this
 * list and that folder in step. */
const TARGETS = [
  { file: "lake-powell", name: "Lake Powell" },
  { file: "lake-mead", name: "Lake Mead" }
];

const TYPES = {
  ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
  ".woff2": "font/woff2", ".woff": "font/woff", ".jpg": "image/jpeg"
};

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const distFlag = argv.indexOf("--dist");
const DIST = path.resolve(REPO_ROOT, distFlag >= 0 ? argv[distFlag + 1] : "dist");

function warn(message) {
  console.log(`::warning title=Share images::${message}`);
}

/** Width and height of a PNG, or null when the bytes are not one. */
function pngSize(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((byte, index) => bytes[index] !== byte)) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function validPng(file) {
  try {
    const bytes = await readFile(file);
    const size = pngSize(bytes);
    return size !== null && size.width === WIDTH && size.height === HEIGHT
      && bytes.length >= MINIMUM_BYTES;
  } catch {
    return false;
  }
}

function serve() {
  const server = createServer(async (request, response) => {
    const relative = decodeURIComponent(request.url.split("?")[0]);
    const file = path.join(DIST, relative.endsWith("/") ? `${relative}index.html` : relative);
    if (!file.startsWith(DIST)) { response.writeHead(403).end("forbidden"); return; }
    try {
      const body = await readFile(file);
      response.writeHead(200, { "content-type": TYPES[path.extname(file)] || "text/plain" });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function capture(browser, origin, target) {
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1,
    colorScheme: "light", reducedMotion: "reduce"
  });
  const temporary = path.join(DIST, "share", `${target.file}.capture.png`);
  try {
    /* Nothing but this server answers: the frame draws from published files,
     * and a slow third party must not be able to hold a deploy. */
    await context.route((url) => url.hostname !== "127.0.0.1", (route) => route.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(PAGE_DEADLINE_MS);
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(
      `${origin}/reservoir.html?name=${encodeURIComponent(target.name)}&view=share`,
      { waitUntil: "load" });
    await page.waitForFunction(() => window.__reservoirReady?.elevation === "drawn");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const frame = await page.evaluate(() => ({
      name: document.querySelector(".reservoir-share .reservoir-name")?.textContent ?? "",
      level: document.querySelector(".share-figure")?.textContent ?? "",
      date: document.querySelector(".share-date")?.textContent ?? "",
      lines: document.querySelectorAll("#reservoir-elevation-chart .elevation-line").length,
      fitsHeight: document.documentElement.scrollHeight <= window.innerHeight,
      fitsWidth: document.documentElement.scrollWidth <= window.innerWidth
    }));
    if (frame.name !== target.name || !/^[\d,.]+ feet$/.test(frame.level)
      || !/^Reading date: /.test(frame.date) || frame.lines < 2
      || !frame.fitsHeight || !frame.fitsWidth || errors.length) {
      throw new Error(`the frame did not draw as expected: ${JSON.stringify({ ...frame, errors })}`);
    }
    await page.screenshot({ path: temporary, type: "png" });
    if (!(await validPng(temporary))) throw new Error("the screenshot is not a 1200 by 630 PNG");
    await rename(temporary, path.join(DIST, "share", `${target.file}.png`));
    console.log(`captured share/${target.file}.png (${frame.name}, ${frame.level}, ${frame.date})`);
  } finally {
    await rm(temporary, { force: true });
    await context.close().catch(() => {});
  }
}

async function run() {
  let server;
  let browser;
  try {
    if (!(await stat(path.join(DIST, "reservoir.html")).catch(() => null))) {
      throw new Error(`${DIST} has no reservoir.html; build first`);
    }
    const { chromium } = await import("playwright");
    server = await serve();
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {});
    for (const target of TARGETS) {
      try {
        await capture(browser, origin, target);
      } catch (error) {
        warn(`share/${target.file}.png keeps its committed fallback: ${String(error).slice(0, 300)}`);
      }
    }
  } catch (error) {
    warn(`no image was captured; the committed fallbacks are published: ${String(error).slice(0, 300)}`);
  } finally {
    await browser?.close().catch(() => {});
    server?.close();
  }
}

{
  let deadline;
  const expired = new Promise((resolve) => {
    deadline = setTimeout(() => {
      warn("capture ran past its deadline and was stopped");
      resolve();
    }, RUN_DEADLINE_MS);
  });
  await Promise.race([run(), expired]);
  clearTimeout(deadline);
  let missing = false;
  for (const target of TARGETS) {
    if (!(await validPng(path.join(DIST, "share", `${target.file}.png`)))) {
      console.log(`::error title=Share images::dist/share/${target.file}.png is missing or is not a 1200 by 630 PNG`);
      missing = true;
    }
  }
  process.exit(missing ? 1 : 0);
}
