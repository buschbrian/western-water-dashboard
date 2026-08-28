import { describe, expect, it } from "vitest";

import {
  missingStationCount,
  upstreamSummary,
  type UpstreamView
} from "./upstream-filter-model";

const view = (over: Partial<UpstreamView>): UpstreamView => ({
  station: "0900",
  reservoirName: "Strawberry",
  indexedSites: 4,
  missingSites: 0,
  currentSites: 4,
  status: "applied",
  ...over
});

describe("indexed stations the payload does not carry", () => {
  it("counts only the stations absent from the roster", () => {
    expect(missingStationCount(
      ["1:UT:SNTL", "2:UT:SNTL", "3:UT:SNTL"],
      new Set(["1:UT:SNTL", "3:UT:SNTL", "9:CO:SNTL"])
    )).toBe(1);
  });

  it("counts nothing when every indexed station reports", () => {
    expect(missingStationCount(
      ["1:UT:SNTL"], new Set(["1:UT:SNTL", "2:UT:SNTL"]))).toBe(0);
  });

  it("counts an empty roster as every station missing", () => {
    expect(missingStationCount(["1:UT:SNTL", "2:UT:SNTL"], new Set())).toBe(2);
  });
});

describe("the active upstream summary", () => {
  it("names the reservoir and the relationship without asserting flow", () => {
    const message = upstreamSummary(view({ currentSites: 6, indexedSites: 6 }));
    expect(message).toContain("Strawberry");
    expect(message).toContain("upstream of");
    expect(message).not.toMatch(/feeds|supplies/);
  });

  /* The defect this model exists to prevent: a place that hides a reporting
   * station must never be described as data the payload does not have. */
  it("stays silent about missing data when a place did the narrowing", () => {
    expect(upstreamSummary(view({ indexedSites: 9, missingSites: 0, currentSites: 2 })))
      .toBe("Showing 2 sites that measure snow upstream of Strawberry.");
  });

  it("reports only the stations the payload does not carry", () => {
    expect(upstreamSummary(view({ indexedSites: 9, missingSites: 3, currentSites: 2 })))
      .toBe("Showing 2 sites that measure snow upstream of Strawberry. "
        + "3 sites in the committed set are not in the current snow data.");
  });

  it("keeps one site singular in both counts", () => {
    expect(upstreamSummary(view({ indexedSites: 2, missingSites: 1, currentSites: 1 })))
      .toBe("Showing 1 site that measures snow upstream of Strawberry. "
        + "1 site in the committed set is not in the current snow data.");
  });

  it("explains an unreadable set without emptying the page", () => {
    const message = upstreamSummary(view({ status: "unavailable", reservoirName: null }));
    expect(message).toContain("could not be read");
    expect(message).toContain("The chosen place is shown instead.");
    expect(message).toContain("the requested reservoir");
  });

  it("says why a more specific linked site won", () => {
    const message = upstreamSummary(
      view({ status: "linked-site-wins", linkedSiteName: "Alta" }));
    expect(message).toContain("Alta");
    expect(message).toContain("more specific");
  });
});
