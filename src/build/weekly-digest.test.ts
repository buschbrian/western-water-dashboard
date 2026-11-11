import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { writeWeeklyDigest } from "./weekly-digest";

describe("weekly ledger writer", () => {
  it("writes once per Mountain Time week and reruns byte for byte", async () => {
    const folder = await mkdtemp(resolve(tmpdir(), "wwd-weekly-"));
    const output = resolve(folder, "weekly.json");
    try {
      await writeWeeklyDigest(process.cwd(), { output, published: "2026-11-16T01:00:00.000Z" }); // Sunday in Utah
      const first = await readFile(output, "utf8");
      expect(JSON.parse(first).entries[0].week).toBe("2026-11-09");
      await writeWeeklyDigest(process.cwd(), { output, published: "2026-11-16T02:00:00.000Z" });
      expect(await readFile(output, "utf8")).toBe(first);
      await writeWeeklyDigest(process.cwd(), { output, published: "2026-11-16T16:00:00.000Z" });
      const next = JSON.parse(await readFile(output, "utf8"));
      expect(next.entries).toHaveLength(2);
      expect(next.entries[0]).toEqual(JSON.parse(first).entries[0]);
    } finally { await rm(folder, { recursive: true, force: true }); }
  });
});
