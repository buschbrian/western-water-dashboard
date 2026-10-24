/*
 * Fit a story view into the frame it is given, exactly (ADR-128).
 *
 * A story embeds the view in an iframe of a fixed size and scrolls past it,
 * so the view may not scroll: an inner scroller would catch the reader's
 * wheel, and a clipped bottom would hide the figures. The view instead drops
 * what it can do without, in a stated order, until what is left fits the
 * frame, and then gives any room that is left to its chart.
 *
 * Measured from the frame's own box, never from an assumed screen size: the
 * same view is a wide block in one story and a narrow side panel in
 * another.
 */

export const DROPPED_CLASS = "story-dropped";

/** One thing the view can do without: the elements it hides together, and
 * the class that hides them (most often `DROPPED_CLASS`; a class that hides
 * only part of an element, such as the notes under the figures, also works). */
export interface FitDrop {
  elements: readonly HTMLElement[];
  className?: string;
}

export interface FitPlan {
  /** In the order they are taken. Built fresh at each fit, because a view
   * can redraw its elements between fits. */
  drops(): FitDrop[];
  /** A chart whose height can give or take room. */
  flexible?: {
    element: HTMLElement;
    min: number;
    max: number;
    set(height: number): void;
  };
  /** Told how many drops were taken, before each measurement, so a view can
   * say what it left out ("3 more drainage areas are on the full page"). */
  dropped?(count: number): void;
}

export interface FitResult {
  dropped: number;
  fits: boolean;
  chartHeight: number | null;
}

/**
 * The fewest drops after which the content fits, given its height after
 * each number of drops. The whole list when nothing fits; the caller says
 * so. Pure, so the rule is tested without a layout engine.
 */
export function dropsNeeded(
  heightAfter: (drops: number) => number, available: number, total: number
): number {
  let count = 0;
  while (count < total && heightAfter(count) > available + 0.5) count += 1;
  return count;
}

/** The chart's height once the drops are taken: all the room left, within
 * its own limits. */
export function flexibleHeight(min: number, max: number, room: number): number {
  return Math.max(min, Math.min(max, Math.floor(min + room)));
}

export function fitContent(frame: HTMLElement, content: HTMLElement, plan: FitPlan): FitResult {
  const drops = plan.drops();
  const apply = (count: number): void => {
    drops.forEach((drop, index) => {
      for (const element of drop.elements) {
        element.classList.toggle(drop.className ?? DROPPED_CLASS, index < count);
      }
    });
    plan.dropped?.(count);
  };
  const height = (): number => content.getBoundingClientRect().height;
  const available = frame.clientHeight;
  const flexible = plan.flexible;
  if (flexible) flexible.set(flexible.min);
  const count = dropsNeeded((tried) => { apply(tried); return height(); }, available, drops.length);
  apply(count);
  let chartHeight: number | null = null;
  if (flexible && !flexible.element.classList.contains(DROPPED_CLASS)) {
    chartHeight = flexibleHeight(flexible.min, flexible.max, available - height());
    flexible.set(chartHeight);
  }
  return { dropped: count, fits: height() <= available + 0.5, chartHeight };
}
