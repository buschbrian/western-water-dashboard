import { describe, expect, it, vi } from "vitest";
import { galleryOnFirstExpand, type GalleryExpand } from "./basemap-gallery";

/** A stand-in for `arcgis-expand`: an event target with the one property
 * and the one method the helper uses. */
function fakeExpand(expanded = false): GalleryExpand & {
  expanded: boolean; children: unknown[]; toggle(value: boolean): void;
} {
  const target = new EventTarget();
  const fake = Object.assign(target, {
    expanded,
    children: [] as unknown[],
    append(...nodes: unknown[]) { fake.children.push(...nodes); },
    toggle(value: boolean) {
      fake.expanded = value;
      fake.dispatchEvent(new CustomEvent("arcgisPropertyChange", {
        detail: { name: "expanded" }
      }));
    }
  });
  return fake as never;
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe("galleryOnFirstExpand", () => {
  it("builds nothing until the expand is opened", async () => {
    const expand = fakeExpand();
    const create = vi.fn(async () => ({ gallery: true }) as unknown as Node);
    void galleryOnFirstExpand(expand, create);
    await flush();
    expect(create).not.toHaveBeenCalled();
    expect(expand.children).toHaveLength(0);
  });

  it("builds one gallery on the first expand and never another", async () => {
    const expand = fakeExpand();
    const create = vi.fn(async () => ({ gallery: true }) as unknown as Node);
    const built = galleryOnFirstExpand(expand, create);
    expand.toggle(true);
    expand.toggle(false);
    expand.toggle(true);
    await built;
    expand.toggle(false);
    expand.toggle(true);
    await flush();
    expect(create).toHaveBeenCalledTimes(1);
    expect(expand.children).toHaveLength(1);
  });

  it("builds at once when the expand is already open", async () => {
    const expand = fakeExpand(true);
    const create = vi.fn(async () => ({ gallery: true }) as unknown as Node);
    await galleryOnFirstExpand(expand, create);
    expect(expand.children).toHaveLength(1);
  });

  it("tries again on the next expand after a failed build", async () => {
    const expand = fakeExpand();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const create = vi.fn()
      .mockRejectedValueOnce(new Error("chunk refused"))
      .mockResolvedValueOnce({ gallery: true });
    const built = galleryOnFirstExpand(expand, create);
    expand.toggle(true);
    await flush();
    expect(expand.children).toHaveLength(0);
    expand.toggle(false);
    expand.toggle(true);
    await built;
    expect(create).toHaveBeenCalledTimes(2);
    expect(expand.children).toHaveLength(1);
    warn.mockRestore();
  });
});
