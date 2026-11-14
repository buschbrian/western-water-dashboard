import { describe, expect, it } from "vitest";
import { SOIL_CLASSES } from "./soil-classes";
import { SOIL_HISTORY_CLASSES, soilHistoryClassIndex, soilHistoryLabel } from "./soil-history-classes";

describe("the soil classes against past years", () => {
  it("reuses the week's-change colours, drier brown and wetter blue, with no new colour", () => {
    const allowed = new Set(SOIL_CLASSES.map((row) => row.color));
    expect(SOIL_HISTORY_CLASSES.every((row) => allowed.has(row.color))).toBe(true);
    expect(new Set(SOIL_HISTORY_CLASSES.map((row) => row.color)).size).toBe(5);
    expect(SOIL_HISTORY_CLASSES[0]!.color).toBe(SOIL_CLASSES[0]!.color);
    expect(SOIL_HISTORY_CLASSES[2]!.color).toBe(SOIL_CLASSES[2]!.color);
    expect(SOIL_HISTORY_CLASSES[4]!.color).toBe(SOIL_CLASSES[5]!.color);
  });

  it("orders the classes driest first, as the refresh does", () => {
    expect(SOIL_HISTORY_CLASSES.map((row) => row.id)).toEqual(["much_drier", "drier", "normal", "wetter", "much_wetter"]);
    expect(soilHistoryClassIndex("normal")).toBe(2);
    expect(soilHistoryClassIndex(null)).toBe(-1);
    expect(soilHistoryLabel(null)).toBe("Not compared with past years");
  });
});
