/*
 * The header's "Find a place" search, on the page.
 *
 * A header action opens one small panel under the bar: a text field that is
 * a WAI-ARIA 1.2 combobox, and the listbox of results it controls. Built on
 * the first open, so a page that nobody searches pays nothing, and the names
 * are fetched on the field's first focus with the shared deadline. What
 * matches and where each result goes is `place-search-model.ts`.
 */
import "@esri/calcite-components/components/calcite-icon";
import { fetchWithin } from "../data/fetch";
import type { PageId } from "./page-header";
import {
  buildPlaces, onlyMatch, parsePlaceIndex, PLACE_INDEX_URL, placeHref, searchPlaces,
  type Place
} from "./place-search-model";

const TRIGGER_ID = "place-search-trigger";

type Loaded = { places: Place[] } | { error: true };
let loading: Promise<Loaded> | null = null;

function loadPlaces(): Promise<Loaded> {
  loading ??= fetchWithin(PLACE_INDEX_URL)
    .then(async (response) => ({ places: buildPlaces(parsePlaceIndex(await response.json())) }))
    .catch((error: unknown) => {
      console.warn("The place search could not load its names:", error);
      return { error: true } as const;
    });
  return loading;
}

interface ActionElement extends HTMLElement {
  aria?: { expanded?: boolean; controlsElements?: Element[] };
  setFocus?: () => Promise<void>;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K, attributes: Record<string, string> = {}, textContent = ""
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (textContent) node.textContent = textContent;
  return node;
}

/** Wire the header action. Every page with the shared header calls this. */
export function setupPlaceSearch(current: PageId): void {
  const found = document.getElementById(TRIGGER_ID);
  if (!found) return;
  const trigger: ActionElement = found;
  let panel: HTMLElement | null = null;
  let input: HTMLInputElement;
  let list: HTMLUListElement;
  let status: HTMLElement;
  let results: Place[] = [];
  let active = -1;
  let places: Place[] | null = null;
  let failed = false;

  const setExpanded = (open: boolean) => {
    trigger.aria = { expanded: open, ...(panel ? { controlsElements: [panel] } : {}) };
  };
  setExpanded(false);

  function message(text: string): void {
    list.replaceChildren(element("li", {
      role: "option", "aria-disabled": "true", "aria-selected": "false",
      class: "place-search-message", id: "place-search-message"
    }, text));
    status.textContent = text;
    showList(true);
  }

  function showList(open: boolean): void {
    list.hidden = !open;
    input.setAttribute("aria-expanded", String(open));
    if (!open) setActive(-1);
  }

  function setActive(index: number): void {
    active = index;
    list.querySelectorAll<HTMLElement>("[role=option]").forEach((option, at) => {
      option.setAttribute("aria-selected", String(at === index && results.length > 0));
    });
    const chosen = index >= 0 ? document.getElementById(`place-option-${index}`) : null;
    if (chosen) {
      input.setAttribute("aria-activedescendant", chosen.id);
      chosen.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function render(): void {
    const query = input.value;
    results = [];
    setActive(-1);
    if (!query.trim()) {
      list.replaceChildren();
      status.textContent = "";
      showList(false);
      return;
    }
    if (failed) {
      message("The places could not be loaded. The rest of this page still works.");
      return;
    }
    if (!places) {
      message("Loading the places.");
      return;
    }
    results = searchPlaces(places, query);
    if (!results.length) {
      message("No place has that name.");
      return;
    }
    list.replaceChildren(...results.map((entry, at) => {
      const option = element("li", {
        id: `place-option-${at}`, role: "option", "aria-selected": "false",
        class: "place-search-option"
      });
      /* Reads as `placeText`: "Lost Creek · Reservoir · Oregon". */
      option.append(element("span", { class: "place-search-name" }, entry.name),
        " · ", element("span", { class: "place-search-detail" },
          [entry.type, entry.location].filter(Boolean).join(" · ")));
      return option;
    }));
    status.textContent = results.length === 1
      ? "1 place matches." : `${results.length} places match.`;
    showList(true);
  }

  function go(entry: Place): void {
    window.location.assign(placeHref(entry, current));
  }

  function ensureLoaded(): void {
    if (places || failed) return;
    list.setAttribute("aria-busy", "true");
    void loadPlaces().then((loaded) => {
      list.removeAttribute("aria-busy");
      if ("places" in loaded) places = loaded.places;
      else failed = true;
      if (input.value.trim()) render();
    });
  }

  function place(): void {
    if (!panel) return;
    const bar = trigger.closest("calcite-navigation") ?? trigger;
    panel.style.top = `${Math.round(bar.getBoundingClientRect().bottom)}px`;
  }

  function close(returnFocus: boolean): void {
    if (!panel || panel.hidden) return;
    showList(false);
    panel.hidden = true;
    setExpanded(false);
    if (returnFocus) void (trigger.setFocus ? trigger.setFocus() : trigger.focus());
  }

  function build(): HTMLElement {
    const root = element("div", { id: "place-search", class: "place-search", role: "search" });
    root.hidden = true;
    const label = element("label", { for: "place-search-input", class: "place-search-label" },
      "Find a place");
    const row = element("div", { class: "place-search-row" });
    input = element("input", {
      id: "place-search-input", type: "text", role: "combobox",
      "aria-autocomplete": "list", "aria-expanded": "false",
      "aria-controls": "place-search-list", autocomplete: "off",
      autocapitalize: "off", spellcheck: "false",
      placeholder: "Reservoir, drainage area or snow site"
    });
    const closer = element("button", {
      type: "button", class: "place-search-close", "aria-label": "Close the search"
    });
    closer.append(element("calcite-icon", { icon: "x", scale: "s", "aria-hidden": "true" }));
    row.append(input, closer);
    list = element("ul", {
      id: "place-search-list", class: "place-search-list", role: "listbox",
      "aria-label": "Places"
    });
    list.hidden = true;
    status = element("p", { class: "visually-hidden", role: "status" });
    root.append(label, row, list, status);

    input.addEventListener("focus", ensureLoaded);
    input.addEventListener("input", () => { ensureLoaded(); render(); });
    input.addEventListener("keydown", (event) => {
      const count = results.length;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (list.hidden) render();
        if (!count) return;
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive(active < 0
          ? (step > 0 ? 0 : count - 1)
          : (active + step + count) % count);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const chosen = active >= 0 ? results[active] : onlyMatch(results, input.value);
        if (chosen) go(chosen);
        else if (count) status.textContent = `${count} places match. Choose one with the arrow keys.`;
      } else if (event.key === "Escape") {
        event.preventDefault();
        if (!list.hidden) showList(false);
        else close(true);
      }
    });
    list.addEventListener("mousedown", (event) => event.preventDefault());
    list.addEventListener("click", (event) => {
      const option = (event.target as Element).closest<HTMLElement>(".place-search-option");
      const index = option ? Number(option.id.replace("place-option-", "")) : -1;
      const chosen = results[index];
      if (chosen) go(chosen);
    });
    closer.addEventListener("click", () => close(true));
    root.addEventListener("focusout", (event) => {
      const next = event.relatedTarget as Node | null;
      if (next && (root.contains(next) || trigger.contains(next))) return;
      /* Focus that leaves for nowhere is a click on the page itself; the
       * pointer handler below decides that one. */
      if (next) close(false);
    });
    document.addEventListener("pointerdown", (event) => {
      const target = event.target as Node;
      if (!root.contains(target) && !trigger.contains(target)) close(false);
    });
    window.addEventListener("resize", place);
    document.body.append(root);
    return root;
  }

  trigger.addEventListener("click", () => {
    if (panel && !panel.hidden) {
      close(true);
      return;
    }
    panel ??= build();
    panel.hidden = false;
    place();
    setExpanded(true);
    input.focus();
    if (input.value.trim()) render();
  });
}
