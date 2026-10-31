import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string): Promise<string> => readFile(resolve(root, file), "utf8");
const joinedPythonStrings = (source: string): string => source.replace(/["'()\s]/g, "");

const DAM_SERVICE =
  "https://geospatial.sec.usace.army.mil/dls/rest/services/NID/National_Inventory_of_Dams_Public_Service/FeatureServer/0";
const OLD_DAM_SERVICE =
  "https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/NID_v1/FeatureServer/0";

describe("the retired dam inventory layer", () => {
  /* The migration is done, so this test changed sides. It used to assert that
   * `add_dam_points.py` still named the retired layer -- the point being that
   * a half-finished migration must stay visible rather than look complete.
   * Now it asserts the opposite for every tool, which is what step 5 of the
   * inventory's migration plan asks for: "a regression test that rejects the
   * old service URL in active tools". The retired URL stays named in the
   * inventory document, because that is the record of what moved and why. */
  it("reads the dam inventory from the agency that maintains it", async () => {
    const inventory = await read("docs/AUTHORITATIVE-SOURCE-INVENTORY.md");
    expect(inventory).toContain(DAM_SERVICE);
    expect(inventory).toContain(OLD_DAM_SERVICE);
    expect(inventory).not.toContain("Migration candidate");

    for (const tool of ["tools/audit_candidate_capacity.py", "tools/add_dam_points.py",
      "tools/build_capacity_table.py", "tools/probe_huc_points.py",
      "tools/audit_connected_reservoirs.py"]) {
      const source = joinedPythonStrings(await read(tool));
      expect(source, `${tool} does not name the owner-operated dam service`)
        .toContain(DAM_SERVICE);
      expect(source, `${tool} still names the retired hosted layer`)
        .not.toContain(OLD_DAM_SERVICE);
    }

    /* The committed table and the payload that republishes it. `capacities.json`
     * credited the retired layer while already holding the owner service's
     * values, which is the failure mode a URL constant in a tool cannot catch:
     * the provenance was wrong in the file, not in the code. */
    for (const file of [
      "capacities.json", "reference.json", "admitted_reservoirs.json",
      "admitted_rise_reservoirs.json"
    ]) {
      const source = await read(file);
      expect(source, `${file} still credits the retired hosted layer`)
        .not.toContain(OLD_DAM_SERVICE);
    }
  });
});
