/*
 * Hand-built SVG charts use real CSS-pixel dimensions.
 *
 * A fixed viewBox plus `inline-size: 100%` scales every part of a chart when
 * its card grows: type, padding and row height grow with the marks. These
 * helpers instead give the renderer the host's measured width, so one SVG
 * unit remains one CSS pixel and only the data lane takes the extra room.
 */

export const CHART_RESIZE_DEADLINE_MS = 100;

interface WatchedChart {
  observer: ResizeObserver;
  render: (width: number) => void;
  width: number;
  timer: ReturnType<typeof setTimeout> | null;
  fallbackWidth: number;
  minimumWidth: number;
}

const watched = new WeakMap<HTMLElement, WatchedChart>();

function measuredWidth(host: HTMLElement, fallback: number, minimum: number): number {
  const measured = Math.round(host.getBoundingClientRect().width);
  return Math.max(minimum, measured > 0 ? measured : fallback);
}

/** Stop observing a chart that no longer has anything to draw. */
export function stopResponsiveChart(host: HTMLElement): void {
  const current = watched.get(host);
  if (!current) return;
  current.observer.disconnect();
  if (current.timer !== null) clearTimeout(current.timer);
  watched.delete(host);
  host.setAttribute("aria-busy", "false");
}

/**
 * Draw now and keep the same chart fitted to its host.
 *
 * ResizeObserver may fire continuously while a window or split is dragged.
 * The first changed width starts one finite timer; later notifications update
 * the width that timer will draw but never move its deadline. A resize can
 * therefore not leave the chart waiting or `aria-busy` forever.
 */
export function renderResponsiveChart<T>(
  host: HTMLElement,
  render: (width: number) => T,
  options: { fallbackWidth: number; minimumWidth: number }
): T {
  const width = measuredWidth(host, options.fallbackWidth, options.minimumWidth);
  let current = watched.get(host);

  if (!current) {
    const state = {} as WatchedChart;
    const observer = new ResizeObserver(() => {
      const next = measuredWidth(host, state.fallbackWidth, state.minimumWidth);
      if (next === state.width) return;
      state.width = next;
      if (state.timer !== null) return;
      host.setAttribute("aria-busy", "true");
      state.timer = setTimeout(() => {
        state.timer = null;
        try {
          state.render(state.width);
        } catch (error) {
          console.error("A chart could not be resized:", error);
        } finally {
          host.setAttribute("aria-busy", "false");
        }
      }, CHART_RESIZE_DEADLINE_MS);
    });
    current = {
      observer,
      render: () => undefined,
      width,
      timer: null,
      fallbackWidth: options.fallbackWidth,
      minimumWidth: options.minimumWidth
    };
    Object.assign(state, current);
    current = state;
    watched.set(host, current);
    observer.observe(host);
  }

  current.render = render;
  current.width = width;
  current.fallbackWidth = options.fallbackWidth;
  current.minimumWidth = options.minimumWidth;
  return render(width);
}
