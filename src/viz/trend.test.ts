import { afterEach, describe, expect, it, vi } from "vitest";

import type { DetailMonth } from "../state/detail";
import { monthLabelStep, renderTrendTable } from "./trend";

/* Plot widths the two callers actually produce: the storage details panel is
 * narrow, the reservoir page is roughly twice as wide. Both are the chart
 * width less its 38 and 6 unit padding. */
const PANEL_PLOT = 300 - 38 - 6;
const PAGE_PLOT = 696 - 38 - 6;
const PHONE_PLOT = 358 - 38 - 6;

describe("monthLabelStep", () => {
  /* The defect this exists for: a fixed every-third-month rule, written when
   * the chart only drew at about 300 pixels, kept dropping seven of twelve
   * labels on a card wide enough for all of them. */
  it("labels every month when the card is wide enough", () => {
    expect(monthLabelStep(12, PAGE_PLOT)).toBe(1);
  });

  it("still thins where the labels would collide", () => {
    expect(monthLabelStep(12, PANEL_PLOT)).toBeGreaterThan(1);
    expect(monthLabelStep(12, PHONE_PLOT)).toBeGreaterThan(1);
  });

  it("never lets the labels it keeps overrun the plot", () => {
    for (const months of [1, 2, 5, 12, 24, 36]) {
      for (const width of [120, 200, PANEL_PLOT, PHONE_PLOT, PAGE_PLOT, 1400]) {
        const step = monthLabelStep(months, width);
        expect(step, `step for ${months} in ${width}`).toBeGreaterThanOrEqual(1);
        expect(Number.isInteger(step)).toBe(true);
        const drawn = Math.ceil(months / step);
        // Either they fit, or nothing would and only one label survives.
        expect(drawn === 1 || drawn * 40 <= width,
          `${drawn} labels of 40 units in ${width}`).toBe(true);
      }
    }
  });

  it("always keeps the newest month, whatever the step", () => {
    for (const months of [1, 5, 12, 24]) {
      for (const width of [120, PANEL_PLOT, PAGE_PLOT]) {
        const step = monthLabelStep(months, width);
        const kept = [...Array(months).keys()]
          .filter((index) => (months - 1 - index) % step === 0);
        expect(kept, `newest kept for ${months} in ${width}`).toContain(months - 1);
      }
    }
  });

  it("answers for a chart with no months at all", () => {
    expect(monthLabelStep(0, PAGE_PLOT)).toBe(1);
  });
});

/* The unit suite runs without a DOM, so the table is built on the few element
 * members it uses and read back by tag. */
interface FakeElement {
  tag: string;
  className: string;
  textContent: string;
  scope: string;
  children: FakeElement[];
  classList: { add: (name: string) => void };
  append: (...nodes: FakeElement[]) => void;
}

function fakeElement(tag: string): FakeElement {
  const node: FakeElement = {
    tag, className: "", textContent: "", scope: "", children: [],
    classList: { add: () => undefined },
    append: (...nodes) => { node.children.push(...nodes); }
  };
  return node;
}

function byTag(node: FakeElement, tag: string): FakeElement[] {
  return node.children.flatMap((child) =>
    [...(child.tag === tag ? [child] : []), ...byTag(child, tag)]);
}

const MONTHS: DetailMonth[] = [
  { key: "2026-07", label: "July 2026", storageAf: 1_100_000, percent: null,
    normalAf: 1_000_000, normalYears: 10, changeFromNormal: 10, color: "#000" },
  { key: "2026-08", label: "August 2026", storageAf: 1_090_000, percent: null,
    normalAf: 1_000_000, normalYears: 10, changeFromNormal: 9, color: "#000" }
];

describe("renderTrendTable", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  function render(options?: { fullLevel?: boolean }) {
    vi.stubGlobal("document", { createElement: fakeElement });
    const table = renderTrendTable(MONTHS, options) as unknown as FakeElement;
    const head = byTag(table, "thead")[0]!;
    const body = byTag(table, "tbody")[0]!;
    return {
      columns: byTag(head, "th").map((cell) => cell.textContent),
      rows: byTag(body, "tr").map((row) => row.children.length)
    };
  }

  it("keeps the full-level column for a reservoir", () => {
    const table = render();
    expect(table.columns).toEqual(["Month", "Acre-feet", "Of full level", "Change from normal"]);
    expect(table.rows).toEqual([4, 4]);
  });

  it("leaves the column out for a water with no full level (ADR-112)", () => {
    const table = render({ fullLevel: false });
    expect(table.columns).toEqual(["Month", "Acre-feet", "Change from normal"]);
    expect(table.rows).toEqual([3, 3]);
  });
});
