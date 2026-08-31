/*
 * The pointer half of every map, written once.
 *
 * The storage map grew this first: one hit test per animation frame, stale
 * answers discarded, the SDK's own named highlight for emphasis, and a card
 * held inside its stage at every edge. The snow and drought maps had none of
 * it -- no cursor, no emphasis, no card -- so the same machinery was about to
 * be written twice more and drift twice. What actually differs between the
 * maps is only what the card says about a hit, so that is the parameter and
 * the rest is shared.
 *
 * Two decisions here are about fluidity rather than correctness:
 *
 * - The card is repositioned on every frame the pointer moves, not only on
 *   the frames a hit test resolves on. A hit test is asynchronous and lands
 *   one to three frames behind the pointer, so a card that moves only when
 *   an answer arrives visibly lurches behind the cursor it describes.
 * - The card's nodes are rewritten only when the words change. Tracking the
 *   pointer across one reservoir is then two `style` writes per frame rather
 *   than a subtree replacement, which is what made the old card flicker on
 *   the frames its text was rebuilt identically.
 *
 * Nothing on any map depends on either path: the keyboard and screen-reader
 * route to every value here is the list, table or chart beside the map. Both
 * are among the things that cannot run in a hidden pane, where `hitTest`
 * never settles because the render loop that resolves it never runs.
 *
 * A coarse pointer takes the tap path at the end of this file instead of the
 * frame loop above: same hit test, same words, a docked card.
 */
import { dockedEdge, hoverPosition } from "./hover";
import type { GraphicHit, HitGraphic } from "./hit";

/** What a card says: one name, then short lines under it. */
export interface HoverContent {
  heading: string;
  lines: readonly string[];
}

export interface HoverResolution {
  content: HoverContent;
  /** The graphic to emphasize, when the map has a layer view holding it. */
  graphic?: HitGraphic | undefined;
}

/** The layer-view surface the SDK's named highlight is called on. */
export interface HighlightView {
  highlight(target: unknown, options?: { name?: string }): { remove(): void };
}

export interface ScreenPoint { x: number; y: number }
interface PointerDetail extends ScreenPoint { screenPoint?: ScreenPoint }

export interface HoverMapElement extends HTMLElement {
  view?: { container?: HTMLElement | null | undefined } | null | undefined;
  hitTest(
    target: ScreenPoint,
    options?: { include?: unknown }
  ): Promise<{ results: GraphicHit[] }>;
}

export interface MapHoverOptions {
  /** The card. Positioned inside its own offset parent, which is the stage. */
  card: HTMLElement;
  /**
   * The layers hit testing is limited to, topmost first. Read on every
   * frame rather than captured once: the storage map replaces its reservoir
   * layer whenever the scope changes, and a captured layer is one the map no
   * longer draws. Return null to suspend hover -- before the first draw,
   * for instance.
   */
  include(): unknown;
  /** What the card says for a set of hits, or null for no card. */
  resolve(results: readonly GraphicHit[]): HoverResolution | null;
  /** The layer view that draws the emphasis, when the map has one. */
  layerView?(): HighlightView | null;
  /**
   * Set when the map already answers a tap by another route, so this wiring
   * does not answer it a second time.
   *
   * The storage map opens a details sheet on a tap, and the sheet says
   * everything the card would and eleven more fields besides. Answering both
   * put the card behind the sheet's scrim with its dismiss control
   * unreachable, and left it on the map afterwards -- one tap, two surfaces,
   * two dismissals. Hover on a fine pointer is unaffected: there is no sheet
   * on a hover, which is why the card exists at all.
   */
  tapAnsweredElsewhere?: boolean;
}

/** The card element a map hovers into. Empty, hidden, and out of the
 * accessibility tree until there is something under the pointer. */
export function createHoverCard(id: string): HTMLElement {
  const card = document.createElement("div");
  card.id = id;
  card.className = "map-hover";
  card.setAttribute("aria-hidden", "true");
  card.hidden = true;
  return card;
}

/** The pointer position the SDK reports, from either event shape. */
export function eventPoint(event: Event): ScreenPoint | null {
  const detail = (event as CustomEvent<PointerDetail>).detail;
  const point = detail?.screenPoint ?? detail;
  return Number.isFinite(point?.x) && Number.isFinite(point?.y) ? point : null;
}

function contentKey(content: HoverContent): string {
  return [content.heading, ...content.lines].join("\u0000");
}

/** Moves a visible card to the pointer, kept whole inside its stage. */
function positionCard(card: HTMLElement, point: ScreenPoint): void {
  const stage = card.parentElement;
  if (!stage) return;
  const position = hoverPosition(
    point,
    { width: stage.clientWidth, height: stage.clientHeight },
    { width: card.offsetWidth, height: card.offsetHeight }
  );
  card.style.left = `${position.left}px`;
  card.style.top = `${position.top}px`;
}

/**
 * Wires hover on one map component.
 *
 * Returns a `clear` the caller can invoke when something else takes the
 * meaning out from under the pointer -- a redraw that removes the layer it
 * was over, or a selection made from the keyboard.
 */
export function wireMapHover(
  element: HoverMapElement,
  options: MapHoverOptions
): { clear(): void } {
  const { card } = options;
  let queued: ScreenPoint | null = null;
  let frame = 0;
  let request = 0;
  let shownKey: string | null = null;
  let highlight: { remove(): void } | null = null;

  const setCursor = (overFeature: boolean): void => {
    const cursor = overFeature ? "pointer" : "";
    element.style.cursor = cursor;
    const container = element.view?.container;
    if (container) container.style.cursor = cursor;
  };

  /* The SDK's own emphasis, on the layer view, rather than another circle
   * drawn on a graphics layer: `temporary` is the named highlight the SDK
   * ships pre-configured for exactly this, so hover emphasis matches the
   * platform instead of being a second opinion about what hover looks like.
   * A card can be shown without it -- the highlight needs a layer view,
   * which never arrives in a hidden pane. */
  const emphasize = (graphic: HitGraphic | undefined): void => {
    highlight?.remove();
    highlight = null;
    const view = options.layerView?.() ?? null;
    if (!view || !graphic) return;
    try {
      highlight = view.highlight(graphic, { name: "temporary" });
    } catch {
      // An emphasis the view refuses is not worth losing the card over.
      highlight = null;
    }
  };

  const hide = (): void => {
    if (shownKey === null) return;
    shownKey = null;
    card.setAttribute("aria-hidden", "true");
    card.hidden = true;
    card.classList.remove("is-docked", "is-docked-end");
    card.replaceChildren();
  };

  const render = (content: HoverContent, dismissible: boolean): void => {
    const key = contentKey(content);
    if (key === shownKey) return;
    const heading = document.createElement("strong");
    heading.textContent = content.heading;
    const lines = content.lines.map((line) => {
      const span = document.createElement("span");
      span.textContent = line;
      return span;
    });
    const nodes: Node[] = [heading, ...lines];
    /* A tapped card stays until it is dismissed, so it carries the control
     * that dismisses it. A pointer card needs none: it leaves with the
     * pointer that opened it. */
    if (dismissible) {
      const close = document.createElement("button");
      close.type = "button";
      close.className = "map-hover-close";
      close.textContent = "Close";
      close.addEventListener("click", () => {
        emphasize(undefined);
        hide();
      });
      nodes.push(close);
    }
    card.replaceChildren(...nodes);
    card.setAttribute("aria-hidden", "false");
    card.hidden = false;
    shownKey = key;
  };

  const show = (content: HoverContent, point: ScreenPoint): void => {
    render(content, false);
    positionCard(card, point);
  };

  /* The tap answer, docked to an edge of the stage rather than placed at the
   * tap: a card at the finger is a card under the finger, and what it
   * describes is what the finger is already covering. It takes the top edge,
   * and moves to the bottom only for a tap in the top third, so it never
   * covers the thing that was just tapped. */
  const showDocked = (content: HoverContent, point: ScreenPoint): void => {
    render(content, true);
    const stage = card.parentElement;
    const edge = dockedEdge(point, {
      width: stage?.clientWidth ?? 0,
      height: stage?.clientHeight ?? 0
    });
    card.style.left = "";
    card.style.top = "";
    card.classList.add("is-docked");
    card.classList.toggle("is-docked-end", edge === "end");
  };

  const clear = (): void => {
    request += 1;
    queued = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    emphasize(undefined);
    setCursor(false);
    hide();
  };

  /*
   * Touch answers by tap, because it has no pointer to hover with.
   *
   * The drought map answered a phone with nothing at all -- it had no tap
   * path of its own -- and the snow map answered into a surface below the
   * fold, which on a narrow viewport reads the same as nothing happening.
   * The same hit test and the same `resolve` the pointer path uses run here,
   * so a tap says exactly what a hover says. What differs is the card:
   * docked and dismissible, rather than following a pointer that is not
   * there.
   *
   * A map that already answers a tap says so and is left alone, because two
   * answers to one tap is worse than the one it had.
   */
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    if (options.tapAnsweredElsewhere) return { clear };
    element.addEventListener("arcgisViewImmediateClick", (event) => {
      const point = eventPoint(event);
      if (!point) return;
      const include = options.include();
      if (!include) {
        clear();
        return;
      }
      const current = ++request;
      void element.hitTest(point, { include }).then((response) => {
        if (current !== request) return;
        const hit = options.resolve(response.results);
        emphasize(hit?.graphic);
        /* A tap on the background dismisses the card, the way a tap outside
         * any other temporary surface does. */
        if (hit) showDocked(hit.content, point);
        else hide();
      }).catch(() => clear());
    });
    return { clear };
  }

  element.addEventListener("arcgisViewPointerMove", (event) => {
    queued = eventPoint(event);
    if (!queued || frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const point = queued;
      queued = null;
      if (!point) return;
      /* Before the answer, not after it: what the card is already saying is
       * still what is under the pointer on nine frames in ten, and moving it
       * now is what makes the card travel with the cursor rather than catch
       * up to it. */
      if (shownKey !== null) positionCard(card, point);
      const include = options.include();
      if (!include) {
        clear();
        return;
      }
      const current = ++request;
      void element.hitTest(point, { include }).then((response) => {
        if (current !== request) return;
        const hit = options.resolve(response.results);
        emphasize(hit?.graphic);
        setCursor(Boolean(hit));
        if (hit) show(hit.content, point);
        else hide();
      }).catch(() => clear());
    });
  });
  element.addEventListener("arcgisViewPointerLeave", clear);
  element.addEventListener("arcgisViewImmediateClick", clear);

  return { clear };
}
