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

  it("takes the top edge for the tap positions a map actually gets", () => {
    expect(dockedEdge({ x: 180, y: 300 }, stage)).toBe("start");
    expect(dockedEdge({ x: 180, y: 200 }, stage)).toBe("start");
    expect(dockedEdge({ x: 180, y: 599 }, stage)).toBe("start");
  });

  it("moves to the bottom only for a tap the top edge would cover", () => {
    expect(dockedEdge({ x: 180, y: 0 }, stage)).toBe("end");
    expect(dockedEdge({ x: 180, y: 199 }, stage)).toBe("end");
  });

  it("does not read an edge off a stage that has not been laid out", () => {
    expect(dockedEdge({ x: 0, y: 0 }, { width: 0, height: 0 })).toBe("start");
  });
});
