/* The two CIM symbols the reservoir renderer is built from. Headless
 * Chromium draws the ArcGIS canvas blank, so a symbol the SDK silently
 * refuses -- which is how the template first shipped, as an empty map --
 * can only be caught here. */
import { describe, expect, it } from "vitest";
import { fillSizeExpression, ringSizeExpression } from "./arcade";
import { CAPACITY_RING_COLOR, STALE_ACCENT } from "./classes";
import {
  LATE_DASH, cimColor, circleRing, reservoirCIMTemplate, reservoirCIMTemplateSimple,
  type CIMTemplateSymbol
} from "./cim";
import { RESERVOIR_DETAIL_SCALE } from "./label-scales";

const DOMAIN = 1_000_000;
const GREEN = "#1a9850";

function layersOf(symbol: CIMTemplateSymbol) {
  return symbol.data.symbol.symbolLayers;
}

function layer(symbol: CIMTemplateSymbol, name: string) {
  return layersOf(symbol).find((candidate) => candidate.primitiveName === name);
}

function partsOf(symbol: CIMTemplateSymbol) {
  return layersOf(symbol).flatMap((candidate) =>
    candidate.markerGraphics.flatMap((graphic) => graphic.symbol.symbolLayers));
}

describe("CIM colour", () => {
  /* A plain `[r, g, b, a]` array, every channel 0-255, which is the shape
   * the SDK's own documentation uses. This was written as the specification's
   * `{ type: "CIMRGBColor", values: [...] }` object first; the SDK accepts
   * only the array and silently falls back to grey rather than failing, so
   * every reservoir drew the same grey while every test passed. The shape is
   * pinned here because the thing that would show it -- a screenshot -- is
   * blank in headless Chromium. */
  it("is a four-number array, not the specification's colour object", () => {
    const color = cimColor("#a50026");
    expect(Array.isArray(color)).toBe(true);
    expect(color).toHaveLength(4);
    for (const channel of color) expect(typeof channel).toBe("number");
  });

  it("splits #rrggbb into channels, with alpha on the same 0-255 scale", () => {
    expect(cimColor("#a50026")).toEqual([165, 0, 38, 255]);
    expect(cimColor("#000000", 46)).toEqual([0, 0, 0, 46]);
  });

  it("refuses a colour it cannot read rather than drawing black", () => {
    expect(() => cimColor("red")).toThrow();
    expect(() => cimColor("#fff")).toThrow();
  });
});

describe("circle geometry", () => {
  it("closes the ring on its first point", () => {
    const ring = circleRing();
    expect(ring.at(-1)).toEqual(ring[0]);
  });

  it("stays on the frame radius", () => {
    for (const [x = 0, y = 0] of circleRing()) {
      expect(Math.hypot(x, y)).toBeCloseTo(5, 3);
    }
  });
});

describe("the reservoir template symbols", () => {
  const builders = [
    ["detailed", reservoirCIMTemplate],
    ["simplified", reservoirCIMTemplateSimple]
  ] as const;

  it.each(builders)("%s: overrides only Size, and only on layers it names", (_, build) => {
    /* A Color override, or one naming a layer that is not there, makes the
     * SDK draw nothing at all rather than report a problem. */
    for (const late of [false, true]) {
      const symbol = build(DOMAIN, late, GREEN);
      const names = layersOf(symbol).map((candidate) => candidate.primitiveName);
      expect(symbol.data.primitiveOverrides.length).toBeGreaterThan(0);
      for (const entry of symbol.data.primitiveOverrides) {
        expect(entry.propertyName).toBe("Size");
        expect(names).toContain(entry.primitiveName);
      }
    }
  });

  it.each(builders)("%s: sizes the ring and fill from the layer's own fields", (_, build) => {
    const expressions = Object.fromEntries(build(DOMAIN, false, GREEN).data.primitiveOverrides
      .map((entry) => [entry.primitiveName, entry.valueExpressionInfo.expression]));
    expect(expressions["ring"]).toBe(ringSizeExpression(DOMAIN));
    expect(expressions["fill"]).toBe(fillSizeExpression(DOMAIN));
  });

  it.each(builders)("%s: gives every part a colour the SDK can read in a square frame", (_, build) => {
    const symbol = build(DOMAIN, true, GREEN);
    for (const part of partsOf(symbol)) {
      expect(Array.isArray(part.color), part.type).toBe(true);
      expect(part.color).toHaveLength(4);
    }
    for (const { frame } of layersOf(symbol)) {
      expect(frame.xmax - frame.xmin).toBe(frame.ymax - frame.ymin);
    }
  });

  it("colours the fill by class and the ring by capacity, amber and dashed when late", () => {
    const current = reservoirCIMTemplate(DOMAIN, false, GREEN);
    expect(layer(current, "fill")?.markerGraphics[0]?.symbol.symbolLayers[0])
      .toMatchObject({ type: "CIMSolidFill", color: cimColor(GREEN) });
    const stroke = layer(current, "ring")?.markerGraphics[0]?.symbol.symbolLayers[0];
    expect(stroke).toMatchObject({ color: cimColor(CAPACITY_RING_COLOR) });
    expect(stroke).not.toHaveProperty("effects");

    const late = layer(reservoirCIMTemplate(DOMAIN, true, GREEN), "ring")
      ?.markerGraphics[0]?.symbol.symbolLayers[0];
    expect(late).toMatchObject({
      color: cimColor(STALE_ACCENT),
      effects: [{ type: "CIMGeometricEffectDashes", dashTemplate: [...LATE_DASH] }]
    });
  });

  it("hands over between the two at one scale, the simplified one without shadow or dash", () => {
    const detailed = reservoirCIMTemplate(DOMAIN, true, GREEN);
    const simple = reservoirCIMTemplateSimple(DOMAIN, true, GREEN);
    expect(detailed.data).toMatchObject({ minScale: RESERVOIR_DETAIL_SCALE, maxScale: 0 });
    expect(simple.data).toMatchObject({ minScale: 0, maxScale: RESERVOIR_DETAIL_SCALE });

    expect(layersOf(detailed).map((candidate) => candidate.primitiveName))
      .toEqual(["fill", "ring", "shadow"]);
    expect(layersOf(simple).map((candidate) => candidate.primitiveName)).toEqual(["fill", "ring"]);
    const simpleRing = layer(simple, "ring")?.markerGraphics[0]?.symbol.symbolLayers[0];
    expect(simpleRing).toMatchObject({ color: cimColor(STALE_ACCENT) });
    expect(simpleRing).not.toHaveProperty("effects");
  });
});
