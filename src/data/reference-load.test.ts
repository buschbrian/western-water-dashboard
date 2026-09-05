import { afterEach, expect, it, vi } from "vitest";
import { loadReference } from "./boundaries";

afterEach(() => vi.unstubAllGlobals());

it("shares a reference response across callers", async () => {
  const fetch = vi.fn(async () => new Response('{"version":1}'));
  vi.stubGlobal("fetch", fetch);
  const [first, second] = await Promise.all([
    loadReference("./shared-reference.json"), loadReference("./shared-reference.json")
  ]);
  expect(first).toBe(second);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it.each(["http", "json"])("retries after a %s failure without reloading the page", async (failure) => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(failure === "http"
      ? new Response("offline", { status: 503 }) : new Response("not JSON"))
    .mockResolvedValueOnce(new Response('{"version":2}'));
  vi.stubGlobal("fetch", fetch);
  const url = `./recover-${failure}.json`;
  await expect(loadReference(url)).rejects.toThrow();
  await expect(loadReference(url)).resolves.toEqual({ version: 2 });
  await expect(loadReference(url)).resolves.toEqual({ version: 2 });
  expect(fetch).toHaveBeenCalledTimes(2);
});
