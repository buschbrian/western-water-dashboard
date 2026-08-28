/*
 * What a Snowpack page can say about one reservoir's committed upstream set.
 *
 * ADR-097 keeps three counts apart, and collapsing any two of them publishes
 * a false sentence:
 *
 *   indexed  -- stations the committed set names (ADR-077's membership);
 *   missing  -- of those, the ones today's snow payload does not carry;
 *   current  -- the sites left once the set and the chosen place intersect.
 *
 * A station that is measuring normally but sits outside an explicit `?state=`
 * is absent from `current` and still present in the payload. Only `missing`
 * may be described to a reader as data that is not there.
 */
export type UpstreamStatus = "applied" | "linked-site-wins" | "unavailable";

export interface UpstreamView {
  /** The reservoir `source_station_id` the link asked for. */
  station: string;
  reservoirName: string | null;
  indexedSites: number;
  /** Indexed stations with no site in the current snow payload. */
  missingSites: number;
  /** Sites left after the committed set and the selected place intersect.
   * Null when the filter was not applied, so nothing counted them. */
  currentSites: number | null;
  status: UpstreamStatus;
  linkedSiteName?: string;
}

/**
 * Indexed stations the current snow payload does not carry.
 *
 * The roster is every station the payload publishes, before any place
 * narrowing: a place removes a site from view, never from the data.
 */
export function missingStationCount(
  indexed: readonly string[], roster: ReadonlySet<string>
): number {
  return indexed.filter((station) => !roster.has(station)).length;
}

function sites(count: number): string {
  return `${count} site${count === 1 ? "" : "s"}`;
}

/** The active summary sentence, in Simplified Technical English (ADR-006). */
export function upstreamSummary(view: UpstreamView): string {
  const label = view.reservoirName ?? "the requested reservoir";
  if (view.status === "unavailable") {
    return `The upstream snow sites for ${label} could not be read. `
      + "The chosen place is shown instead.";
  }
  if (view.status === "linked-site-wins") {
    return `Showing the linked measurement site, `
      + `${view.linkedSiteName ?? "as requested"}. The upstream filter for `
      + `${label} was not applied because the site link is more specific.`;
  }
  const current = view.currentSites ?? 0;
  const shown = `Showing ${sites(current)} that `
    + `${current === 1 ? "measures" : "measure"} snow upstream of ${label}.`;
  /* Said only about stations the payload does not carry. A station the
   * reader's own place removed is not missing data. */
  return view.missingSites > 0
    ? `${shown} ${sites(view.missingSites)} in the committed set `
      + `${view.missingSites === 1 ? "is" : "are"} not in the current snow data.`
    : shown;
}
