import { describe, expect, it } from "vitest";
import {
  precipMapLabel, precipMapModeView, SOIL_FAILED_TEXT, soilSwitchLabel, YEARS_FAILED_TEXT
} from "./precip-map-mode-model";

/* ADR-142: one map, two modes. Soil mode hides the day buttons and the rain
 * list, and a soil file that could not load returns the map to rain rather
 * than leaving a soil key over rain colours. */
describe("the precipitation map's mode switch", () => {
  it("opens on rain with the day buttons and the rain list", () => {
    expect(precipMapModeView("rain", "idle")).toEqual({
      mode: "rain", rainPressed: true, soilPressed: false, yearsPressed: false,
      rainShown: true, soilShown: false, yearsShown: false, recentListShown: true, failure: null
    });
  });

  it("shows soil while its file loads and once it is in, with the day buttons hidden", () => {
    for (const state of ["loading", "ready"] as const) {
      const view = precipMapModeView("soil", state);
      expect(view.mode).toBe("soil");
      expect(view.soilPressed && view.soilShown && !view.rainShown && !view.recentListShown).toBe(true);
      expect(view.failure).toBeNull();
    }
  });

  it("falls back to rain and says so when the soil file failed", () => {
    const view = precipMapModeView("soil", "failed");
    expect(view.mode).toBe("rain");
    expect(view.rainPressed && view.rainShown && view.recentListShown).toBe(true);
    expect(view.failure).toBe(SOIL_FAILED_TEXT);
    expect(precipMapModeView("rain", "failed").failure).toBeNull();
  });

  it("shows past years with the day buttons hidden (ADR-170)", () => {
    const view = precipMapModeView("years", "failed");
    expect(view.mode).toBe("years");
    expect(view.yearsPressed && view.yearsShown && !view.rainShown && !view.recentListShown).toBe(true);
    expect(view.failure).toBeNull();
  });

  it("shows past years while the history loads and once it is in", () => {
    for (const years of ["waiting", "ready"] as const) {
      const view = precipMapModeView("years", "idle", years);
      expect(view.mode).toBe("years");
      expect(view.yearsShown && !view.rainShown && view.failure === null).toBe(true);
    }
  });

  it("falls back to rain and says so when the history failed, never a past-years key over rain", () => {
    const view = precipMapModeView("years", "idle", "failed");
    expect(view.mode).toBe("rain");
    expect(view.rainPressed && view.rainShown && view.recentListShown).toBe(true);
    expect(view.yearsPressed || view.yearsShown).toBe(false);
    expect(view.failure).toBe(YEARS_FAILED_TEXT);
    expect(precipMapModeView("rain", "idle", "failed").failure).toBeNull();
    expect(precipMapModeView("soil", "ready", "failed").mode).toBe("soil");
  });

  it("names the map for what it shows", () => {
    expect(precipMapLabel("years")).toContain("compared with past years");
    expect(precipMapLabel("rain")).toContain("recent precipitation");
    expect(precipMapLabel("soil")).toContain("change in soil moisture");
  });

  it("puts the soil end date on the switch once the file is in", () => {
    expect(soilSwitchLabel(null)).toBe("Soil moisture");
    expect(soilSwitchLabel("2026-10-26")).toBe("Soil moisture to Oct 26");
  });
});
