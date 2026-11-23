import { describe, expect, it } from "vitest";
import { shareFrameDocument } from "./share-frame";

describe("share frame notes", () => {
  const frame = (line: string) => shareFrameDocument(
    { name: "West", figure: "47.4% full", lines: [line], source: "Source" }, "default-src 'none'", "scope");

  it("keeps a figure and its unit on one line without changing the text", () => {
    const html = frame("Their empty space is 7,954 acre-feet.");
    expect(html).toContain('<span class="nb">7,954 acre-feet</span>.');
    expect(html.replace(/<[^>]+>/g, "")).toContain("Their empty space is 7,954 acre-feet.");
  });

  it("leaves a line with no unit alone and still escapes it", () => {
    expect(frame("Lake Powell & Lake Mead")).toContain("<p>Lake Powell &amp; Lake Mead</p>");
  });
});
