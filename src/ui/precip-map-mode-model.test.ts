import { describe, expect, it } from "vitest";
import { precipMapLabel, precipMapModeView, SOIL_FAILED_TEXT } from "./precip-map-mode-model";

/* ADR-142: one map, two modes. Soil mode hides the day buttons and the rain
 * list, and a soil file that could not load returns the map to rain rather
 * than leaving a soil key over rain colours. */
describe("the precipitation map's mode switch", () => {
  it("opens on rain with the day buttons and the rain list", () => {
    expect(precipMapModeView("rain", "idle")).toEqual({
      mode: "rain", rainPressed: true, soilPressed: false, rainShown: true, soilShown: false,
      recentListShown: true, failure: null
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

  it("names the map for what it shows", () => {
    expect(precipMapLabel("rain")).toContain("recent precipitation");
    expect(precipMapLabel("soil")).toContain("change in soil moisture");
  });
});
