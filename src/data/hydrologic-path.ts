/*
 * One point's place in the Watershed Boundary Dataset hierarchy.
 *
 * HUC codes carry containment in their prefixes: the first two digits name
 * the region, the first four name the subregion, and all six name the basin.
 * They do not carry names. Those come from the same payload rosters the
 * controls use, so a detail surface cannot grow a second geography table.
 */
import { HUC_CODE } from "./huc";

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
