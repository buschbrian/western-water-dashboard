import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateSoilMoisturePayload } from "./data/soil-validate";
import { SET_SHARE } from "./precip-model";
import {
  soilCountsText, soilLeftOutText, soilMapValues, soilMostChange, soilNoChangeText, soilNoSideText,
  setShareWords, soilWeekText, soilAreaHistoryClass, soilBandText, soilHistoryCountsText, soilHistoryLeftOutText,
  soilNoHistoryText
} from "./soil-map-model";
import type { SoilMoisturePayload, SoilMoistureSite } from "./types";

function site(station: string, change: number | null, reason: SoilMoistureSite["no_change_reason"] = null): SoilMoistureSite {
  return {
    station, depths_inches: [2, 8, 20], latest_date: "2026-10-26", late: false,
    end_percent: change === null ? null : 20 + change, start_percent: 20, change_points: change,
    no_change_reason: change === null ? reason ?? "missing_reading" : null,
    history_band: null, history_class: null, no_history_reason: "no_history"
  };
}

function payload(sites: SoilMoistureSite[]): SoilMoisturePayload {
  return {
    schema_version: 1, generated_at: "", as_of: "2026-10-27", change_days: 7,
    end_date: "2026-10-26", start_date: "2026-10-19", minimum_reporting_sites: 2,
    site_count: sites.length, measured_site_count: 0, frozen_site_count: 0, compared_site_count: 0, late_site_count: 0,
    missing_site_count: 0, rollups: [], sites
  };
}

describe("the soil map values", () => {
  const sites = [site("a", 3), site("b", -1), site("c", null, "frozen"), site("d", 12), site("e", -6)];
  const areas = new Map([["a", "1"], ["b", "1"], ["c", "1"], ["d", "2"], ["e", "3"], ["f", "3"]]);
  const floors = new Map([["1", 2], ["2", 2], ["3", 2]]);

  it("means an area's changes and holds it to the floor", () => {
    const values = soilMapValues(payload(sites), areas, floors);
    expect(values.areas.get("1")).toEqual({ meanPoints: 1, stations: 2, floor: 2 });
    expect(values.areas.get("2")).toEqual({ meanPoints: null, stations: 1, floor: 2 });
    expect(values.areas.get("3")).toEqual({ meanPoints: null, stations: 1, floor: 2 });
  });

  it("counts directions by the class table and ranks by the size of the move", () => {
    const values = soilMapValues(payload(sites), areas, floors);
    expect(values.counts).toEqual({ stations: 5, measured: 4, wetter: 2, steady: 1, drier: 1, frozen: 1 });
    expect(values.ranked.map((entry) => entry.station)).toEqual(["d", "e", "a", "b"]);
  });

  it("lists the largest wetter and the largest drier changes apart, four a side", () => {
    const many = [...sites, site("g", 2), site("h", 4), site("i", 7), site("j", 1.9), site("k", -2)];
    const manyAreas = new Map([...areas, ...["g", "h", "i", "j", "k"].map((key) => [key, "1"] as const)]);
    const most = soilMostChange(soilMapValues(payload(many), manyAreas, floors));
    expect(most.wetter.map((entry) => entry.station)).toEqual(["d", "i", "h", "a"]);
    expect(most.drier.map((entry) => entry.station)).toEqual(["e", "k"]);
  });

  it("leaves a side empty when no station moved that way by the steady band", () => {
    const wet = [site("a", 3), site("b", -1.5)];
    const most = soilMostChange(soilMapValues(payload(wet), areas, floors));
    expect(most.drier).toEqual([]);
    expect(soilNoSideText("drier")).toBe("No station got drier by 2 points or more.");
    expect(soilNoSideText("wetter")).toBe("No station got wetter by 2 points or more.");
  });

  it("uses only the stations in the place", () => {
    const values = soilMapValues(payload(sites), new Map([["a", "1"]]), floors);
    expect(values.sites.size).toBe(1);
    expect(values.areas.get("1")!.stations).toBe(1);
  });

  it("says why a station has no change", () => {
    expect(soilNoChangeText(site("c", null, "frozen"))).toBe("Frozen soil on one of the two days");
    expect(soilNoChangeText(undefined)).toBe("No soil sensors");
  });

  /* The page regroups from the place's own stations; over every station it
   * must reproduce the file's own area figures exactly. Read against the
   * file's own fields, never today's numbers. */
  it("reproduces the committed file's area figures over every station", () => {
    const soil = validateSoilMoisturePayload(JSON.parse(
      readFileSync(new URL("../soil_moisture.json", import.meta.url), "utf8")) as unknown);
    const inventory = JSON.parse(readFileSync(new URL("../snow_sites.json", import.meta.url), "utf8")) as
      { sites: { station: string; huc6: string }[] };
    const siteAreas = new Map(inventory.sites.map((entry) => [entry.station, entry.huc6]));
    const values = soilMapValues(soil, siteAreas,
      new Map(soil.rollups.map((rollup) => [rollup.huc6, rollup.minimum_reporting_sites])));
    for (const rollup of soil.rollups) {
      expect(values.areas.get(rollup.huc6), rollup.huc6).toEqual({
        meanPoints: rollup.mean_change_points, stations: rollup.measured_site_count,
        floor: rollup.minimum_reporting_sites
      });
    }
  });
});

describe("the soil sentences", () => {
  const counts = { stations: 10, measured: 8, wetter: 5, steady: 2, drier: 1, frozen: 1 };

  it("counts the place's stations by direction", () => {
    expect(soilCountsText(counts)).toBe(
      "Of the 8 stations with a change, 5 got wetter by 2 points or more, 1 got drier by 2 points or more, "
      + "and 2 stayed within 2 points.");
    expect(soilCountsText({ ...counts, measured: 0 })).toBe("None of the 10 stations with soil sensors has a change for this week.");
    expect(soilCountsText({ ...counts, stations: 0 })).toBe("No station in this place has soil sensors at the three depths.");
  });

  it("says who was left out and why", () => {
    expect(soilLeftOutText(counts)).toBe(
      "2 stations with soil sensors have no change this week, 1 of them because the soil was frozen. "
      + "The sensors measure to 0.1 percentage point.");
    expect(soilLeftOutText({ ...counts, measured: 10, frozen: 0 })).toBe("The sensors measure to 0.1 percentage point.");
  });

  it("names the week, or says there is none", () => {
    const values = soilMapValues(payload([]), new Map(), new Map());
    expect(soilWeekText(values)).toBe("The change is from Oct 19, 2026 to Oct 26, 2026. It ends on "
      + "Oct 26, the newest day on which 9 in 10 on-time stations sent readings at all three depths.");
    expect(soilWeekText({ ...values, endDate: null, startDate: null }))
      .toBe("Too few stations sent soil moisture to measure a week.");
  });

  it("states the same set-day share the soil refresh uses", () => {
    const source = readFileSync(new URL("../refresh_soil_moisture.py", import.meta.url), "utf8");
    const share = Number(/^END_DAY_SHARE = ([\d.]+)$/m.exec(source)?.[1]);
    expect(share).toBe(SET_SHARE);
    expect(setShareWords(share)).toBe(setShareWords());
  });
});

describe("the soil map against past years (ADR-168)", () => {
  const band = { years: 15, p10: 10, p25: 15, p50: 20, p75: 25, p90: 30 };
  const compared = (station: string, cls: SoilMoistureSite["history_class"]): SoilMoistureSite => ({
    station, depths_inches: [2, 8, 20], latest_date: "2026-10-26", late: false, end_percent: 20, start_percent: 20,
    change_points: 0, no_change_reason: null, history_band: band, history_class: cls,
    no_history_reason: cls === null ? "short_history" : null
  });

  it("takes an area's median class, nearer normal on an even split, held to the floor", () => {
    expect(soilAreaHistoryClass(["drier"], 2)).toBeNull();
    expect(soilAreaHistoryClass(["much_drier", "drier", "wetter"], 2)).toBe("drier");
    expect(soilAreaHistoryClass(["much_drier", "normal"], 2)).toBe("normal");
    expect(soilAreaHistoryClass(["much_wetter", "wetter"], 2)).toBe("wetter");
  });

  it("regroups the place's own stations and counts them by class", () => {
    const sites = [compared("a", "much_drier"), compared("b", "drier"), compared("c", null), compared("d", "wetter")];
    const values = soilMapValues(payload(sites), new Map([["a", "1"], ["b", "1"], ["c", "1"], ["d", "2"]]),
      new Map([["1", 2], ["2", 2]]));
    expect(values.historyAreas.get("1")).toEqual({ cls: "drier", stations: 2, floor: 2 });
    expect(values.historyAreas.get("2")).toEqual({ cls: null, stations: 1, floor: 2 });
    expect(values.historyCounts.compared).toBe(3);
    expect(soilHistoryCountsText(values.historyCounts)).toBe(
      "Of the 3 stations compared with their own past years, 2 are drier than normal for the date (1 much drier), "
      + "0 are normal, and 1 is wetter than normal (0 much wetter).");
    expect(soilHistoryLeftOutText(values.historyCounts)).toContain("1 station with soil sensors is not compared");
    expect(soilBandText(sites[0]!)).toBe("Normal for this date is 15.0 to 25.0 percent, the middle half of 15 past years.");
    expect(soilNoHistoryText(sites[2])).toBe("10 or fewer past years with a reading on this date");
  });
});
