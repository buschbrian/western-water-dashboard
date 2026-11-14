/* Arcade is back in the renderer, and the reason it was removed is on
 * record: the legacy page kept the same expression twice as concatenated
 * strings, so a typo drew slightly-wrong circles and never raised an error.
 * These tests exist to make that failure mode impossible -- every number in
 * the generated text is checked against the constant it must have come from,
 * so an expression cannot quietly stop agreeing with the arithmetic in
 * `symbols.ts`. */
import { describe, expect, it } from "vitest";
import {
  SIZE_BASIS_FIELD,
  fillSizeExpression,
  ringSizeExpression,
  shadowSizeExpression
} from "./arcade";
import { RING_MAX_PX, RING_MIN_PX } from "./symbols";
import { POINTS_PER_CSS_PIXEL } from "./units";

const DOMAIN = 5000;

describe("the size expressions", () => {
  it("carry the tested ring bounds rather than numbers of their own", () => {
    const ring = ringSizeExpression(DOMAIN);
    expect(ring).toContain(String(RING_MIN_PX));
    expect(ring).toContain(String(RING_MAX_PX - RING_MIN_PX));
    expect(ring).toContain(`$feature.${SIZE_BASIS_FIELD}`);
    expect(ring).toContain(String(DOMAIN));
  });

  it("converts the pixel arithmetic to the points CIM expects", () => {
    for (const expression of [ringSizeExpression(DOMAIN), fillSizeExpression(DOMAIN),
      shadowSizeExpression(DOMAIN, 2)]) {
      expect(expression).toContain(`* ${POINTS_PER_CSS_PIXEL}`);
    }
  });

  it("float the domain in, because it belongs to the drawn set", () => {
    expect(ringSizeExpression(1234)).toContain("1234");
    expect(ringSizeExpression(1234)).not.toContain(String(DOMAIN));
  });

  it("give a reservoir with no size basis the smallest ring, not nothing", () => {
    expect(ringSizeExpression(DOMAIN)).toMatch(
      new RegExp(`IsEmpty\\(basis\\)[^\\n]*return ${RING_MIN_PX}`));
  });

  it("draw no fill at all when the percentage cannot be read", () => {
    expect(fillSizeExpression(DOMAIN)).toMatch(/IsEmpty\(pct\)[^\n]*return 0/);
  });

  it("square-root the fraction, so area carries the percentage", () => {
    // The same rule `fillSize` implements: ring * sqrt(clamped / 100).
    expect(fillSizeExpression(DOMAIN))
      .toContain("Sqrt(Min(100, Max(0, pct)) / 100)");
  });

  it("put the shadow outside the ring by the spread it is given", () => {
    const shadow = shadowSizeExpression(DOMAIN, 2);
    expect(shadow).toContain(`* ${RING_MAX_PX - RING_MIN_PX} + 2`);
    expect(shadow).not.toBe(ringSizeExpression(DOMAIN));
  });

  it("keeps every symbol part fixed in pixels while the geography zooms", () => {
    for (const expression of [ringSizeExpression(DOMAIN), fillSizeExpression(DOMAIN),
      shadowSizeExpression(DOMAIN, 2)]) {
      expect(expression).not.toContain("$view.scale");
      expect(expression).not.toMatch(/\bvar k\b/);
    }
  });
});
