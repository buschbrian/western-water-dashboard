/* Reservoir lookup and labels for the typed selection (src/state/selection.ts).
 *
 * A link is the one part of a view a reader hands to somebody else, and every
 * way it can break is quiet: a shared name that opens the wrong reservoir, or
 * a label that collides and opens nothing. The URL codec is tested in
 * url.test.ts and the store in detail.test.ts.
 */
import { describe, expect, it } from "vitest";
import { findReservoir, reservoirLabel } from "./selection";
import { readPayload } from "../data/payload-fixture";

describe("telling two reservoirs with one name apart", () => {
  /* The west holds a Lost Creek in Utah and another in Oregon, 946 km apart
   * and differing by a factor of twenty in what they hold (ADR-066). */
  const lostCreekUt = { name: "Lost Creek", source_station_id: "544", state: "UT" };
  const lostCreekOr = {
    name: "Lost Creek", source_station_id: "14335040:OR:BOR", state: "OR"
  };
  const deerCreek = { name: "Deer Creek", source_station_id: "290", state: "UT" };
  const all = [lostCreekUt, lostCreekOr, deerCreek];

  it("labels a shared name with its state, and leaves a unique one alone", () => {
    expect(reservoirLabel(lostCreekUt, all)).toBe("Lost Creek, UT");
    expect(reservoirLabel(lostCreekOr, all)).toBe("Lost Creek, OR");
    /* Most reservoirs have their name to themselves, and a state on every
     * label is noise rather than precision. */
    expect(reservoirLabel(deerCreek, all)).toBe("Deer Creek");
  });

  it("finds a reservoir by the station that identifies it", () => {
    expect(findReservoir(all, "14335040:OR:BOR")).toBe(lostCreekOr);
    expect(findReservoir(all, "544")).toBe(lostCreekUt);
  });

  it("finds one by the qualified label a reader can see", () => {
    expect(findReservoir(all, "Lost Creek, OR")).toBe(lostCreekOr);
    expect(findReservoir(all, "lost creek, ut")).toBe(lostCreekUt);
  });

  it("still resolves a bare name that only one reservoir has", () => {
    // Every link written before ADR-066 carries one of these.
    expect(findReservoir(all, "Deer Creek")).toBe(deerCreek);
    expect(findReservoir([lostCreekUt, deerCreek], "Lost Creek")).toBe(lostCreekUt);
  });

  it("resolves a shared bare name to neither reservoir", () => {
    /* Picking the first would answer a question the link did not ask, and one
     * reservoir silently standing for another is the wrong number nothing
     * fails on -- which is why this project stopped keying on names. */
    expect(findReservoir(all, "Lost Creek")).toBeNull();
  });
});

describe("the labels the published roster produces", () => {
  /* Every label has to be unique, because the list, the table and the address
   * bar all carry it as the selection. Where a qualified label would still
   * collide -- two reservoirs with one name in one state -- this fails, and a
   * person decides what to call them rather than the site showing two
   * identical rows (ADR-066). */
  it("gives every published reservoir a label of its own", () => {
    const reservoirs = readPayload().reservoirs;
    const labels = reservoirs.map((reservoir) => reservoirLabel(reservoir, reservoirs));

    expect(new Set(labels).size).toBe(reservoirs.length);
  });

  it("resolves every one of those labels back to its own reservoir", () => {
    const reservoirs = readPayload().reservoirs;
    for (const reservoir of reservoirs) {
      const label = reservoirLabel(reservoir, reservoirs);
      expect(findReservoir(reservoirs, label)?.source_station_id)
        .toBe(reservoir.source_station_id);
      // And by the station, which is what identifies it.
      expect(findReservoir(reservoirs, reservoir.source_station_id ?? "")?.name)
        .toBe(reservoir.name);
    }
  });
});
