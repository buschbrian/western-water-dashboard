import { describe, expect, it } from "vitest";
import { drainageLabel, formatDate } from "./format";

it("formats reading dates in UTC and preserves an unreadable date", () => {
  expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
  expect(formatDate("2024-02-29")).toBe("Feb 29, 2024");
  expect(formatDate("2026-12-31")).toBe("Dec 31, 2026");
  expect(formatDate("unknown")).toBe("unknown");
});

describe("the drainage label the axis shows", () => {
  it("puts the states after the name", () => {
    expect(drainageLabel("Kootenai", ["ID", "MT"])).toBe("Kootenai (ID, MT)");
  });

  it("shows a bare name when no state is left", () => {
    /* Nine subbasins hold no United States ground, and an empty bracket
     * after a name says nothing a reader can use. */
    expect(drainageLabel("Kootenai", [])).toBe("Kootenai");
    expect(drainageLabel("Kootenai")).toBe("Kootenai");
  });

  it("leaves every other chart's labels alone", () => {
    /* Reservoir records carry no `labelStates`, so the one composer the
     * charts share must hand their label straight back. */
    expect(drainageLabel("Lake Mead")).toBe("Lake Mead");
  });
});
