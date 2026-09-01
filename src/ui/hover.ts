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
 * describes is what the finger is already covering. The top edge is the
 * default because a map is usually tapped below it. A tap in the top third
 * sends the card to the bottom instead, which is the one band where the top
 * edge would cover the thing that was just tapped.
 */
export function dockedEdge(point: HoverPoint, stage: HoverSize): "start" | "end" {
  if (!(stage.height > 0)) return "start";
  return point.y < stage.height / 3 ? "end" : "start";
}
