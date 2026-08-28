/*
 * How much room a ranked chart's name column needs.
 *
 * The drought comparison charts write each drainage area's name to the left
 * of its row, right-anchored against a fixed lane. The lane was a measured
 * constant, and the measurement was taken when the roster was Utah's: the
 * longest name was "Escalante Desert-Sevier Lake" at about 137 pixels, and
 * 162 held it with room to spare. Going west added "Klamath-Northern
 * California Coastal" at 173, which started 21 pixels off the left edge of
 * the canvas and lost its first syllable -- the row read "hath-Northern
 * California Coastal".
 *
 * A constant cannot survive a roster that grows, so the lane is measured from
 * the names a chart is actually about to draw. It is measured rather than
 * estimated from character counts because the names are proportional text:
 * "Klamath-Northern California Coastal" and "MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM"
 * are the same length and not the same width.
 */
const SVG = "http://www.w3.org/2000/svg";

/** The clear space between the longest name and the plot it labels. */
export const NAME_GAP = 10;

/**
 * The lane to draw names in, in CSS pixels.
 *
 * `room` is the widest the lane may be: the chart's width less its right
 * padding and less the narrowest plot worth drawing. Callers take that plot
 * floor from the same constant their `minimumWidth` already reserves, so the
 * lane can grow until the data lane reaches the width the chart was always
 * willing to shrink to, and no further.
 *
 * Never narrower than `base` either, so a chart cannot lose room it already
 * had. When even `room` cannot hold the longest name -- a phone showing a
 * chart at its minimum width -- that name is still clipped. That is a real
 * limit of the width, not a chart that silently truncates the moment a
 * roster gains a longer entry.
 */
export function labelLane(
  widestName: number, room: number, base: number
): number {
  if (!Number.isFinite(widestName) || widestName <= 0) return base;
  const wanted = Math.ceil(widestName) + NAME_GAP;
  return Math.max(base, Math.min(wanted, Math.floor(room)));
}

/**
 * The width of the widest of `names`, drawn as `className` draws it.
 *
 * Measured inside `host` so the text inherits the same fonts and the same
 * theme the chart will be drawn in. Returns 0 when nothing can be measured --
 * an empty list, or an environment with no layout, such as a unit test -- and
 * `labelLane` then keeps the caller's own floor.
 */
export function measureNameWidth(
  host: HTMLElement, names: readonly string[], className: string
): number {
  if (names.length === 0) return 0;
  const probe = document.createElementNS(SVG, "svg");
  /* Out of the flow and out of the accessibility tree: this is a ruler, not
   * a picture. `visibility` rather than `display` because a box that is
   * never laid out has no width to read. */
  probe.setAttribute("aria-hidden", "true");
  probe.setAttribute("focusable", "false");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.pointerEvents = "none";
  probe.style.inlineSize = "0";
  probe.style.blockSize = "0";
  const texts = names.map((name) => {
    const text = document.createElementNS(SVG, "text");
    text.setAttribute("class", className);
    text.textContent = name;
    probe.append(text);
    return text;
  });
  host.append(probe);
  let widest = 0;
  try {
    for (const text of texts) {
      widest = Math.max(widest, text.getBBox().width);
    }
  } catch {
    /* No layout engine, or an SVG that never rendered. The caller's floor is
     * the answer, and it is the width the charts already shipped with. */
    widest = 0;
  } finally {
    probe.remove();
  }
  return widest;
}
