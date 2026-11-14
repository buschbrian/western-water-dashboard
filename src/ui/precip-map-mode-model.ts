/*
 * The pure half of the precipitation map's "Rain | Soil moisture" switch
 * (ADR-142): what each state of the switch shows and hides. The section
 * (`precip-map-section.ts`) applies it to the page; nothing here touches
 * the DOM, so it is unit-tested.
 */
import { formatShortDate } from "../viz/format";

export type PrecipMapMode = "rain" | "soil" | "years";
export type SoilLoadState = "idle" | "loading" | "ready" | "failed";

export interface PrecipMapModeView {
  /** The mode the map is drawn in: soil falls back to rain when its file failed. */
  mode: PrecipMapMode;
  rainPressed: boolean;
  soilPressed: boolean;
  yearsPressed: boolean;
  /** The rain key, caption and table, against the soil ones and the past-years ones. */
  rainShown: boolean;
  soilShown: boolean;
  yearsShown: boolean;
  /** The card's day buttons and its list of recent totals. */
  recentListShown: boolean;
  /** Said beside the map when the soil file could not load, else null. */
  failure: string | null;
}

export const SOIL_FAILED_TEXT = "The soil moisture measurements could not load. The map shows rain. Try again later.";

export function precipMapModeView(requested: PrecipMapMode, soil: SoilLoadState): PrecipMapModeView {
  const mode: PrecipMapMode = requested === "soil" ? (soil !== "failed" ? "soil" : "rain") : requested;
  return {
    mode,
    rainPressed: mode === "rain",
    soilPressed: mode === "soil",
    yearsPressed: mode === "years",
    rainShown: mode === "rain",
    soilShown: mode === "soil",
    yearsShown: mode === "years",
    recentListShown: mode === "rain",
    failure: requested === "soil" && soil === "failed" ? SOIL_FAILED_TEXT : null
  };
}

export function precipMapLabel(mode: PrecipMapMode): string {
  if (mode === "years") return "Map of precipitation since 1 October against past years by drainage area and measurement site";
  return mode === "rain"
    ? "Map of recent precipitation by drainage area and measurement site"
    : "Map of the change in soil moisture this week by drainage area and measurement site";
}

/** The soil button's words: its end date once the file is in (ruling U6),
 * so the four days between it and the rain totals are on the switch. */
export function soilSwitchLabel(endDate: string | null): string {
  return endDate ? `Soil moisture to ${formatShortDate(endDate)}` : "Soil moisture";
}
