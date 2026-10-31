/*
 * The precipitation map's mode in the address bar (ADR-142): `?layer=soil`
 * opens the map on the week's change in soil moisture. Rain is the default
 * and is written as the absence of the parameter, so a link carries what the
 * reader changed and nothing else. An unknown value reads as rain. The
 * parameter is page-local and is not carried to the other pages. Same
 * mechanics as the other pages: `replaceState`, never `pushState`.
 */
import type { PrecipMapMode } from "../ui/precip-map-mode-model";

export function precipLayerFromSearch(search: string | null | undefined): PrecipMapMode {
  const values = new URLSearchParams(String(search ?? "").replace(/^\?+/, "")).getAll("layer");
  return values[values.length - 1] === "soil" ? "soil" : "rain";
}

export function precipLayerSearch(mode: PrecipMapMode, search: string | null | undefined): string {
  const params = new URLSearchParams(String(search ?? "").replace(/^\?+/, ""));
  if (mode === "soil") params.set("layer", "soil");
  else params.delete("layer");
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function writePrecipLayerUrl(mode: PrecipMapMode): void {
  const search = precipLayerSearch(mode, window.location.search);
  if (search === window.location.search) return;
  history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
}
