/*
 * The snowpack view's data shaping, kept pure so it can be tested against
 * the committed payload without a browser.
 *
 * The drainage-area curves are read from the payload's own rollups, never
 * recomputed here: the pipeline is the one place the rollup rule is written
 * (ADR-021 keeps snow ingestion in the refresh), and a second implementation
 * in the client is how the two would drift. The whole-region curve does not
 * exist in the payload, so it is computed here with the same rule the
 * pipeline uses, and a unit test holds the two implementations together by
 * recomputing a basin from its sites and comparing against the published
 * rollup, value for value.
 */
import type { DrainageScope } from "./data/boundaries";
import type {
  NullableNumber,
  SnowpackPayload,
  SnowRollup,
  SnowRollupDay,
  SnowSite
} from "./types";

export interface BasinChoice {
  code: string;
  label: string;
  siteCount: number;
}

export interface CurvePoint {
  date: string;
  /** Mean percent of the normal median, or null below the reporting floor. */
  percent: number | null;
  reportingSites: number;
  /**
   * The mean normal the percentage divides by, in inches.
   *
   * Published so a reader of the percentage can see what it is a percentage
   * *of*. Null on a day nothing reported, or for a curve built before this
   * carried it.
   */
  normalInches?: number | null;
  /** The mean depth itself, which is the number with meaning in October. */
  meanInches?: number | null;
}

export interface SiteRow {
  station: string;
  name: string;
  county: string;
  state: string;
  huc6: string;
  basinName: string;
  lat: number;
  lon: number;
  elevationFeet: number;
  latestDate: string;
  late: boolean;
  /** The newest reading, in inches of snow water equivalent. */
  inches: number | null;
  /** The normal median for the same day, in inches. */
  normalInches: number | null;
  /** Reading over normal, or null while the normal median is zero. */
  percent: number | null;
}

const roundTenth = (value: number): number => Math.round(value * 10) / 10;

/** The pipeline's own percent rule: null unless the normal median is above
 * zero, so a summer reading is never divided by nothing. */
export function percentOfNormal(
  value: number | null, median: number | null
): number | null {
  if (value === null || median === null || median <= 0) return null;
  return roundTenth((value / median) * 100);
}

/**
 * The payload regrouped into larger drainage areas.
 *
 * A reader may ask for subregions instead of basins (ADR-064), and what
 * changes is only how the same sites are grouped: 217 stations reporting into
 * 11 areas rather than 14. Every figure on the page is rebuilt from the
 * *sites*, never by averaging the published basin means -- those are means
 * over unequal numbers of stations, and a mean of them is a different number
 * with no name.
 *
 * The whole payload is rebuilt rather than the rollups alone, so nothing
 * downstream learns about levels: the picker, the curves, the site table, the
 * map and the `?basin=` link all read `huc6` and get whichever grouping the
 * reader asked for. It is the arrangement `validateSnowpackPayload` uses for
 * the shared water-year calendar, one level up.
 *
 * The names come from the payload's own subregion roster, which is names and
 * nothing else because the codes are the first four digits of one every site
 * already carries (ADR-060's rule, applied to this payload). An area with no
 * published name is labelled by its code, exactly as `parseDrainageUnits`
 * does.
 */
export function payloadAtLevel(
  payload: SnowpackPayload, level: number
): SnowpackPayload {
  if (level === 6) return payload;
  if (level >= 8) return payloadAtSubbasins(payload);
  /* The table for *this* level, not a fixed one. A coarser name cannot be
   * derived from a finer table -- `subregions` holds "Colorado Headwaters"
   * for 1401 and says nothing about what 14 is called -- so reading the
   * HUC-4 table while drawing regions labelled every one of them by code,
   * and the picker read "14 (137 sites)". */
  const names = new Map<string, string>(level <= 2
    ? (payload.regions ?? []).map((entry) => [entry.huc2, entry.name])
    : (payload.subregions ?? []).map((entry) => [entry.huc4, entry.name]));
  const label = (code: string): string => {
    const name = names.get(code);
    return name !== undefined && name !== "" ? name : code;
  };
  const sites = payload.sites.map((site) => {
    const code = site.huc6.slice(0, level);
    return { ...site, huc6: code, huc6_name: label(code) };
  });
  /* The pipeline's own floor, carried rather than chosen here: a coarser area
   * holds more stations, so the minimum that made a basin's mean publishable
   * cannot make a subregion's less so. */
  const floor = payload.rollups.reduce(
    (highest, rollup) => Math.max(highest, rollup.minimum_reporting_sites), 2);
  const grouped = new Map<string, SnowSite[]>();
  for (const site of sites) {
    const bucket = grouped.get(site.huc6);
    if (bucket) bucket.push(site);
    else grouped.set(site.huc6, [site]);
  }
  const rollups: SnowRollup[] = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, members]) => ({
      huc6: code,
      huc6_name: label(code),
      site_count: members.length,
      minimum_reporting_sites: floor,
      series: seriesOverSites(members, floor)
    }));
  return { ...payload, sites, rollups };
}

/**
 * The payload regrouped one level finer than it was published (ADR-103).
 *
 * The same rule as the coarser regrouping above, with one difference that
 * is the whole reason the field exists: a subbasin code is a prefix of
 * nothing, so it is read from each site's own `huc8` rather than sliced
 * from `huc6`. A site the pipeline could not place in a subbasin is left
 * out of this grouping rather than filed under its basin's code, because a
 * six-digit code among eight-digit ones would draw as an area nothing on
 * the map is named for. Names come from the payload's own `subbasins`
 * table, and an area it does not name is labelled by its code.
 *
 * The reporting floor is carried, not lowered: a finer area holds fewer
 * stations, and the pipeline's minimum is what made a mean publishable at
 * all. Many subbasins will therefore read "not measured", which is the
 * honest answer for one station's worth of snow (ADR-059).
 */
function payloadAtSubbasins(payload: SnowpackPayload): SnowpackPayload {
  const names = new Map<string, string>(
    (payload.subbasins ?? []).map((entry) => [entry.huc8, entry.name]));
  const label = (code: string): string => {
    const name = names.get(code);
    return name !== undefined && name !== "" ? name : code;
  };
  const sites = payload.sites.flatMap((site) => {
    const code = site.huc8;
    if (typeof code !== "string" || code.length !== 8) return [];
    return [{ ...site, huc6: code, huc6_name: site.huc8_name || label(code) }];
  });
  const floor = payload.rollups.reduce(
    (highest, rollup) => Math.max(highest, rollup.minimum_reporting_sites), 2);
  const grouped = new Map<string, SnowSite[]>();
  for (const site of sites) {
    const bucket = grouped.get(site.huc6);
    if (bucket) bucket.push(site);
    else grouped.set(site.huc6, [site]);
  }
  const rollups: SnowRollup[] = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, members]) => ({
      huc6: code,
      huc6_name: label(code),
      site_count: members.length,
      minimum_reporting_sites: floor,
      series: seriesOverSites(members, floor)
    }));
  return { ...payload, sites, rollups };
}

/**
 * The payload narrowed to one state's sites, with every drainage-area figure
 * rebuilt from those sites -- never by averaging the published basin means
 * (the same rule `payloadAtLevel` follows for a coarser grouping, and
 * ADR-064's rule for the level control, extended here to a state filter).
 *
 * Unlike `payloadAtLevel`, the areas themselves do not change shape: a state
 * filter narrows which sites count inside each already-published area, it
 * does not merge several areas into one. So each area keeps its own
 * published `minimum_reporting_sites` rather than borrowing the highest
 * floor on the payload -- there is no new, coarser area whose old floor
 * would be too strict for it.
 *
 * An area with no sites left in this state is dropped from `rollups`
 * entirely, not published with an empty series: there is nothing to recompute
 * a mean from, which is a different fact from every day of that mean falling
 * below the reporting floor. An area that keeps some sites but fewer than its
 * floor stays in `rollups` -- its `series` is exactly what `seriesOverSites`
 * already produces below the floor, `mean_percent_of_normal_median: null` on
 * every day, which is how this payload has always said "not measured" rather
 * than printing a zero (ADR-059).
 *
 * `"all"` returns the payload unchanged, the same sentinel `reservoirInState`
 * reads in `overview-model.ts`.
 */
function payloadForSelectedSites(
  payload: SnowpackPayload, sites: SnowSite[]
): SnowpackPayload {
  const floors = new Map(
    payload.rollups.map((rollup) => [rollup.huc6, rollup.minimum_reporting_sites]));
  const names = new Map(
    payload.rollups.map((rollup) => [rollup.huc6, rollup.huc6_name]));
  const grouped = new Map<string, SnowSite[]>();
  for (const site of sites) {
    const bucket = grouped.get(site.huc6);
    if (bucket) bucket.push(site);
    else grouped.set(site.huc6, [site]);
  }
  const rollups: SnowRollup[] = [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([code, members]) => {
      const floor = floors.get(code) ?? 2;
      return {
        huc6: code,
        huc6_name: names.get(code) ?? code,
        site_count: members.length,
        minimum_reporting_sites: floor,
        series: seriesOverSites(members, floor)
      };
    });
  return payloadForSites(payload, sites, rollups);
}

export function payloadForState(
  payload: SnowpackPayload, state: string
): SnowpackPayload {
  if (state === "all") return payload;
  return payloadForSelectedSites(
    payload, payload.sites.filter((site) => site.state === state));
}

/**
 * The payload narrowed to an unordered set of station identifiers.
 *
 * This is the client-side half of the committed upstream index (ADR-077):
 * the index decides membership, while this function rebuilds every area
 * and every page total from the current snow payload's matching sites. It
 * uses the same ratio-of-sums series builder as state narrowing and level
 * regrouping; published area percentages are never averaged together.
 */
export function payloadForStationSet(
  payload: SnowpackPayload, stations: Iterable<string>
): SnowpackPayload {
  const wanted = stations instanceof Set ? stations : new Set(stations);
  return payloadForSelectedSites(
    payload, payload.sites.filter((site) => wanted.has(site.station)));
}

/**
 * A payload's trailing per-payload totals (`site_count`, `late_site_count`),
 * rebuilt from a caller's own narrowed `sites` and `rollups` -- every other
 * field carried through unchanged.
 *
 * One place for the shape every narrowing pass returns, so it cannot drift
 * between a pass that recomputes each surviving area's mean from its own
 * sites (`payloadForState`, above) and one that only drops whole areas
 * wholesale without touching any series (the opening scope's area pass in
 * `snow.ts`, which narrows a payload `payloadForState` has already
 * narrowed once).
 */
export function payloadForSites(
  payload: SnowpackPayload, sites: SnowSite[], rollups: SnowRollup[]
): SnowpackPayload {
  return {
    ...payload,
    sites,
    rollups,
    site_count: sites.length,
    late_site_count: sites.filter((site) => site.late).length
  };
}

/** One mean per date over a set of sites: the ratio-of-sums rule
 * `build_rollups` uses in `refresh_snowpack.py`, and the one `regionCurve`
 * already reimplements for the whole region. A test holds all three
 * together. A day's percentage divides summed water by summed normals once,
 * never averages the sites' own ratios -- a site with a 0.1-inch normal must
 * not outvote a site with a 40-inch one. */
function seriesOverSites(
  sites: readonly SnowSite[], floor: number
): SnowRollupDay[] {
  const byDate = new Map<string, { value: number; normal: number; count: number }>();
  for (const site of sites) {
    for (const [date, value, median] of site.series) {
      if (value === null || median === null) continue;
      const bucket = byDate.get(date);
      if (bucket) {
        bucket.value += value; bucket.normal += median; bucket.count += 1;
      } else {
        byDate.set(date, { value, normal: median, count: 1 });
      }
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totals]) => ({
      date,
      reporting_site_count: totals.count,
      mean_percent_of_normal_median: totals.count >= floor && totals.normal > 0
        ? roundTenth(totals.value / totals.normal * 100)
        : null
    }));
}

/**
 * The drawn scope narrowed to the areas this payload measures.
 *
 * The maps draw 75 basins across the west and the snow network reports in 51
 * of them (`a598850 Take the snow network west`; 637 sites across 11
 * states). Drawing the other 24 here would put an outline on the one map
 * whose subject *is* the drainage areas with nothing behind it: no percent of
 * normal, no site, and a hover card that comes back empty -- which ADR-050
 * already judges to be less information rather than more.
 *
 * Deliberately not the same answer as the drought map's, which draws all 75
 * because it has a measurement for all 75. Each map draws what it can say
 * something about.
 */
/**
 * Whether an area holds enough sites to ever publish a mean.
 *
 * One predicate, because the map, the basin picker and the `?basin=` link are
 * three ways to the same card: an area offered by one and missing from
 * another is a control that does nothing. Written twice it would eventually
 * be two different rules.
 */
export function areaCanReport(
  rollup: { site_count: number; minimum_reporting_sites: number }
): boolean {
  return rollup.site_count >= rollup.minimum_reporting_sites;
}

export function measuredScope(
  scope: DrainageScope, payload: SnowpackPayload
): DrainageScope {
  /* A rollup is not the same as something to say.
   *
   * The payload publishes a rollup for every area the network reaches, and
   * an area holding fewer sites than its own reporting floor publishes no
   * mean at all -- nothing rather than zero, which is the right way round.
   * But it still has a rollup, so filtering on "has a rollup" drew it: an
   * outline a reader can point at, hover, and get nothing back from. That is
   * exactly what ADR-050 refuses -- a shape with no figure behind it is less
   * information rather than more -- and it is the same rule that keeps the
   * drought map to the areas its engine measures.
   *
   * Structural, not seasonal. This drops an area that can *never* meet its
   * floor because it does not hold enough sites, which is a fact about the
   * network rather than about today: San Joaquin and North Lahontan each
   * hold one site against a floor of two. An area with enough sites that
   * happen to be quiet today keeps its outline and reads as having no value
   * today, which is a different statement and the true one. */
  const measured = new Set(payload.rollups
    .filter(areaCanReport)
    .map((rollup) => rollup.huc6));
  return {
    level: scope.level,
    areas: scope.areas.filter((area) => measured.has(area.huc6))
  };
}

export function basinChoices(payload: SnowpackPayload): BasinChoice[] {
  /* The same floor the map draws by. An area the map cannot draw must not be
   * offered here either, or the picker holds a choice that changes nothing. */
  return payload.rollups
    .filter(areaCanReport)
    .map((rollup) => ({
      code: rollup.huc6,
      label: rollup.huc6_name,
      siteCount: rollup.site_count
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** A drainage area's published seasonal curve, or null for an unknown code. */
export function basinCurve(
  payload: SnowpackPayload, huc6: string
): CurvePoint[] | null {
  const rollup = payload.rollups.find((entry) => entry.huc6 === huc6);
  if (!rollup) return null;
  /* The percentage stays the pipeline's own answer, so the curve and the map
   * cannot disagree. The normal beside it is computed here from this area's
   * sites, because the rollup does not publish what its own figure divides
   * by -- and rebuilding from sites is the rule anyway (ADR-064). */
  const normals = meanNormalsByDate(
    payload.sites.filter((site) => site.huc6 === huc6));
  return rollup.series.map((day) => ({
    date: day.date,
    percent: day.mean_percent_of_normal_median,
    reportingSites: day.reporting_site_count,
    normalInches: normals.get(day.date)?.normal ?? null,
    meanInches: normals.get(day.date)?.depth ?? null
  }));
}

/**
 * The mean normal for each day, over the sites that reported that day.
 *
 * The same population the percentage is a mean over: a site with no reading
 * contributes to neither, so the two describe one set of stations. Averaging
 * every site's normal instead would divide one day's reporting sites by
 * another day's whole network.
 */
function meanNormalsByDate(
  sites: readonly SnowpackPayload["sites"][number][]
): Map<string, { normal: number; depth: number }> {
  const totals = new Map<string, { normal: number; depth: number; count: number }>();
  for (const site of sites) {
    for (const [date, value, median] of site.series) {
      if (value === null || median === null) continue;
      const bucket = totals.get(date);
      if (bucket) {
        bucket.normal += median; bucket.depth += value; bucket.count += 1;
      } else {
        totals.set(date, { normal: median, depth: value, count: 1 });
      }
    }
  }
  return new Map([...totals].map(([date, { normal, depth, count }]) =>
    [date, count > 0
      ? { normal: normal / count, depth: depth / count }
      : { normal: 0, depth: 0 }]));
}

/**
 * The whole region as one curve, computed from every site with the same
 * ratio-of-sums rule and the same reporting floor the per-area rollups
 * publish: summed water over summed normals, divided once.
 *
 * `mean(v) / mean(m)` is identically `sum(v) / sum(m)`, so the percent the
 * curve draws is now consistent with the `normalInches` and `meanInches`
 * pair it carries -- before, a day could show 0.17 inches against a
 * 0.02-inch normal while publishing 150%.
 */
export function regionCurve(payload: SnowpackPayload): CurvePoint[] {
  const floor = payload.rollups.reduce(
    (highest, rollup) => Math.max(highest, rollup.minimum_reporting_sites), 2);
  const byDate = new Map<string, { value: number; normal: number; count: number }>();
  for (const site of payload.sites) {
    for (const [date, value, median] of site.series) {
      if (value === null || median === null) continue;
      const bucket = byDate.get(date);
      if (bucket) {
        bucket.value += value; bucket.normal += median; bucket.count += 1;
      } else {
        byDate.set(date, { value, normal: median, count: 1 });
      }
    }
  }
  const normals = meanNormalsByDate(payload.sites);
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totals]) => ({
      date,
      reportingSites: totals.count,
      percent: totals.count >= floor && totals.normal > 0
        ? roundTenth(totals.value / totals.normal * 100)
        : null,
      normalInches: normals.get(date)?.normal ?? null,
      meanInches: normals.get(date)?.depth ?? null
    }));
}

function latestReading(site: SnowSite): {
  inches: number | null; normalInches: number | null;
} {
  for (let index = site.series.length - 1; index >= 0; index -= 1) {
    const row = site.series[index];
    if (row && row[1] !== null) return { inches: row[1], normalInches: row[2] };
  }
  return { inches: null, normalInches: null };
}

/** The measurement sites in one drainage area, or all of them. The payload
 * is already ordered by area then name, and that order is kept. */
export function siteRows(
  payload: SnowpackPayload, huc6: string | null
): SiteRow[] {
  return payload.sites
    .filter((site) => huc6 === null || site.huc6 === huc6)
    .map((site) => {
      const { inches, normalInches } = latestReading(site);
      return {
        station: site.station,
        name: site.name,
        county: site.county,
        state: site.state,
        huc6: site.huc6,
        basinName: site.huc6_name,
        lat: site.lat,
        lon: site.lon,
        elevationFeet: site.elevation_feet,
        latestDate: site.latest_date,
        late: site.late,
        inches,
        normalInches,
        percent: percentOfNormal(inches, normalInches)
      };
    });
}

/** "October 2025 through September 2026" for water year 2026. */
export function seasonLabel(payload: SnowpackPayload): string {
  return `October ${payload.water_year - 1} through September ${payload.water_year}`;
}

export function normalPeriodLabel(payload: SnowpackPayload): string {
  return `${payload.normal_period.start_year} through ${payload.normal_period.end_year}`;
}

/*
 * The denominator floor, which the reporting floor below cannot supply.
 *
 * A ratio needs a denominator worth dividing by, and in October there is not
 * one. Measured on the 2026 water year: on 27 October, 147 sites reported --
 * far past any count floor -- and produced 266% of normal against a mean
 * normal of 0.24 inches. There was almost no snow and almost no normal, and
 * the page's largest number of the season described neither. 68 of the 287
 * days in that record have a mean normal under an inch.
 *
 * One inch is where a tenth of an inch of snow stops moving the figure by ten
 * points or more, which is the arithmetic the instability is made of rather
 * than a judgement about what counts as a real snowpack. Below it the
 * percentage is still computed and still drawn -- the curve is where a reader
 * goes to see the shape of a season, and cutting a hole in it would hide the
 * melt-out -- but nothing promotes it to a headline. The absolute depth takes
 * that place, because in October that is the number with meaning in it.
 */
export const MEANINGFUL_NORMAL_INCHES = 1;

/**
 * Whether a day's percentage is worth promoting, denominator and all.
 *
 * A point with no published normal passes: curves built before the normal
 * travelled with them are judged on the reporting floor alone, exactly as
 * they were.
 */
export function percentIsMeaningful(point: CurvePoint): boolean {
  if (point.percent === null) return false;
  const normal = point.normalInches;
  return normal === null || normal === undefined
    || normal >= MEANINGFUL_NORMAL_INCHES;
}

/**
 * The curve's points with every denominator-weak percentage removed.
 *
 * A ratio needs a denominator worth dividing by, and in October there is not
 * one: a handful of high stations divide small readings by small normals and
 * produce a 1,283% of normal that describes almost nothing. That point is
 * never shown as text anywhere -- a curve is a shape, not a number a reader
 * weighs against a note -- and it acts only by silently rescaling the axis,
 * so it belongs to the drawing, not to the headlines.
 *
 * This is where the floor lives now (a null, which `renderSnowCurve` draws
 * as a line break): not nulled in the payload, which publishes honest raw
 * data through data.html, and not only at the headline, which let the curve
 * rescale itself around values the headline refused. Leave
 * `newestHeadline`, `monthReadings` and the KPI path on the unfiltered
 * points -- they already apply their own, stricter floor.
 *
 * A point with no published normal passes unchanged: curves built before the
 * normal travelled with them are judged on the reporting floor alone,
 * exactly as they were.
 */
export function curveForDrawing(points: readonly CurvePoint[]): CurvePoint[] {
  return points.map((point) =>
    percentIsMeaningful(point) ? point : { ...point, percent: null });
}

/*
 * The KPI floor. The published curve needs two reporting sites for a fair
 * *daily mean* plus a meaningful normal for a drawable point, but a single
 * number promoted to a headline needs more: in mid-October a handful of high
 * stations divide small readings by small normals and produce a "115% of
 * normal" that describes almost nothing, and in June the last two unmelted
 * stations produce a 0% that describes even less. A headline reading requires
 * at least half the sites in view, and the note beside it says so. The curve
 * applies its own denominator floor through `curveForDrawing`; this floor is
 * about how many stations stand behind the one number a reader weighs.
 */
export function headlineFloor(siteCount: number, publishedFloor: number): number {
  return Math.max(publishedFloor, Math.ceil(siteCount / 2));
}

/** The newest day that meets both floors, or null when none does. */
export function newestHeadline(
  points: readonly CurvePoint[], floor: number
): CurvePoint | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]!;
    if (point.reportingSites >= floor && percentIsMeaningful(point)) return point;
  }
  return null;
}

/**
 * The newest day that meets the reporting floor, whatever its percentage is
 * worth.
 *
 * The depth-fallback headline uses this, not `newestReading`: a headline
 * refused by `newestHeadline` was refused for one of two reasons, and only
 * the denominator one may fall back to depth. This function still holds the
 * reporting floor, so when it answers, the only reason left is the
 * denominator -- which is what the caption beside the fallback says. Falling
 * back past the floor put the mean depth of October's first five stations in
 * the page's largest type, with a note blaming the normal.
 */
export function newestFloored(
  points: readonly CurvePoint[], floor: number
): CurvePoint | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]!;
    if (point.reportingSites >= floor) return point;
  }
  return null;
}

/** The newest day anything reported, whatever its percentage is worth. */
export function newestReading(points: readonly CurvePoint[]): CurvePoint | null {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index]!;
    if (point.reportingSites > 0) return point;
  }
  return null;
}

/**
 * The day the snowpack stood highest against its own normal, or null when no
 * day qualifies.
 *
 * Not the season's peak snow, which is `defaultMapDay` and is a different
 * question with a different answer: in the 2026 season this reads 78.4% on
 * 2026-01-08, while the deepest day is 2026-03-13 and is itself only 60.7%
 * of normal. The most water and the best showing against normal are rarely
 * the same day, and the page now names them apart -- "Best against normal"
 * here, "season high point" on the map.
 *
 * Both floors, like `newestHeadline`, and for the same reason. This function
 * held only the reporting floor, and the maximum of a ratio is exactly where
 * a weak denominator does its worst: on 2026-08-24 the published summary read
 * **10,250% of normal on 2025-10-04**, from 545 sites dividing a dusting by a
 * mean normal of four ten-thousandths of an inch. The reporting floor cannot
 * catch that -- every site in the region was reporting -- so the number
 * cleared the only gate it had, and it went out under the same name the map
 * was using for 2026-03-13.
 *
 * `curveForDrawing`'s note says to leave the KPI path unfiltered because it
 * "already appl[ies] its own, stricter floor". That was true of the newest
 * value and never true here.
 */
export function bestAgainstNormal(
  points: readonly CurvePoint[], floor: number
): CurvePoint | null {
  let best: CurvePoint | null = null;
  for (const point of points) {
    if (point.percent === null || point.reportingSites < floor) continue;
    if (!percentIsMeaningful(point)) continue;
    if (best === null || point.percent > (best.percent as number)) best = point;
  }
  return best;
}

/** One site's own reading for the chosen day, in the published units. */
export interface SiteDayDepth {
  inches: NullableNumber;
  normalInches: NullableNumber;
}

/** Everything the map colours for one day of the water year. */
export interface MapDayValues {
  /** Mean percent of normal per drainage area, from the published rollups. */
  basins: Map<string, number | null>;
  /** Percent of normal per station, from each site's own series. */
  sites: Map<string, number | null>;
  /**
   * Sites that reported for each drainage area that day.
   *
   * A separate fact from the mean, and the one a reader needs to weigh it:
   * an area at 46% of normal from eleven sites and the same figure from two
   * are different statements, and the fill draws them the same colour. The
   * map card says which.
   */
  reporting: Map<string, number>;
  /**
   * Depth per station, kept beside the percentage rather than derived from
   * it. The percentage is the framing everywhere in this view, but a card
   * that only gives a ratio cannot answer "of how much snow", and the two
   * numbers are already in the row the percentage was computed from.
   */
  depths: Map<string, SiteDayDepth>;
}

export function mapDayValues(
  payload: SnowpackPayload, date: string
): MapDayValues {
  const basins = new Map<string, number | null>();
  const reporting = new Map<string, number>();
  for (const rollup of payload.rollups) {
    const day = rollup.series.find((entry) => entry.date === date);
    basins.set(rollup.huc6, day ? day.mean_percent_of_normal_median : null);
    reporting.set(rollup.huc6, day ? day.reporting_site_count : 0);
  }
  const sites = new Map<string, number | null>();
  const depths = new Map<string, SiteDayDepth>();
  for (const site of payload.sites) {
    const row = site.series.find((entry) => entry[0] === date);
    sites.set(site.station, row ? percentOfNormal(row[1], row[2]) : null);
    depths.set(site.station, {
      inches: row ? row[1] : null,
      normalInches: row ? row[2] : null
    });
  }
  return { basins, sites, reporting, depths };
}

/** One day of the region's snow depth: the mean across every site that
 * reported a value, and how many did. */
export interface DepthPoint {
  date: string;
  meanInches: number;
  reportingSites: number;
}

/**
 * The region's snow depth day by day, in inches.
 *
 * The percent-of-normal curve cannot answer "when was there most snow",
 * because a ratio is small over small. A site that has melted out reports
 * zero and is counted: that is a real reading and it should pull the mean
 * down, which is exactly what makes this curve peak at the true maximum
 * rather than at the last day anyone measured.
 */
export function regionDepthCurve(payload: SnowpackPayload): DepthPoint[] {
  const byDate = new Map<string, number[]>();
  for (const site of payload.sites) {
    for (const [date, inches] of site.series) {
      if (inches === null) continue;
      const bucket = byDate.get(date);
      if (bucket) bucket.push(inches);
      else byDate.set(date, [inches]);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      meanInches: values.reduce((sum, value) => sum + value, 0) / values.length,
      reportingSites: values.length
    }));
}

/**
 * The day the map opens on: the season's peak snow.
 *
 * It used to be the newest day that met the reporting floor, and that was
 * wrong in a way only the data showed. Late in the melt season the newest
 * qualifying day is the *most depleted* day that still qualifies, so the map
 * opened on the worst picture of the year by construction -- in this record,
 * 2026-05-09, where every reporting basin sits under a quarter of normal and
 * the whole region is one colour.
 *
 * Peak snow, not peak percent of normal. That distinction was measured and it
 * matters: the highest percent-of-normal day in this record is 2025-12-06 at
 * 78% of normal, on a mean of 2.3 inches of snow -- a good ratio in early
 * December, when the normal it is divided by is also tiny. The peak depth day
 * is 2026-03-07, at 61% of normal on 8.4 inches. The first is arithmetically
 * the best day and hydrologically nearly meaningless; the second is the day
 * the snowpack actually held the most water, which is what a reader means by
 * the peak and what the rest of the year is judged against.
 *
 * The same half-the-sites floor applies, so a handful of high stations cannot
 * define the peak on their own.
 */
export function defaultMapDay(payload: SnowpackPayload): string | null {
  const floor = headlineFloor(payload.site_count, 2);
  let best: DepthPoint | null = null;
  for (const point of regionDepthCurve(payload)) {
    if (point.reportingSites < floor) continue;
    if (best === null || point.meanInches > best.meanInches) best = point;
  }
  /* Out of season, or a record too thin to find a peak in, falls back to the
   * newest day that met the floor -- which is the old behaviour, and still
   * the right answer when there is no peak to show. */
  return best?.date
    ?? newestHeadline(regionCurve(payload), floor)?.date
    ?? null;
}

/** One published day of one site's series, with the columns named. */
export interface SitePoint {
  date: string;
  inches: number | null;
  normalInches: number | null;
}

export function sitePoints(site: SnowSite): SitePoint[] {
  return site.series.map(([date, inches, normalInches]) => ({
    date, inches, normalInches
  }));
}

export function siteByStation(
  payload: SnowpackPayload, station: string
): SnowSite | null {
  return payload.sites.find((site) => site.station === station) ?? null;
}

/**
 * The site's normal season, as dates in this water year.
 *
 * The provider publishes the timing as a month and day; October through
 * December belong to the water year's opening calendar year, January
 * onward to its closing one. A site whose timing the provider omits
 * answers null, and the page says the timing is not published rather than
 * inventing one.
 */
export interface SiteTiming {
  onset: string | null;
  peakDate: string | null;
  peakInches: number | null;
  meltout: string | null;
}

function timingDate(
  point: { month: number; day: number } | null, waterYear: number
): string | null {
  if (!point) return null;
  const year = point.month >= 10 ? waterYear - 1 : waterYear;
  const month = String(point.month).padStart(2, "0");
  const day = String(point.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function siteTiming(site: SnowSite, waterYear: number): SiteTiming {
  const timing = site.normal_timing;
  return {
    onset: timingDate(timing.onset, waterYear),
    peakDate: timingDate(timing.peak, waterYear),
    peakInches: timing.peak?.value ?? null,
    meltout: timingDate(timing.meltout, waterYear)
  };
}

/** The highest reading of the season so far, or null before any value. */
export function observedPeak(
  points: readonly SitePoint[]
): { date: string; inches: number } | null {
  let best: { date: string; inches: number } | null = null;
  for (const point of points) {
    if (point.inches !== null && (best === null || point.inches > best.inches)) {
      best = { date: point.date, inches: point.inches };
    }
  }
  return best;
}

/** First-of-month rows for the table behind a site's curve. */
export interface SiteMonthReading {
  key: string;
  label: string;
  point: SitePoint | null;
}

export function siteMonthReadings(
  points: readonly SitePoint[]
): SiteMonthReading[] {
  const months = new Map<string, SitePoint | null>();
  for (const point of points) {
    const key = point.date.slice(0, 7);
    if (!months.has(key)) {
      months.set(key, point.date.endsWith("-01") ? point : null);
    }
  }
  return [...months.entries()].map(([key, point]) => {
    const monthIndex = Number(key.slice(5)) - 1;
    return {
      key,
      label: `${MONTH_NAMES[monthIndex] ?? key} ${key.slice(0, 4)}`,
      point
    };
  });
}

export interface MonthReading {
  /** "2025-10" */
  key: string;
  label: string;
  point: CurvePoint | null;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

/**
 * The first day of each month in the curve, for the table that carries the
 * chart's numbers as text. First-of-month rather than a monthly mean: it is
 * a reading the reader can point to on the chart, and "the value on the
 * first day of the month" needs no further explanation.
 */
export function monthReadings(points: readonly CurvePoint[]): MonthReading[] {
  const months = new Map<string, CurvePoint | null>();
  for (const point of points) {
    const key = point.date.slice(0, 7);
    if (!months.has(key)) {
      months.set(key, point.date.endsWith("-01") ? point : null);
    }
  }
  return [...months.entries()].map(([key, point]) => {
    const monthIndex = Number(key.slice(5)) - 1;
    return {
      key,
      label: `${MONTH_NAMES[monthIndex] ?? key} ${key.slice(0, 4)}`,
      point
    };
  });
}

/* ------------------------------------------------------------------ */
/* Narrowing the site table                                            */
/* ------------------------------------------------------------------ */

/**
 * The elevation bands the site filter offers.
 *
 * Snow behaves differently at different heights -- a low site melts out
 * weeks before a high one, so a regional mean mixes two seasons -- and these
 * three bands are where the region's own sites actually divide. They are
 * presentation, not a published classification, which is why they live here
 * beside the filter rather than in the payload.
 */
export type ElevationBand = "all" | "low" | "middle" | "high";

export const ELEVATION_BANDS: readonly ElevationBand[] = ["all", "low", "middle", "high"];

/** Feet. Inclusive at the bottom, exclusive at the top, like every other
 * class table in this project. */
export const ELEVATION_BREAKS = { low: 8000, high: 9500 } as const;

export function isElevationBand(value: string): value is ElevationBand {
  return (ELEVATION_BANDS as readonly string[]).includes(value);
}

export function elevationBandOf(feet: number): Exclude<ElevationBand, "all"> {
  if (feet < ELEVATION_BREAKS.low) return "low";
  if (feet < ELEVATION_BREAKS.high) return "middle";
  return "high";
}

export function elevationBandLabel(band: ElevationBand): string {
  if (band === "low") return `Below ${ELEVATION_BREAKS.low.toLocaleString("en-US")} feet`;
  if (band === "middle") {
    return `${ELEVATION_BREAKS.low.toLocaleString("en-US")} to ` +
      `${ELEVATION_BREAKS.high.toLocaleString("en-US")} feet`;
  }
  if (band === "high") return `${ELEVATION_BREAKS.high.toLocaleString("en-US")} feet and above`;
  return "Every elevation";
}

/** Which sites the reader wants: all of them, only the late ones, or only
 * the ones still sending values. */
export type SiteStatus = "all" | "late" | "reporting";

export const SITE_STATUSES: readonly SiteStatus[] = ["all", "late", "reporting"];

export function isSiteStatus(value: string): value is SiteStatus {
  return (SITE_STATUSES as readonly string[]).includes(value);
}

export interface SiteFilter {
  /** Matched against the site name and its county, case-insensitively. */
  query: string;
  band: ElevationBand;
  status: SiteStatus;
}

export const NO_SITE_FILTER: SiteFilter = { query: "", band: "all", status: "all" };

/**
 * The rows a filter leaves.
 *
 * The county is searched as well as the name because that is how people ask
 * for these sites out loud -- "the ones above Heber" is a county, not a
 * station name -- and the county is already in the table beside the name.
 */
export function filterSiteRows(
  rows: readonly SiteRow[], filter: SiteFilter
): SiteRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.band !== "all" && elevationBandOf(row.elevationFeet) !== filter.band) {
      return false;
    }
    if (filter.status === "late" && !row.late) return false;
    if (filter.status === "reporting" && row.late) return false;
    if (query.length > 0) {
      const haystack = `${row.name} ${row.county}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

/** True when the reader has narrowed anything. Not derived from a row count:
 * a filter that happens to keep every row is still a filter, and the page
 * says so rather than claiming nothing is applied. */
export function siteFilterActive(filter: SiteFilter): boolean {
  return filter.query.trim().length > 0 || filter.band !== "all" || filter.status !== "all";
}

/* ------------------------------------------------------------------ */
/* How the day's readings are spread                                   */
/* ------------------------------------------------------------------ */

/** How many sites fell in each snow class on one day, plus how many had no
 * fair value at all. Index matches `SNOW_CLASSES`. */
export interface SiteSpread {
  counts: number[];
  noValue: number;
  reporting: number;
}

/**
 * The spread of one day's site readings across the classes.
 *
 * The mean the map and the curve draw is one number over two hundred
 * stations, and it cannot tell a region that is uniformly at 70% from one
 * where half the sites are bare and half are near normal. Those are very
 * different winters and they matter to different people, so the page shows
 * the spread beside the mean.
 *
 * `classIndexOf` is injected rather than imported so this stays free of the
 * colour table: the model decides how many fell where, the view decides what
 * colour that is.
 */
export function siteSpread(
  values: ReadonlyMap<string, number | null>,
  classCount: number,
  classIndexOf: (percent: number | null) => number | null
): SiteSpread {
  const counts = new Array<number>(classCount).fill(0);
  let noValue = 0;
  for (const percent of values.values()) {
    const index = classIndexOf(percent);
    if (index === null || index < 0 || index >= classCount) noValue += 1;
    else counts[index] = (counts[index] ?? 0) + 1;
  }
  return { counts, noValue, reporting: values.size - noValue };
}
