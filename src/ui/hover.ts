export interface HoverPoint { x: number; y: number }
export interface HoverSize { width: number; height: number }

const GAP = 8;
const POINTER_OFFSET = 12;

/** Positions a pointer card inside its map stage, including at every edge. */
export function hoverPosition(
  point: HoverPoint,
  stage: HoverSize,
  card: HoverSize
): { left: number; top: number } {
  return {
    left: Math.max(GAP, Math.min(point.x + POINTER_OFFSET, stage.width - card.width - GAP)),
    top: Math.max(GAP, Math.min(point.y + POINTER_OFFSET, stage.height - card.height - GAP))
  };
}

/**
 * Which edge a tapped card docks to.
 *
 * A tap has no pointer to trail, so the card takes an edge instead of the
 * touch point -- a card at the finger is a card under the finger, and what it
 * describes is what the finger is already covering.
 *
 * The bottom edge is the default, because the top is where the controls are.
 * Measured on a 390-pixel viewport, a card docked to the top covered zoom,
 * home, fullscreen and the expand control at once, and the card takes pointer
 * events -- so answering a tap took the map's controls away until the answer
 * was dismissed. The bottom edge carries only the scale bar and the
 * attribution strip, and `is-docked-end` already clears the second.
 *
 * A tap in the bottom third sends the card to the top instead, which is the
 * one band where the bottom edge would cover the thing that was just tapped.
 * The controls lose to the reader's own finger in that band, and only there.
 */
export function dockedEdge(point: HoverPoint, stage: HoverSize): "start" | "end" {
  if (!(stage.height > 0)) return "end";
  return point.y > (stage.height * 2) / 3 ? "start" : "end";
}
