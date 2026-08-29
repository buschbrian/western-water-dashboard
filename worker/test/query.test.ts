import { describe, expect, it } from "vitest";
import { answerFromIndex, validateIntent } from "../src/query";

describe("deterministic dashboard answers", () => {
  it("uses index numbers for a reservoir comparison", () => {
    const answer = answerFromIndex({ records: [
      { name: "Lake A", current_storage_af: 1000, pct_of_capacity: 50,
        as_of: "2026-08-28", source_label: "Owner A", source_url: "https://a.example",
        source_station_id: "a" },
      { name: "Lake B", current_storage_af: 900, pct_of_capacity: 75,
        as_of: "2026-08-28", source_label: "Owner B", source_url: "https://b.example",
        source_station_id: "b" }
    ] }, { topic: "reservoirs", operation: "compare", entities: ["Lake A", "Lake B"],
      level: null, unsupported: false });
    expect(answer.answer).toBe("Lake A is 50% full; Lake B is 75% full.");
    expect(answer.answer).not.toContain("90%");
  });

  it("refuses forecasts before it reads facts", () => {
    const answer = answerFromIndex({}, { topic: "out_of_scope", operation: "lookup",
      entities: [], level: null, unsupported: true });
    expect(answer.answer).toContain("cannot forecast");
    expect(answer.facts).toEqual([]);
  });

  it("refuses malformed model fields and oversized entity lists", () => {
    expect(validateIntent({ topic: "reservoirs", operation: "lookup",
      entities: ["a", "b", "c", "d", "e"], level: null, unsupported: false })).toBeNull();
    expect(validateIntent({ topic: "forecast", operation: "lookup",
      entities: [], level: null, unsupported: false })).toBeNull();
  });
});
