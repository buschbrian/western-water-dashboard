import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { capturePool, run, validTargets } from "./capture-share-images.mjs";

const target = { file: "one", name: "One", kind: "reservoir", frame: "reservoir.html?name=A&view=share" };
const folders = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })));
});

describe("daily picture capture", () => {
  it("limits concurrency and visits each target once", async () => {
    let active = 0, peak = 0;
    const seen = [];
    await capturePool(Array.from({ length: 11 }, (_, i) => i), 3, async (entry) => {
      active++; peak = Math.max(peak, active);
      await new Promise(setImmediate);
      seen.push(entry); active--;
    });
    expect(peak).toBe(3);
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 11 }, (_, i) => i));
  });

  it("stops scheduling frames once the run budget is spent", async () => {
    let count = 0;
    await capturePool([1, 2, 3], 1, async () => { count++; }, () => count === 1);
    expect(count).toBe(1);
  });

  it("refuses duplicate paths, traversal and external frame addresses", () => {
    expect(() => validTargets([target, target])).toThrow();
    expect(() => validTargets([{ ...target, file: "../escape" }])).toThrow();
    expect(() => validTargets([{ ...target, file: null }])).toThrow();
    expect(() => validTargets([{ ...target, frame: "https://example.com/" }])).toThrow();
  });

  it("accepts page snapshots only at their generated frame address", () => {
    const page = { file: "page-snow", name: "Western snowpack", kind: "page", frame: "share/page-snow.frame.html" };
    expect(validTargets([page])).toEqual([page]);
    expect(() => validTargets([{ ...page, frame: "https://example.com/frame" }])).toThrow();
  });
  it("captures a weekly picture only from its generated frame", () => {
    const weekly = { file: "weekly-2026-11-09", name: "Week of Nov 9, 2026", kind: "weekly",
      frame: "share/weekly-2026-11-09.frame.html" };
    expect(validTargets([weekly])).toEqual([weekly]);
    expect(() => validTargets([{ ...weekly, frame: "share/west.frame.html" }])).toThrow();
  });

  it("publishes a valid fallback when Chrome is unavailable, and reports a missing image", async () => {
    const folder = await mkdtemp(path.join(tmpdir(), "wwd-share-")); folders.push(folder);
    await mkdir(path.join(folder, "share"));
    await writeFile(path.join(folder, "share/targets.json"), JSON.stringify([target]));
    await copyFile("public/share/fallback.png", path.join(folder, "share/one.png"));
    const before = await readFile(path.join(folder, "share/one.png"));
    vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", "");
    expect(await run(folder)).toBe(0);
    expect(await readFile(path.join(folder, "share/one.png"))).toEqual(before);
    await rm(path.join(folder, "share/one.png"));
    expect(await run(folder)).toBe(1);
  });
});
