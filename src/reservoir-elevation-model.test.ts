import { describe, expect, it } from "vitest";
import { syntheticElevation, syntheticProjectElevation } from "./data/elevation-fixture";
import { readPayload } from "./data/payload-fixture";
import {
  datumNote, describeElevation, elevationChart, elevationLate, notDrawnSentence,
  waterYearLabel, waterYearLines, waterYearOf
} from "./reservoir-elevation-model";
import type { ElevationHistoryEntry, Reservoir } from "./types";

function reservoir(overrides: Partial<Reservoir> = {}): Reservoir {
  return { ...readPayload().reservoirs[0]!, name: "Testwater", elevation: syntheticElevation(),
    ...overrides };
}

/* Synthetic years: a level that falls 10 feet each spring, from a known start. */
function history(start: string, days: number): ElevationHistoryEntry {
  const first = Date.parse(`${start}T00:00:00Z`) / 86_400_000;
  const values = Array.from({ length: days }, (_, index) =>
    index === 40 ? null : 3500 + 10 * Math.sin((index / 365) * 2 * Math.PI));
  const end = new Date((first + days - 1) * 86_400_000).toISOString().slice(0, 10);
  return { name: "Testwater", source_station_id: "1", source_item_id: 2, vertical_datum: "NGVD29",
    start, end, values };
}

describe("the surface level card", () => {
  it("is the lakes page's level card, in feet above a datum named in full", () => {
    const view = describeElevation(reservoir(), "2026-10-21T12:00:00Z")!;
    expect(view.card.heading).toBe("Surface level");
    expect(view.card.headline).toBe("3,500.25 feet");
    expect(view.card.basis).toBe("above the National Geodetic Vertical Datum of 1929");
    const labels = view.card.rows.map((row) => row.label);
    expect(labels).toEqual(expect.arrayContaining(
      ["Reading date", "Highest reading", "Lowest reading", "History rank", "Change in 7 days",
        "Record starts"]));
    expect(view.card.rows.find((row) => row.label === "Change in 7 days")!.value)
      .toBe("+1.50 feet since Oct 13, 2026");
    expect(view.card.rows.find((row) => row.label === "Change in 1 year")!.value)
      .toBe("No earlier reading to compare with.");
    expect(view.card.rows.find((row) => row.label === "History rank")!.value).toBe("3rd-lowest of 40 years");
    expect(view.card.rows.map((row) => row.value).join(" ")).not.toMatch(/%/);
    expect(view.late).toBeNull();
  });

  it("is absent for a reservoir with no reviewed level", () => {
    const { elevation: _drop, ...plain } = reservoir();
    expect(describeElevation(plain as Reservoir, "2026-10-21")).toBeNull();
  });

  it("says when the level reading is late", () => {
    expect(elevationLate(syntheticElevation(), "2026-10-26", 2))
      .toBe("This level reading is late by 6 days.");
    expect(elevationLate(syntheticElevation(), "2026-10-21", 2)).toBeNull();
  });
});

describe("the datum note", () => {
  it("states both datums, the measured difference with its date, and the reading schedules", () => {
    const note = datumNote("Testwater", syntheticElevation());
    expect(note.heading).toBe("Why the Geological Survey can show a different level");
    const text = note.paragraphs.join(" ");
    expect(text).toContain("above the National Geodetic Vertical Datum of 1929");
    expect(text).toContain("North American Vertical Datum of 1988");
    expect(text).toContain("about 2.9 feet higher");
    expect(text).toContain("measured on Oct 27, 2026");
    expect(text).toContain("one reading each day");
    expect(text).toContain("every 15 minutes");
    expect(text).not.toMatch(/\bUSGS\b|\bRISE\b|NGVD|NAVD/);
    expect(note.links.map((link) => link.href)).toEqual([
      "https://data.usbr.gov/catalog/2362/item/508",
      "https://waterdata.usgs.gov/monitoring-location/USGS-09379900/"]);
  });

  it("names a project datum by its own name and never as the national one", () => {
    const project = reservoir({ elevation: syntheticProjectElevation() });
    const view = describeElevation(project, "2026-10-21")!;
    expect(view.card.basis).toBe("above the Bureau of Reclamation's Hoover Dam powerhouse datum");
    expect(view.card.rows.find((row) => row.label === "Level datum")!.value).toBe(
      "Add 0.55 feet to a level on this datum to give the level above the "
      + "National Geodetic Vertical Datum of 1929.");
    const text = view.note.paragraphs[0]!;
    expect(text).toContain("in feet above its own Hoover Dam powerhouse datum.");
    expect(text).toContain("Add 0.55 feet");
    expect(text).not.toMatch(/feet above the National Geodetic/);
  });

  it("says the record starts after first filling, with the date", () => {
    const view = describeElevation(reservoir({ elevation: syntheticProjectElevation() }), "2026-10-21")!;
    expect(view.card.rows.find((row) => row.label === "Record starts")!.value).toBe(
      "Aug 6, 1941, when Testwater first rose to the spillway. The highest and lowest "
      + "readings and the history rank start on this date. Readings from the first filling "
      + "are on the chart only.");
    expect(describeElevation(reservoir(), "2026-10-21")!.card.rows
      .find((row) => row.label === "Record starts")!.value).toBe("Jan 1, 1965");
  });

  it("says when the operator does not state the reference levels' datum", () => {
    const text = datumNote("Testwater", syntheticProjectElevation()).paragraphs.join(" ");
    expect(text).toContain("does not state whether the reference levels on the chart use this "
      + "datum or the National Geodetic Vertical Datum of 1929, which gives a number 0.55 feet higher.");
    expect(datumNote("Testwater", syntheticElevation()).paragraphs.join(" "))
      .not.toContain("does not state whether");
  });

  it("states a calculated difference as calculated, and claims no Geological Survey series", () => {
    const note = datumNote("Testwater", syntheticProjectElevation());
    const text = note.paragraphs.join(" ");
    expect(note.heading).toBe("Why other sources can show a different level");
    expect(text).toContain("about 2.9 feet higher than this number");
    expect(text).toContain("It is not a measurement at the reservoir.");
    expect(text).not.toMatch(/Geological Survey also measures|every 15 minutes|was measured on/);
    expect(note.links.map((link) => link.text)).toEqual([
      "Bureau of Reclamation readings for Testwater",
      "Bureau of Reclamation report that states this datum",
      "National Geodetic Survey marks on the dam"]);
  });

  it("says nothing about a difference that was never measured", () => {
    const note = datumNote("Testwater", syntheticElevation({ datum_offset: null }));
    expect(note.paragraphs.join(" ")).not.toMatch(/feet higher|feet lower/);
    expect(note.links).toHaveLength(1);
  });
});

describe("the water-year chart", () => {
  it("labels and places a date in its water year", () => {
    expect(waterYearOf("2026-10-01")).toBe(2027);
    expect(waterYearOf("2026-09-30")).toBe(2026);
    expect(waterYearLabel(2027)).toBe("2026–27");
  });

  it("draws the current year and the earlier ones, newest first, each from 1 October", () => {
    const lines = waterYearLines(history("2018-10-01", 365 * 8 + 30), 5);
    expect(lines).toHaveLength(6);
    expect(lines.map((line) => line.tier)).toEqual(
      ["current", "previous", "earlier", "earlier", "earlier", "earlier"]);
    expect(lines[0]!.points[0]![0]).toBe(0);
    expect(lines[1]!.points.length).toBeGreaterThanOrEqual(365);
    expect(lines[0]!.latest).not.toBeNull();
  });

  it("stops at the start of the record", () => {
    expect(waterYearLines(history("2024-10-01", 400), 5)).toHaveLength(2);
  });

  it("draws the reference levels near the readings and names the far ones", () => {
    const chart = elevationChart(reservoir(), history("2018-10-01", 365 * 8 + 30))!;
    /* Readings span about 3,490 to 3,510: 3,490 is inside them, the others are
     * far beyond half that range. */
    expect(chart.drawn.map((level) => level.elevation_ft)).toEqual([3490]);
    expect(chart.notDrawn.map((level) => level.elevation_ft)).toEqual([3370, 3700]);
    expect(chart.low).toBeLessThan(3490);
    expect(chart.high).toBeLessThan(3700);
    expect(notDrawnSentence(chart.notDrawn)).toContain("3,370 feet (Water below this level");
    expect(chart.ariaLabel).toContain("National Geodetic Vertical Datum of 1929");
  });
});
