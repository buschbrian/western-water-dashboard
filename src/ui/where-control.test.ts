/*
 * Only the pure half of the place menus is tested here -- `createWhereMenu`
 * and `createDrainageMenu` build real custom elements, and nothing in this
 * repo's test environment can exercise one outside a browser
 * (`ui/hover-content.test.ts` documents the same split for the hover cards).
 * `whereMenuView`, `drainageMenuView` and `nextSelectionFor*` are exactly
 * the surface a DOM layer would call, so pinning them down here pins down
 * the menus' real behaviour: what each menu offers, what it shows as
 * chosen, and what a reader's pick turns into.
 *
 * The synthetic roster below is the same shape `data/opening-scope.test.ts`
 * uses -- two regions, four subregions, five basins, with two basins
 * (140101/140102) sharing a subregion so "siblings are still offered" has
 * something real to check, and codes that nest the way real HUC codes do.
 */
import { describe, expect, it } from "vitest";
import type { DrainageArea, DrainageAreaBox } from "../data/boundaries";
import type { OpeningRosters, OpeningSelection } from "../data/opening-scope";
import {
  ALL_VALUE,
  drainageMenuView,
  nextSelectionForDrainageRow,
  nextSelectionForState,
  whereMenuView,
  type CountyChoice
} from "./where-control-model";

function box(west: number, south: number, east: number, north: number): DrainageAreaBox {
  return [[west, south], [east, north]];
}

function area(huc6: string, name: string, states: string, unitBox?: DrainageAreaBox): DrainageArea {
  return unitBox ? { huc6, name, states, box: unitBox } : { huc6, name, states };
}

const REGIONS: readonly DrainageArea[] = [
  area("14", "Upper Colorado Region", "AZ,CO,NM,UT,WY", box(-112, 35, -105, 43)),
  area("16", "Great Basin Region", "CA,ID,NV,OR,UT,WY", box(-120, 35, -110, 43))
];
const SUBREGIONS: readonly DrainageArea[] = [
  area("1401", "Colorado Headwaters", "CO,UT", box(-109, 38, -105, 40)),
  area("1402", "Gunnison", "CO", box(-108, 37, -106, 39)),
  area("1601", "Bear", "ID,UT,WY", box(-112, 41, -110, 43)),
  area("1602", "Great Salt Lake", "UT", box(-113, 40, -111, 41.5))
];
const AREAS: readonly DrainageArea[] = [
  area("140101", "Colorado Headwaters", "CO,UT", box(-109, 38, -107, 40)),
  // Sibling of 140101 under subregion 1401, no published box -- allowed
  // (S1) and irrelevant to option-building, which reads only the code and
  // the name.
  area("140102", "Upper Colorado-Dolores", "CO,UT"),
  area("140200", "Gunnison Basin", "CO", box(-108, 37, -106, 39)),
  area("160101", "Bear Lake", "ID,UT", box(-112, 41, -111, 42)),
  area("160201", "Great Salt Lake", "UT", box(-113, 40, -111, 41.5))
];

const ROSTERS: OpeningRosters = { regions: REGIONS, subregions: SUBREGIONS, areas: AREAS };

const ALL: OpeningSelection = { state: "all", area: null };

function values(list: readonly { value: string }[]): string[] {
  return list.map((entry) => entry.value);
}

describe("drainageMenuView: one menu across levels", () => {
  it("offers every tier at once, coarsest first, under one All row", () => {
    const view = drainageMenuView(ROSTERS, ALL);
    expect(values(view.options)).toEqual([
      ALL_VALUE,
      "14", "16",
      "1401", "1402", "1601", "1602",
      "140101", "140102", "140200", "160101", "160201"
    ]);
    expect(view.value).toBe(ALL_VALUE);
  });

  it("narrows by the chosen state but never by the chosen area", () => {
    // Region 14 touches CO and not ID; region 16 the reverse. The state
    // narrows because Where is coarser than Drainage.
    expect(values(drainageMenuView(ROSTERS, { state: "CO", area: null }).options))
      .toEqual([ALL_VALUE, "14", "1401", "1402", "140101", "140102", "140200"]);
    // A reader narrowed to subregion 1401 still sees every other family:
    // narrowing the menu against the reader's own pick would strand them.
    const view = drainageMenuView(ROSTERS, { state: "all", area: "1401" });
    expect(values(view.options)).toContain("1601");
    expect(values(view.options)).toContain("140200");
    expect(view.value).toBe("1401");
  });

  it("names a subregion at its own level, so it cannot be read as a basin", () => {
    // Subregion 1401 and basin 140101 are both named "Colorado Headwaters"
    // in this fixture, on purpose -- nineteen real drawn basins do this.
    const view = drainageMenuView(ROSTERS, ALL);
    const subregionOption = view.options.find((option) => option.value === "1401");
    expect(subregionOption?.label).toBe("Colorado Headwaters subregion");
    const basinOption = view.options.find((option) => option.value === "140101");
    expect(basinOption?.label).toBe("Colorado Headwaters");
  });

  it("shows a dead choice as All rather than as a value with no option", () => {
    const view = drainageMenuView(ROSTERS, { state: "ID", area: "1402" });
    expect(view.value).toBe(ALL_VALUE);
  });
});

describe("drainageMenuView: gating rows by what the surface can draw", () => {
  /* Snow's rule, spelled out with a publishable set that holds two of the
   * three basins of region 14 and nothing else. */
  const REPORTING = new Set(["140101", "140200"]);
  const include = (code: string): boolean => {
    if (code.length !== 6) {
      for (const tierCode of REPORTING) {
        if (tierCode.startsWith(code)) return true;
      }
      return false;
    }
    return REPORTING.has(code);
  };

  it("drops a basin row with no publishable figure", () => {
    const values_ = values(drainageMenuView(ROSTERS, ALL, include).options);
    expect(values_).toContain("140101");
    expect(values_).not.toContain("140102");
  });

  it("drops a coarser row whose every child is gone -- the empty-page repair per row", () => {
    const values_ = values(drainageMenuView(ROSTERS, ALL, include).options);
    // Subregion 1401 keeps basin 140101; region 16 loses everything.
    expect(values_).toContain("1401");
    expect(values_).not.toContain("1601");
    expect(values_).not.toContain("16");
  });

  it("never offers a row finer than the surface draws when the gate refuses it", () => {
    const snowAtSubregions = (code: string): boolean =>
      code.length <= 4 && ["1401", "1402"].some((prefix) => code.startsWith(prefix));
    const values_ = values(drainageMenuView(ROSTERS, ALL, snowAtSubregions).options);
    expect(values_.filter((value) => value.length === 6)).toEqual([]);
  });
});

/*
 * The nesting itself (ADR-076's shape carried to three tiers): each finer
 * section shows which coarser place its rows belong to, as indented group
 * headings rather than flyout submenus -- measured at 360px, where a
 * flyout is several screens of popup scroll.
 */
describe("drainageMenuView: the hierarchy shows inside the menu", () => {
  it("groups subregion rows under their region's published name", () => {
    const view = drainageMenuView(ROSTERS, ALL);
    const rows = view.options.filter((row) => row.value === "1401" || row.value === "1601");
    expect(rows.map((row) => row.group))
      .toEqual(["Upper Colorado Region", "Great Basin Region"]);
  });

  it("groups basin rows under their subregion's plain name", () => {
    // Plain, without the "subregion" suffix the option label carries: the
    // heading states a parent level, it does not offer a sibling.
    const view = drainageMenuView(ROSTERS, ALL);
    const rows = view.options.filter((row) => row.value === "140101" || row.value === "140102");
    expect(rows.map((row) => [row.label, row.group])).toEqual([
      ["Colorado Headwaters", "Colorado Headwaters"],
      ["Upper Colorado-Dolores", "Colorado Headwaters"]
    ]);
  });

  it("leaves the All row and the region rows ungrouped above every group", () => {
    const view = drainageMenuView(ROSTERS, ALL);
    expect(view.options[0]).toEqual({ value: ALL_VALUE, label: "All drainage areas" });
    for (const row of view.options.filter((entry) => entry.value.length === 2)) {
      expect(row.group).toBeUndefined();
    }
  });

  it("keeps same-group rows contiguous, which is what the renderer's one-run-per-heading rule needs", () => {
    const view = drainageMenuView(ROSTERS, ALL);
    const seen = new Map<string, number>();
    view.options.forEach((row, index) => {
      if (row.group !== undefined) {
        const first = seen.get(row.group);
        if (first !== undefined) {
          // Every later row of a heading must directly follow the run.
          expect(index).toBeGreaterThan(first);
        } else {
          seen.set(row.group, index);
        }
      }
    });
  });
});

describe("nextSelectionForDrainageRow", () => {
  it("sets the picked code at any width", () => {
    expect(nextSelectionForDrainageRow({ state: "UT", area: null }, ROSTERS, "140101"))
      .toEqual({ state: "UT", area: "140101" });
    expect(nextSelectionForDrainageRow({ state: "UT", area: "140101" }, ROSTERS, "14"))
      .toEqual({ state: "UT", area: "14" });
  });

  it("clears the area entirely on 'All' -- one menu spanning every level has no coarser tier to fall back to", () => {
    expect(nextSelectionForDrainageRow({ state: "UT", area: "140101" }, ROSTERS, ALL_VALUE))
      .toEqual({ state: "UT", area: null });
  });

  it("drops a pick the chosen state leaves nothing under, rather than honouring it", () => {
    expect(nextSelectionForDrainageRow({ state: "ID", area: null }, ROSTERS, "1401"))
      .toEqual({ state: "ID", area: null });
  });
});

describe("whereMenuView: states, with counties grouped beneath them", () => {
  const COUNTIES: readonly CountyChoice[] = [
    { fips: "49043", name: "Summit", state: "UT" },
    { fips: "08037", name: "Summit", state: "CO" },
    { fips: "49005", name: "Cache", state: "UT" },
    // Two counties of the same name in one state are one choice too many
    // for a label to carry; the FIPS is what makes them two values, and a
    // fixture holding both would be testing the resolver, not this view.
    { fips: "99001", name: "Nowhere", state: "ZZ" }
  ];

  it("offers every state the roster touches, then county rows grouped by state heading", () => {
    const view = whereMenuView(ROSTERS, ALL, COUNTIES);
    expect(values(view.options)).toEqual([ALL_VALUE, "CO", "ID", "UT", "08037", "49005", "49043"]);
    expect(view.options.map((option) => option.group)).toEqual([
      undefined, undefined, undefined, undefined, "Colorado", "Utah", "Utah"
    ]);
  });

  it("drops a county whose state the roster does not touch", () => {
    // ZZ names no offered state, so its heading would name nothing.
    const view = whereMenuView(ROSTERS, ALL, COUNTIES);
    expect(values(view.options)).not.toContain("99001");
  });

  it("keeps the FIPS as the value, whatever the row reads (ADR-058)", () => {
    const view = whereMenuView(ROSTERS, ALL, COUNTIES);
    const summit = view.options.filter((option) => option.label === "Summit County");
    expect(summit.map((option) => option.value)).toEqual(["08037", "49043"]);
  });

  it("marks an explicit county over the state, and the state otherwise", () => {
    expect(whereMenuView(ROSTERS, { state: "UT", area: null }, COUNTIES).value).toBe("UT");
    expect(whereMenuView(ROSTERS, { state: "UT", area: null }, COUNTIES, "49043").value)
      .toBe("49043");
    // A county the held state does not hold is not offered (the narrowing
    // rule above), and a value with no row behind it would read as whichever
    // option the browser lands on -- the state is the honest fallback.
    expect(whereMenuView(ROSTERS, { state: "UT", area: null }, COUNTIES, "08037").value)
      .toBe("UT");
  });

  /* ADR-084: "the county list narrows by the chosen state alone, as
   * ADR-076 left it." Without this, ?state=UT plus one click on another
   * state's county writes a pair that holds zero reservoirs -- the two
   * clicks the browser suite exists to make unreachable. */
  it("narrows county rows to the held state, keeping the headings", () => {
    const view = whereMenuView(ROSTERS, { state: "UT", area: null }, COUNTIES);
    // State rows stay whole -- they are how the reader moves; only county
    // rows narrow.
    expect(values(view.options)).toEqual([ALL_VALUE, "CO", "ID", "UT", "49005", "49043"]);
    expect(view.options.map((option) => option.group)).toEqual([
      undefined, undefined, undefined, undefined, "Utah", "Utah"
    ]);
  });

  it("offers every state's counties while no state is held", () => {
    const view = whereMenuView(ROSTERS, ALL, COUNTIES);
    expect(values(view.options)).toEqual([ALL_VALUE, "CO", "ID", "UT", "08037", "49005", "49043"]);
  });

  it("reads a held county outside the held state as the state, not as a row it does not offer", () => {
    // A link can carry ?state=UT&county=08037; nothing honest in the menu
    // matches, so the wider truth is what shows.
    const view = whereMenuView(ROSTERS, { state: "UT", area: null }, COUNTIES, "08037");
    expect(values(view.options)).not.toContain("08037");
    expect(view.value).toBe("UT");
  });

  it("offers states alone when no county material exists -- never a half-offered axis", () => {
    const view = whereMenuView(ROSTERS, ALL, []);
    expect(values(view.options)).toEqual([ALL_VALUE, "CO", "ID", "UT"]);
    for (const row of view.options) expect(row.group).toBeUndefined();
  });

  it("reads the sentinel back through the resolved selection", () => {
    expect(whereMenuView(ROSTERS, { state: "all", area: null }, []).value).toBe(ALL_VALUE);
  });
});

describe("nextSelectionForState", () => {
  it("keeps an area the new state still reaches", () => {
    const next = nextSelectionForState({ state: "all", area: "1401" }, ROSTERS, "CO");
    expect(next).toEqual({ state: "CO", area: "1401" });
  });

  it("drops an area the new state leaves nothing under", () => {
    const next = nextSelectionForState({ state: "all", area: "1402" }, ROSTERS, "ID");
    expect(next).toEqual({ state: "ID", area: null });
  });

  it("reads the sentinel back to the 'all' state", () => {
    const next = nextSelectionForState({ state: "CO", area: "14" }, ROSTERS, ALL_VALUE);
    expect(next.state).toBe("all");
  });
});

describe("whereMenuView: a host that brings its own states", () => {
  /* Overview skips the reference export when no link names a place, so its
   * rosters arrive empty and its payload carries the offered states instead.
   * The override must replace the roster-derived list entirely -- including
   * which counties can be grouped, since a county whose state the host did
   * not offer has no honest heading. */
  it("uses the given list and ignores the empty rosters", () => {
    const view = whereMenuView(
      { regions: [], subregions: [], areas: [] },
      { state: "UT", area: null },
      [{ fips: "49043", name: "Summit", state: "UT" }],
      null,
      [{ code: "UT", label: "Utah" }]
    );
    expect(values(view.options)).toEqual([ALL_VALUE, "UT", "49043"]);
    expect(view.options[1]!.label).toBe("Utah");
    expect(view.options[2]!.group).toBe("Utah");
    expect(view.value).toBe("UT");
  });

  it("drops counties under states the host did not offer", () => {
    const view = whereMenuView(
      { regions: [], subregions: [], areas: [] },
      { state: "all", area: null },
      [
        { fips: "49043", name: "Summit", state: "UT" },
        { fips: "08037", name: "Summit", state: "CO" }
      ],
      null,
      [{ code: "UT", label: "Utah" }]
    );
    expect(values(view.options)).toEqual([ALL_VALUE, "UT", "49043"]);
  });
});
