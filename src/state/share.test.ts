import { describe, expect, it, vi } from "vitest";
import { copyText, copyViewUrl } from "./share";

describe("copying a shared view", () => {
  it("copies the exact current address", async () => {
    const writeText = vi.fn(async () => undefined);
    await expect(copyViewUrl(
      "https://example.test/?drainage=140600&class=0&late=true",
      { writeText }
    )).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(
      "https://example.test/?drainage=140600&class=0&late=true");
  });

  it("reports a missing or refused clipboard without throwing", async () => {
    await expect(copyViewUrl("https://example.test/", undefined)).resolves.toBe(false);
    await expect(copyViewUrl("https://example.test/", {
      writeText: async () => { throw new Error("not allowed"); }
    })).resolves.toBe(false);
  });

  it("uses the same guarded path for non-address text", async () => {
    const writeText = vi.fn(async () => undefined);
    await expect(copyText("37.05778, -111.30332", { writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("37.05778, -111.30332");
  });
});
