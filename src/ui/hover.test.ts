import { describe, expect, it } from "vitest";
import { dockedEdge, hoverPosition } from "./hover";

describe("hoverPosition", () => {
  it("keeps the card inside the map at every edge", () => {
    expect(hoverPosition({ x: 500, y: 300 }, { width: 480, height: 260 },
      { width: 180, height: 56 })).toEqual({ left: 292, top: 196 });
    expect(hoverPosition({ x: -20, y: -30 }, { width: 480, height: 260 },
      { width: 180, height: 56 })).toEqual({ left: 8, top: 8 });
  });
});

describe("dockedEdge", () => {
  const stage = { width: 360, height: 600 };

  it("keeps off the top edge, where every map control lives", () => {
    /* A card docked to the top covered zoom, home, fullscreen and the expand
     * control on a 390-pixel viewport, and it takes pointer events -- so the
     * answer to a tap took the map's controls away with it. */
    expect(dockedEdge({ x: 180, y: 0 }, stage)).toBe("end");
    expect(dockedEdge({ x: 180, y: 300 }, stage)).toBe("end");
    expect(dockedEdge({ x: 180, y: 399 }, stage)).toBe("end");
  });

  it("moves to the top only for a tap the bottom edge would cover", () => {
    expect(dockedEdge({ x: 180, y: 401 }, stage)).toBe("start");
    expect(dockedEdge({ x: 180, y: 599 }, stage)).toBe("start");
  });

  it("does not read an edge off a stage that has not been laid out", () => {
    expect(dockedEdge({ x: 0, y: 0 }, { width: 0, height: 0 })).toBe("end");
  });
});
