/*
 * The storage summary's comparison with normal and the filtered subtotal
 * (ADR-153). Sentences are held against synthetic figures; the subtotal is
 * held against the committed payload by agreement with the functions it is
 * made from, never against a percentage, so a morning refresh cannot turn
 * this red.
 */
import { describe, expect, it } from "vitest";

import { readPayload } from "../data/payload-fixture";
import { monthKeys, monthlyRollup } from "../data/months";
import { asScoped, rollupOfScoped, type StatewideRollup } from "../data/rollup";
import { ALL_RESERVOIRS, matchesFilter, type FilterState } from "./filters";
import {
  PAST_MONTH_NORMAL,
  describeSubtotal,
  describeUsualStorage,
  filteredSubtotal,
  mapSummaryText,
  usualStorageClause,
  type NormalComparison
} from "./storage-summary";
import type { BaselineChoice } from "../types";

const CHOICES: BaselineChoice[] = [
  {
    id: "recent", label: "Recent years", period_label: "2015 through 2025",
    start_year: 2015, end_year: 2025, note: "Every earlier year this site holds."
  },
  {
    id: "climate", label: "Standard climate period", period_label: "1991 through 2020",
    start_year: 1991, end_year: 2020, note: "The standard thirty year period."
  }
];

function comparison(over: Partial<NormalComparison> = {}): NormalComparison {
  return { percentOfNormal: 80, normalCovers: 12, count: 12, normalBaseline: "climate", ...over };
}

describe("the comparison with normal, in words", () => {
  /* The storage charts printed exactly these two sentences before the helper
   * existed. Their visible text must not move when the map starts using it. */
  it("keeps the storage charts' sentence word for word", () => {
    expect(describeUsualStorage(comparison(), CHOICES))
      .toBe("Of the usual storage for this date, 1991 through 2020");
    expect(describeUsualStorage(comparison({ normalCovers: 11 }), CHOICES))
      .toBe("Of the usual storage for this date, 1991 through 2020, for 11 of 12 reservoirs");
  });

  /* ADR-041: the note names the period the figure was measured against. */
  it("names the period the figure used, not another", () => {
    expect(usualStorageClause(comparison({ normalBaseline: "recent" }), CHOICES))
      .toContain("2015 through 2025");
    expect(usualStorageClause(comparison({ normalBaseline: "recent" }), CHOICES))
      .not.toContain("1991");
  });
});

describe("the filtered subtotal", () => {
  const reservoirs = asScoped(readPayload().reservoirs);
  const area = reservoirs.map((reservoir) => reservoir.huc6)
    .find((code): code is string => typeof code === "string"
      && reservoirs.some((reservoir) => reservoir.huc6 !== code));
  const byArea: FilterState = { ...ALL_RESERVOIRS, drainageArea: area ?? null };

  it("is absent when nothing narrows the rows", () => {
    expect(filteredSubtotal(reservoirs, ALL_RESERVOIRS,
      { baseline: "climate", minimumBaselineYears: 10, month: null })).toBeNull();
  });

  it("totals exactly the rows the filter keeps", () => {
    expect(area).toBeDefined();
    const shown = reservoirs.filter((reservoir) => matchesFilter(reservoir, byArea));
    const subtotal = filteredSubtotal(reservoirs, byArea,
      { baseline: "climate", minimumBaselineYears: 10, month: null });
    const expected = rollupOfScoped(asScoped(shown),
      { baseline: "climate", minimumBaselineYears: 10 });

    expect(subtotal).not.toBeNull();
    expect(subtotal?.count).toBe(shown.length);
    expect(subtotal?.count).toBeLessThan(reservoirs.length);
    expect(subtotal?.percentFull).toBe(expected.percentFull);
    expect(subtotal?.normal?.percentOfNormal).toBe(expected.percentOfNormal);
    expect(subtotal?.normal?.normalBaseline).toBe("climate");
  });

  it("follows the chosen period", () => {
    const recent = filteredSubtotal(reservoirs, byArea,
      { baseline: "recent", minimumBaselineYears: 10, month: null });
    expect(recent?.normal?.normalBaseline).toBe("recent");
  });

  it("gives a past month's percent full and no normal", () => {
    const month = monthKeys(reservoirs).at(-1);
    expect(month).toBeDefined();
    if (!month) return;
    const shown = reservoirs.filter((reservoir) => matchesFilter(reservoir, byArea));
    const subtotal = filteredSubtotal(reservoirs, byArea,
      { baseline: "climate", minimumBaselineYears: 10, month });
    const monthly = monthlyRollup(shown, month);

    expect(subtotal?.normal).toBeNull();
    expect(subtotal?.month).toBe(month);
    expect(subtotal?.percentFull).toBe(monthly.percentFull);
    expect(subtotal?.reporting).toBe(monthly.reporting);
  });
});

describe("the subtotal in words", () => {
  const rollup = (over: Partial<StatewideRollup> = {}): StatewideRollup => ({
    ...rollupOfScoped(asScoped([])), count: 12, percentFull: 63.24,
    percentOfNormal: 88.06, normalCovers: 11, normalBaseline: "climate", ...over
  });

  it("states the count, percent full and the comparison with its period", () => {
    expect(describeSubtotal(
      { count: 12, percentFull: 63.24, normal: rollup(), month: null, reporting: 12 },
      CHOICES, null))
      .toBe("These 12 reservoirs are 63.2% full. They hold 88.1% of the usual storage "
        + "for this date, 1991 through 2020, for 11 of 12 reservoirs.");
  });

  it("says when no reservoir has the chosen period rather than borrow one", () => {
    const text = describeSubtotal(
      { count: 3, percentFull: 40, month: null, reporting: 3,
        normal: rollup({ count: 3, percentOfNormal: null, normalCovers: 0 }) },
      CHOICES, null);
    expect(text).toBe("These 3 reservoirs are 40.0% full. "
      + "None of them has a normal for 1991 through 2020.");
  });

  it("gives a past month without a normal", () => {
    const text = describeSubtotal(
      { count: 5, percentFull: 51, normal: null, month: "2026-03", reporting: 4 },
      CHOICES, "March 2026");
    expect(text).toBe("These 5 reservoirs were 51.0% full on average through March 2026. "
      + `4 of them reported that month. ${PAST_MONTH_NORMAL}`);
    expect(text).not.toMatch(/usual storage/);
  });

  it("speaks of one reservoir in the singular", () => {
    expect(describeSubtotal(
      { count: 1, percentFull: 70, month: null, reporting: 1,
        normal: rollup({ count: 1, normalCovers: 1, percentOfNormal: 95 }) },
      CHOICES, null))
      .toBe("This reservoir is 70.0% full. It holds 95.0% of the usual storage for "
        + "this date, 1991 through 2020.");
  });

  it("says when the filter matches nothing", () => {
    expect(describeSubtotal(
      { count: 0, percentFull: null, normal: rollup({ count: 0 }), month: null, reporting: 0 },
      CHOICES, null)).toBe("No reservoir matches the analysis controls.");
  });

  /* ADR-006: every sentence a reader sees is 25 words or fewer. */
  it("keeps every sentence within 25 words", () => {
    const texts = [
      describeSubtotal({ count: 120, percentFull: 63, normal: rollup({ count: 120,
        normalCovers: 119 }), month: null, reporting: 120 }, CHOICES, null),
      describeSubtotal({ count: 120, percentFull: 63, normal: null, month: "2025-11",
        reporting: 110 }, CHOICES, "November 2025")
    ];
    for (const text of texts) {
      for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z\d])/)) {
        expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(25);
      }
    }
  });
});

describe("the phone's summary over the map", () => {
  it("carries the place, the count and both percentages", () => {
    const text = mapSummaryText({
      place: "Utah", count: 45, percentFull: 60.12, percentOfNormal: 85.26, monthName: null,
      subtotal: null
    });
    expect(text.lines).toEqual(["Utah, 45 reservoirs", "60.1% full, 85.3% of normal"]);
    expect(text.action).toBe("Open the storage summary.");
  });

  it("drops the comparison on a past month and names the month", () => {
    const text = mapSummaryText({
      place: "All states", count: 1, percentFull: 50, percentOfNormal: 90,
      monthName: "May 2026", subtotal: null
    });
    expect(text.lines).toEqual(["All states, 1 reservoir", "50.0% full, May 2026"]);
    expect(text.lines.join(" ")).not.toContain("normal");
  });

  it("adds the filtered rows' subtotal as a third line", () => {
    const text = mapSummaryText({
      place: "Utah", count: 60, percentFull: 33.4, percentOfNormal: 56.1, monthName: null,
      subtotal: { count: 6, percentFull: 54.32 }
    });
    expect(text.lines).toEqual([
      "Utah, 60 reservoirs", "33.4% full, 56.1% of normal", "Subtotal: 6 reservoirs, 54.3% full"
    ]);
    const none = mapSummaryText({
      place: "Utah", count: 60, percentFull: 33.4, percentOfNormal: 56.1, monthName: null,
      subtotal: { count: 1, percentFull: null }
    });
    expect(none.lines[2]).toBe("Subtotal: 1 reservoir");
  });
});
