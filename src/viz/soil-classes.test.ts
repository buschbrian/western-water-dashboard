import { describe, expect, it } from "vitest";
import { CHANGE_CLASSES } from "./change-classes";
import { CAPACITY_RING_COLOR, STALE_COLOR, STORAGE_CLASSES } from "./classes";
import { DROUGHT_CLASSES } from "./drought-classes";
import { PRECIP_NO_VALUE_COLOR } from "./precip-classes";
import { SNOW_CLASSES } from "./snow-classes";
import { SOIL_CLASSES, SOIL_NO_VALUE_COLOR, soilChangeText, soilClassIndex } from "./soil-classes";

const channels = (hex: string): [number, number, number] =>
  [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number];
const linear = (value: number): number => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const gamma = (value: number): number => {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
};

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** CIELAB from sRGB, D65. */
function lab(rgb: readonly [number, number, number]): [number, number, number] {
  const [r, g, b] = rgb.map(linear) as [number, number, number];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number): number => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/* Machado, Oliveira and Fernandes (2009), severity 1: how each colour looks
 * to a reader with no working long, medium or short cones. */
const DEFICIENCIES: Record<string, readonly (readonly [number, number, number])[]> = {
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]]
};

function seen(hex: string, matrix?: readonly (readonly [number, number, number])[]): [number, number, number] {
  if (!matrix) return channels(hex);
  const rgb = channels(hex).map(linear);
  return matrix.map((row) => gamma(row[0] * rgb[0]! + row[1] * rgb[1]! + row[2] * rgb[2]!)) as [number, number, number];
}

const deltaE = (left: [number, number, number], right: [number, number, number]): number =>
  Math.hypot(...lab(left).map((value, index) => value - lab(right)[index]!));
const rgbDistance = (left: string, right: string): number =>
  Math.hypot(...channels(left).map((value, index) => (value - channels(right)[index]!) * 255));

describe("the soil-moisture class table", () => {
  it("keeps the decided breaks, drier to wetter", () => {
    expect(SOIL_CLASSES.map((entry) => [entry.direction, entry.min, entry.max])).toEqual([
      [-1, 5, null], [-1, 2, 5], [0, 0, 2], [1, 2, 5], [1, 5, 10], [1, 10, null]
    ]);
    expect(SOIL_CLASSES.map((entry) => entry.label)).toEqual([
      "Drier by 5 points or more", "Drier by 2 to 5 points", "Within 2 points: steady",
      "Wetter by 2 to 5 points", "Wetter by 5 to 10 points", "Wetter by 10 points or more"
    ]);
  });

  it("puts a change in the class its size reaches, the same either way", () => {
    expect(soilClassIndex(0)).toBe(2);
    expect(soilClassIndex(1.9)).toBe(2);
    expect(soilClassIndex(-1.9)).toBe(2);
    expect(soilClassIndex(2)).toBe(3);
    expect(soilClassIndex(-2)).toBe(1);
    expect(soilClassIndex(-4.9)).toBe(1);
    expect(soilClassIndex(-5)).toBe(0);
    expect(soilClassIndex(-30)).toBe(0);
    expect(soilClassIndex(5)).toBe(4);
    expect(soilClassIndex(9.9)).toBe(4);
    expect(soilClassIndex(10)).toBe(5);
    expect(soilClassIndex(40)).toBe(5);
  });

  /* "We did not measure this" and "this did not move" are two statements
   * (ADR-059): no change measured is grey, never the steady class. */
  it("gives no class to a missing value", () => {
    expect(soilClassIndex(null)).toBe(-1);
    expect(soilClassIndex(undefined)).toBe(-1);
    expect(soilClassIndex(Number.NaN)).toBe(-1);
    expect(SOIL_NO_VALUE_COLOR).toBe(PRECIP_NO_VALUE_COLOR);
  });

  it("says the direction in a word", () => {
    expect(soilChangeText(3.24)).toBe("3.2 points wetter");
    expect(soilChangeText(-12)).toBe("12.0 points drier");
    expect(soilChangeText(1)).toBe("1.0 point wetter");
    expect(soilChangeText(0)).toBe("No change");
    expect(soilChangeText(null)).toBe("No change measured");
  });

  /* Blue is wet on every map here; the precipitation map's two modes share
   * the snow table's ends, so the darkest brown and the deepest blue mean
   * the same direction in both. */
  it("takes its two ends from the snow table", () => {
    expect(SOIL_CLASSES[0]!.color).toBe(SNOW_CLASSES[0]!.color);
    expect(SOIL_CLASSES.at(-1)!.color).toBe(SNOW_CLASSES.at(-1)!.color);
  });

  /* ADR-008: never borrow a storage colour, and keep away from the drought
   * page's two tables. Measured nearest when written: 36.2, the steady
   * class against the storage table's palest. */
  it("keeps its distance from the storage, drought and drought-change colours", () => {
    const others = [
      ...STORAGE_CLASSES.map((entry) => entry.color), ...DROUGHT_CLASSES.map((entry) => entry.color),
      ...CHANGE_CLASSES.map((entry) => entry.color), STALE_COLOR, CAPACITY_RING_COLOR, PRECIP_NO_VALUE_COLOR
    ];
    for (const entry of SOIL_CLASSES) {
      for (const other of others) {
        expect(rgbDistance(entry.color, other), `${entry.label} ${entry.color} is near ${other}`).toBeGreaterThan(30);
      }
    }
  });

  /* A diverging scale reads in greyscale only if lightness rises from each
   * end to the middle. */
  it("gets lighter from each end toward steady", () => {
    const lightness = SOIL_CLASSES.map((entry) => lab(channels(entry.color))[0]);
    expect(lightness[0]!).toBeLessThan(lightness[1]!);
    expect(lightness[1]!).toBeLessThan(lightness[2]!);
    expect(lightness[2]!).toBeGreaterThan(lightness[3]!);
    expect(lightness[3]!).toBeGreaterThan(lightness[4]!);
    expect(lightness[4]!).toBeGreaterThan(lightness[5]!);
  });

  /* Neighbours are what a reader compares. Measured smallest when written:
   * 18.1 with full colour vision, 16.4 for protanopia and deuteranopia, and
   * 12.7 for tritanopia (wetter 5 to 10 against 10 or more). */
  it("keeps neighbouring classes apart with full and deficient colour vision", () => {
    const floors: Record<string, number> = { normal: 15, protanopia: 12, deuteranopia: 12, tritanopia: 10 };
    for (const [name, floor] of Object.entries(floors)) {
      const matrix = DEFICIENCIES[name];
      for (let index = 1; index < SOIL_CLASSES.length; index += 1) {
        const left = SOIL_CLASSES[index - 1]!;
        const right = SOIL_CLASSES[index]!;
        expect(deltaE(seen(left.color, matrix), seen(right.color, matrix)),
          `${name}: ${left.label} against ${right.label}`).toBeGreaterThan(floor);
      }
    }
  });

  /* Translucent fills over shaded relief, the snow table's constraint. */
  it("keeps every class visible as a translucent fill", () => {
    for (const entry of SOIL_CLASSES) {
      const value = luminance(entry.color);
      expect(value, `${entry.label} is washed out`).toBeLessThan(0.8);
      expect(value, `${entry.label} is nearly black`).toBeGreaterThan(0.05);
    }
  });
});
