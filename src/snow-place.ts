/*
 * Which snow stations a place means, as the snow page decides it. Moved out
 * of `snow.ts` so the story views (ADR-128) scope a place with the same
 * functions rather than a copy of them. Pure: no `document`, so it is
 * unit-tested.
 */
import {
  areaAtLevel,
  resolveOpeningScope,
  withinOpeningArea,
  type OpeningRosters,
  type OpeningScope,
  type OpeningSelection
} from "./data/opening-scope";
import {
  basinChoices,
  payloadAtLevel,
  payloadForSites,
  payloadForState,
  siteRows
} from "./snow-model";
import type { SnowpackPayload } from "./types";

/**
 * The payload narrowed by the reader's opening scope -- `?state=` and
 * `?area=` together, already resolved against the published rosters and
 * coarsest-first fallback rules (`resolveOpeningScope`).
 *
 * `level` is this page's own grouping (`?level=`, ADR-064), independent of
 * `selection.area` -- a shared link can carry a six-digit basin while this
 * page draws at level four, and `withinOpeningArea` refuses to test a
 * shorter code against a longer selection rather than silently answering
 * "no match" for every record. `areaAtLevel` is what keeps that refusal
 * from ever firing here: the reader named a place and (elsewhere) a
 * granularity, and the place survives at the granularity this page is
 * actually drawing, coarsened, never refined upward.
 *
 * State narrows first, through `payloadForState`, which is the one place
 * the honesty rule is written: it regroups every surviving area's mean from
 * that area's own surviving *sites*, never by re-averaging the published
 * basin means (ADR-064; the module doc's "honesty constraint" names this as
 * the reason `resolveOpeningScope`'s own `state` axis stops at drainage
 * areas and leaves reservoirs and snow sites to their own exact rules).
 *
 * Area narrows second and needs no recompute of its own. `payloadForState`
 * has already rebuilt every surviving area's mean from its own sites, and
 * `payloadAtLevel`/`payloadForState` both group sites by their own exact
 * drainage-area code -- so a site inside an area that survives this second,
 * prefix-matched pass was never partially excluded from it. Dropping whole
 * areas that do not match the chosen region, subregion or basin changes
 * *which* means are shown, never what any surviving one means. A basin
 * whose mean already read `null` below the reporting floor keeps reading
 * `null` here -- this pass only removes areas, it never touches a series.
 *
 * Skipped entirely when the level-coarsened code already names one of this
 * level's own areas exactly: this page's own drainage-area picker
 * (`choices`, `currentArea`, below) already narrows precisely to a code
 * like that, and collapsing the payload here as well would make
 * `payload.site_count` -- this page's own "of N sites" total -- equal the
 * one narrowed area's count permanently, with no way for the picker's
 * "whole region" option to widen back out again. That exact case is the
 * ordinary, long-supported single-basin link this page has always carried;
 * only a code coarser than this level's own grouping -- a region, or a
 * subregion when this level's own areas are basins -- has no representation
 * in `choices` at all, and that is the case this pass exists for.
 */
export function payloadForOpeningScope(
  payload: SnowpackPayload, selection: OpeningSelection, level: number
): SnowpackPayload {
  const byState = payloadForState(payload, selection.state);
  const area = areaAtLevel(selection.area, level);
  if (area === null) return byState;
  if (byState.rollups.some((rollup) => rollup.huc6 === area)) return byState;
  const sites = byState.sites.filter((site) => withinOpeningArea(site.huc6, area));
  const rollups = byState.rollups.filter((rollup) => withinOpeningArea(rollup.huc6, area));
  return payloadForSites(byState, sites, rollups);
}

/**
 * The chosen region, subregion or basin's own published name, or `null`
 * when no area is chosen.
 *
 * Searches every level's option list rather than branching on the code's
 * own width, because the three lists never share a code and
 * `resolveOpeningScope` keeps each one level short of its own choice (its
 * own doc: "a subregion list narrowed down to the one subregion already
 * chosen would give a reader nothing to switch to"). So whichever list sits
 * at the width `selection.area` actually has is exactly the one still
 * carrying it as a sibling among its neighbours.
 */
export function openingAreaName(scope: OpeningScope): string | null {
  const code = scope.selection.area;
  if (code === null) return null;
  const roster = [...scope.regions, ...scope.subregions, ...scope.areas];
  return roster.find((entry) => entry.huc6 === code)?.name ?? null;
}

/** A place as a link names it: `?state=`, `?area=` and `?level=`. */
export interface SnowPlaceRequest {
  state: string;
  area: string | null;
  level: number;
}

export interface SnowPlace {
  /** The opening scope the request resolved to. `selection.area` is null
   * when the requested area is not a published place. */
  scope: OpeningScope;
  /** The payload regrouped at the level and narrowed to the place. */
  payload: SnowpackPayload;
  /** The area the snow page would hold as its own choice, or null. */
  area: string | null;
  /** The stations in view, in the payload's order: what the snow page hands
   * its precipitation card. */
  stations: string[];
}

/**
 * The snow page's scoping, in the order the page applies it: regroup at the
 * level, resolve the opening scope (the area at most six digits wide, as
 * `resolveOpeningPlace` reads it), narrow the payload, then hold the area
 * only when this level groups sites into it.
 */
export function snowPlace(
  raw: SnowpackPayload, rosters: OpeningRosters, request: SnowPlaceRequest
): SnowPlace {
  const selection: OpeningSelection = {
    state: request.state,
    area: request.area === null ? null : request.area.slice(0, 6)
  };
  const scope = resolveOpeningScope(selection, rosters);
  const payload = payloadForOpeningScope(payloadAtLevel(raw, request.level), scope.selection, request.level);
  const wanted = request.area;
  const area = wanted !== null && basinChoices(payload).some((choice) => choice.code === wanted)
    ? wanted : null;
  return { scope, payload, area, stations: siteRows(payload, area).map((row) => row.station) };
}
