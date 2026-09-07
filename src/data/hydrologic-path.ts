/*
 * One point's place in the Watershed Boundary Dataset hierarchy.
 *
 * HUC codes carry containment in their prefixes: the first two digits name
 * the region, the first four name the subregion, and all six name the basin.
 * They do not carry names. Those come from the same payload rosters the
 * controls use, so a detail surface cannot grow a second geography table.
 */
import { HUC_CODE } from "./huc";
import { parseDrainageUnits, referenceGeography } from "./boundaries";

export type HydrologicPathLevel = 2 | 4 | 6 | 8;

export interface HydrologicPathPart {
  level: HydrologicPathLevel;
  label: "Region" | "Subregion" | "Basin" | "Subbasin";
  code: string;
  /** Null when an older payload carries the code but not this level's roster. */
  name: string | null;
}

export interface HydrologicRosters {
  regions?: readonly { huc2: string; name: string }[];
  subregions?: readonly { huc4: string; name: string }[];
  subbasins?: readonly { huc8: string; name: string }[];
}

/**
 * Region, subregion and basin for one verified six-digit assignment.
 *
 * A malformed or differently-sized code is refused rather than sliced into
 * plausible-looking identifiers. A missing roster name stays null; the code
 * remains useful, but the client never invents a label the payload did not
 * publish.
 */
export function hydrologicPath(
  huc6: string | null | undefined,
  basinName: string | null | undefined,
  rosters: HydrologicRosters | null | undefined,
  huc8?: string | null,
  subbasinName?: string | null
): HydrologicPathPart[] {
  if (!huc6 || huc6.length !== 6 || !HUC_CODE.test(huc6)) return [];
  const huc2 = huc6.slice(0, 2);
  const huc4 = huc6.slice(0, 4);
  /* The subbasin is a fourth part only when the record carries one that
   * nests in its basin (ADR-103); a code that does not is refused rather
   * than shown beside a basin it is not inside. */
  const subbasin = huc8 && huc8.length === 8 && HUC_CODE.test(huc8) && huc8.startsWith(huc6)
    ? [{
      level: 8 as const,
      label: "Subbasin" as const,
      code: huc8,
      name: subbasinName
        ?? rosters?.subbasins?.find((entry) => entry.huc8 === huc8)?.name ?? null
    }]
    : [];
  return [
    {
      level: 2,
      label: "Region",
      code: huc2,
      name: rosters?.regions?.find((entry) => entry.huc2 === huc2)?.name ?? null
    },
    {
      level: 4,
      label: "Subregion",
      code: huc4,
      name: rosters?.subregions?.find((entry) => entry.huc4 === huc4)?.name ?? null
    },
    { level: 6, label: "Basin", code: huc6, name: basinName ?? null },
    ...subbasin
  ];
}

/**
 * The three named rosters a path needs, read from the reference export.
 *
 * The reservoir payload carries its own `watersheds` rosters; a payload that
 * does not (the terminal lakes, ADR-118) reads the names from the same file
 * the maps take their scopes from, one level at a time, so a lake's region
 * and subregion are named exactly as a reservoir's are. An export this cannot
 * read yields empty rosters, and the path shows its codes with no names --
 * the codes stay true, and nothing here invents a label.
 */
export function referenceRosters(reference: unknown): HydrologicRosters {
  const units = (level: 2 | 4 | 8) =>
    parseDrainageUnits(referenceGeography(reference, level)?.drainage, level);
  return {
    regions: units(2).map((area) => ({ huc2: area.huc6, name: area.name })),
    subregions: units(4).map((area) => ({ huc4: area.huc6, name: area.name })),
    subbasins: units(8).map((area) => ({ huc8: area.huc6, name: area.name }))
  };
}
