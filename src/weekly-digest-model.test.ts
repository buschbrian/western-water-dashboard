import { describe, expect, it } from "vitest";
import { readPayload, readSnowpackSeasonFixture } from "./data/payload-fixture";
import { weeklyScopeText, weeklySummary } from "./weekly-model";
import { describeWeek } from "./viz/weekly-summary";
import { appendDigest, digestEntry, validateDigestLedger, weekOf } from "./weekly-digest-model";
import { weeklyFeeds, weeklyPage } from "./build/weekly-pages";
import { weeklyReadingNotes } from "./state/figures-text";

const payload = readPayload();
const snow = readSnowpackSeasonFixture();
const captured = "2026-11-11T16:00:00.000Z";
const entry = () => digestEntry(payload, snow, null, "2026-11-11", captured);

describe("frozen weekly digests", () => {
  it("uses the existing weekly models and preserves their scope and dates", () => {
    const saved = entry();
    expect(saved.sections).toEqual(describeWeek(weeklySummary(payload.reservoirs, snow, null)));
    expect(saved.scope).toBe(weeklyScopeText(payload.reservoirs, payload.reservoirs));
    expect(saved.sourceDates).toEqual({ storage: payload.generated_at, snow: snow.as_of, drought: null });
    expect(saved.notes).toEqual(expect.arrayContaining(weeklyReadingNotes(payload.reservoirs)));
    expect(saved.caption.match(/buschbrian\.github\.io\/western-water-dashboard/g)).toHaveLength(1);
    expect(saved.caption).toContain("Drought measurements were unavailable.");
  });
  it("keys a week by its Monday across year and leap-day boundaries", () => {
    expect(weekOf("2027-01-01")).toBe("2026-12-28");
    expect(weekOf("2028-02-29")).toBe("2028-02-28");
    expect(() => weekOf("2026-02-30")).toThrow();
  });
  it("does not rewrite an earlier entry when a source or model changes", () => {
    const first = appendDigest({ schema_version: 1, entries: [] }, entry());
    const before = JSON.stringify(first);
    const replacement = { ...entry(), caption: "A revised source changed this text." };
    expect(appendDigest(first, replacement)).toBe(first);
    expect(JSON.stringify(first)).toBe(before);
    const next = { ...entry(), week: "2026-11-16", published: "2026-11-16T16:00:00.000Z" };
    const extended = appendDigest(first, next);
    expect(extended.entries[0]).toEqual(first.entries[0]);
    expect(extended.entries).toHaveLength(2);
    expect(() => validateDigestLedger({ ...extended, entries: [...extended.entries].reverse() })).toThrow();
  });
  it("keeps permanent item identities and escapes caption text in XML and HTML", () => {
    const saved = { ...entry(), caption: "A & B <water> </textarea><script>bad()</script>" };
    const feeds = weeklyFeeds({ schema_version: 1, entries: [saved] });
    const json = JSON.parse(feeds.json);
    expect(json.items[0].id).toBe(json.items[0].url);
    expect(json.items[0].content_text).toBe(saved.caption);
    expect(feeds.atom).toContain("A &amp; B &lt;water&gt;");
    expect(feeds.atom).not.toContain("<script>");
    const html = weeklyPage(saved, "default-src 'self'; style-src 'unsafe-inline'");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;/textarea&gt;");
    expect(html).toContain("weekly-2026-11-09.png");
  });
  it("bounds the feed to 52 weeks without changing the saved ledger", () => {
    const template = entry();
    const entries = Array.from({ length: 55 }, (_, i) => {
      const week = new Date(Date.parse("2025-01-06") + i * 7 * 86400000).toISOString().slice(0, 10);
      return { ...template, week, published: `${week}T16:00:00.000Z` };
    });
    const ledger = { schema_version: 1 as const, entries };
    const before = JSON.stringify(ledger);
    const feed = JSON.parse(weeklyFeeds(ledger).json);
    expect(feed.items).toHaveLength(52);
    expect(feed.items[0].url).toContain(entries.at(-1)!.week);
    expect(feed.items[51].url).toContain(entries[3]!.week);
    expect(JSON.stringify(ledger)).toBe(before);
  });
});
