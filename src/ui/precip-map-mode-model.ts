/*
 * The pure half of the precipitation map's "Rain | Soil moisture" switch
 * (ADR-142): what each state of the switch shows and hides. The section
 * (`precip-map-section.ts`) applies it to the page; nothing here touches
 * the DOM, so it is unit-tested.
 */
import { formatShortDate } from "../viz/format";

export type PrecipMapMode = "rain" | "soil" | "years";
export type SoilLoadState = "idle" | "loading" | "ready" | "failed";
/** The precipitation history the past-years mode needs (ADR-170): the card
 * fetches it, so the map only waits for it, has it, or hears it failed. */
export type YearsLoadState = "waiting" | "ready" | "failed";
/** What soil mode draws: each station against its own past years for the
 * date (ADR-169), or the week's change (ADR-142). */
export type SoilView = "history" | "change";

/** The view soil mode opens on: past years, unless the reader or the link
 * asked for the change, or no station in the file is compared yet. */
export function soilViewShown(requested: SoilView | null, comparedStations: number): SoilView {
  if (requested === "change") return "change";
  return comparedStations > 0 ? "history" : "change";
}

export interface PrecipMapModeView {
  /** The mode the map is drawn in: soil or past years falls back to rain when its file failed. */
  mode: PrecipMapMode;
  rainPressed: boolean;
  soilPressed: boolean;
  yearsPressed: boolean;
  /** The rain key, caption and table, against the soil ones and the
   * precipitation-against-past-years ones (ADR-170). */
  rainShown: boolean;
  soilShown: boolean;
  yearsShown: boolean;
  /** The card's day buttons and its list of recent totals. */
  recentListShown: boolean;
  /** Said beside the map when the soil file or the history could not load, else null. */
  failure: string | null;
}

export const SOIL_FAILED_TEXT = "The soil moisture measurements could not load. The map shows rain. Try again later.";

export const YEARS_FAILED_TEXT = "The past years could not load. The map shows rain. Try again later.";

export function precipMapModeView(
  requested: PrecipMapMode, soil: SoilLoadState, years: YearsLoadState = "waiting"
): PrecipMapModeView {
  const mode: PrecipMapMode = requested === "soil" ? (soil !== "failed" ? "soil" : "rain")
    : requested === "years" ? (years !== "failed" ? "years" : "rain") : requested;
  return {
    mode,
    rainPressed: mode === "rain",
    soilPressed: mode === "soil",
    yearsPressed: mode === "years",
    rainShown: mode === "rain",
    soilShown: mode === "soil",
    yearsShown: mode === "years",
    recentListShown: mode === "rain",
    failure: requested === "soil" && soil === "failed" ? SOIL_FAILED_TEXT
      : requested === "years" && years === "failed" ? YEARS_FAILED_TEXT : null
  };
}

export function precipMapLabel(mode: PrecipMapMode, view: SoilView = "change"): string {
  if (mode === "rain") return "Map of recent precipitation by drainage area and measurement site";
  if (mode === "years") return "Map of precipitation since 1 October compared with past years by drainage area and measurement site";
  return view === "history"
    ? "Map of soil moisture compared with past years by drainage area and measurement site"
    : "Map of the change in soil moisture this week by drainage area and measurement site";
}

/** The soil button's words: its end date once the file is in (ruling U6),
 * so the four days between it and the rain totals are on the switch. */
export function soilSwitchLabel(endDate: string | null): string {
  return endDate ? `Soil moisture to ${formatShortDate(endDate)}` : "Soil moisture";
}
