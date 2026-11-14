/*
 * Which published scope picture, if any, shows exactly what the storage
 * charts page is showing.
 *
 * The Pages deploy draws a daily 1200 by 630 picture for the whole West
 * (`share/west.png`), each of the eleven states (`share/state-<code>.png`)
 * and each two-digit region (`share/region-<huc2>.png`), always with Lake
 * Powell and Lake Mead included (`src/build/share-pages.ts`). A picture is
 * offered only when the page's view is one of those: any other filter would
 * hand the reader a picture of different figures from the ones on screen.
 */
export interface ScopeView {
  state: string;
  area: string | null;
  county: string;
  query: string;
  cadence: string;
  storageClass: number | null;
  lakePowell: boolean;
  lakeMead: boolean;
}

const STATES = new Set(["AZ", "CA", "CO", "ID", "MT", "NV", "NM", "OR", "UT", "WA", "WY"]);

export function scopePictureSlug(view: ScopeView): string | null {
  if (!view.lakePowell || !view.lakeMead) return null;
  if (view.county !== "all" || view.query.trim() !== "" || view.cadence !== "all") return null;
  if (view.storageClass !== null) return null;
  if (view.state === "all" && view.area === null) return "west";
  if (view.area === null) return STATES.has(view.state) ? `state-${view.state.toLowerCase()}` : null;
  if (view.state === "all" && /^\d{2}$/.test(view.area)) return `region-${view.area}`;
  return null;
}
