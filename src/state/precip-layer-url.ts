/*
 * The precipitation map's mode in the address bar (ADR-142): `?layer=soil`
 * opens the map on the week's change in soil moisture. Rain is the default
 * and is written as the absence of the parameter, so a link carries what the
 * reader changed and nothing else. An unknown value reads as rain. The
 * parameter is page-local and is not carried to the other pages. Same
 * mechanics as the other pages: `replaceState`, never `pushState`.
 */
import type { PrecipMapMode, SoilView } from "../ui/precip-map-mode-model";

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

/*
 * Soil mode's view (ADR-169): `?layer=soil&soil=change` opens it on the
 * week's change. Past years are the default and are written as no
 * parameter; an unknown value reads as the default. The parameter is
 * written only while the map is on soil, so a rain link stays bare.
 */
export function soilViewFromSearch(search: string | null | undefined): SoilView | null {
  const values = new URLSearchParams(String(search ?? "").replace(/^\?+/, "")).getAll("soil");
  return values[values.length - 1] === "change" ? "change" : null;
}

export function soilViewSearch(mode: PrecipMapMode, view: SoilView, search: string | null | undefined): string {
  const params = new URLSearchParams(String(precipLayerSearch(mode, search)).replace(/^\?+/, ""));
  if (mode === "soil" && view === "change") params.set("soil", "change");
  else params.delete("soil");
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function writeSoilViewUrl(mode: PrecipMapMode, view: SoilView): void {
  const search = soilViewSearch(mode, view, window.location.search);
  if (search === window.location.search) return;
  history.replaceState(null, "", `${window.location.pathname}${search}${window.location.hash}`);
}
