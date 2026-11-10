import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchWithin = vi.hoisted(() => vi.fn());
vi.mock("./fetch", () => ({ fetchWithin }));
const fallback = "https://example.com/dashboard/reservoir.html?name=Old";
beforeEach(() => { vi.resetModules(); fetchWithin.mockReset(); });

describe("reservoir preview links", () => {
  it("uses the permanent address for the station and fetches the ledger only on demand", async () => {
    const { reservoirShareUrl } = await import("./share-link");
    expect(fetchWithin).not.toHaveBeenCalled();
    fetchWithin.mockResolvedValue({ json: async () => [{ source_station_id: "A", name: "Old", slug: "old-name" }] });
    expect(await reservoirShareUrl("A", fallback)).toBe("https://example.com/dashboard/share/old-name.html");
    expect(await reservoirShareUrl("A", fallback)).toBe("https://example.com/dashboard/share/old-name.html");
    expect(fetchWithin).toHaveBeenCalledTimes(1);
  });

  it("keeps the current address when an identity is missing, absent or cannot be loaded", async () => {
    const { reservoirShareUrl } = await import("./share-link");
    expect(await reservoirShareUrl(null, fallback)).toBe(fallback);
    expect(fetchWithin).not.toHaveBeenCalled();
    fetchWithin.mockRejectedValueOnce(new Error("offline"));
    expect(await reservoirShareUrl("A", fallback)).toBe(fallback);
    fetchWithin.mockResolvedValueOnce({ json: async () => [] });
    expect(await reservoirShareUrl("A", fallback)).toBe(fallback);
  });
});
