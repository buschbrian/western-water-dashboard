/*
 * "Copy these figures": the sentences from `state/figures-text.ts` as text a
 * reader can select, with a button to copy them, a button to copy the link,
 * and, where the browser has one, a button for its share sheet.
 *
 * One control, three pages. It owns no wording about the water: a page hands
 * it lines, or null when it has none it can stand behind, and the control
 * hides itself. The buttons are always in view; the sentences sit in a closed
 * `<details>`, because they repeat the figures the page has just shown. Nothing is stored, and nothing leaves the page unless the
 * reader presses a button. Confirmation is the button's own label for 2.5
 * seconds, as on "Copy link to this view" (`wireCopyViewLinks`), and the same
 * message goes to one status line so a screen reader hears it.
 */
import { copyText, copyViewUrl } from "../state/share";

const CONFIRM_MS = 2500;

export interface CopyFiguresOptions {
  /** Prefix for the ids this control owns; one per page. */
  id: string;
  /** The heading's level, so the control sits under the page's own outline. */
  level: 2 | 3;
  /** A class from the page, so the heading looks like its neighbours. */
  headingClass?: string;
}

export interface CopyFigures {
  readonly element: HTMLElement;
  /** Show these lines, or hide the control for null. */
  update(lines: readonly string[] | null): void;
}

export function createCopyFigures(options: CopyFiguresOptions): CopyFigures {
  const section = document.createElement("section");
  section.className = "copy-figures";
  section.dataset["copyFigures"] = "block";
  section.hidden = true;
  const headingId = `${options.id}-heading`;
  section.setAttribute("aria-labelledby", headingId);

  const heading = document.createElement(`h${options.level}`);
  heading.id = headingId;
  heading.className = ["copy-figures-heading", options.headingClass].filter(Boolean).join(" ");
  heading.textContent = "Copy these figures";

  const intro = document.createElement("p");
  intro.className = "copy-figures-intro";
  intro.textContent = "These sentences use only the figures on this page, with their dates and source.";

  const body = document.createElement("div");
  body.className = "copy-figures-text";
  body.dataset["copyFigures"] = "text";

  const details = document.createElement("details");
  details.className = "copy-figures-details";
  const summary = document.createElement("summary");
  summary.textContent = "Text to copy";
  details.append(summary, body);

  const actions = document.createElement("div");
  actions.className = "copy-figures-actions";

  const status = document.createElement("p");
  status.className = "visually-hidden";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  let current: readonly string[] = [];
  const timers = new Map<HTMLButtonElement, number>();

  const button = (name: string, label: string): HTMLButtonElement => {
    const control = document.createElement("button");
    control.type = "button";
    control.className = "copy-figures-button";
    control.dataset["copyFigures"] = name;
    control.textContent = label;
    return control;
  };

  /* The label changes for 2.5 seconds, then returns. A second press restarts
   * the clock rather than stacking a second reset. */
  const confirm = (control: HTMLButtonElement, resting: string, message: string): void => {
    control.textContent = message;
    status.textContent = message;
    window.clearTimeout(timers.get(control));
    timers.set(control, window.setTimeout(() => {
      control.textContent = resting;
      status.textContent = "";
    }, CONFIRM_MS));
  };

  const copy = button("copy-text", "Copy text");
  copy.addEventListener("click", async () => {
    const copied = await copyText(current.join("\n"), navigator.clipboard);
    confirm(copy, "Copy text", copied ? "Text copied" : "Text could not be copied");
  });

  const link = button("copy-link", "Copy link");
  link.addEventListener("click", async () => {
    const copied = await copyViewUrl(window.location.href, navigator.clipboard);
    confirm(link, "Copy link", copied ? "Link copied" : "Link could not be copied");
  });

  actions.append(copy, link);

  if (typeof navigator.share === "function") {
    const share = button("share", "Share");
    share.addEventListener("click", async () => {
      try {
        await navigator.share({
          title: document.title, text: current.join("\n"), url: window.location.href
        });
      } catch (error) {
        /* Closing the share sheet is an answer, not a failure. */
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          confirm(share, "Share", "Could not share");
        }
      }
    });
    actions.append(share);
  }

  section.append(heading, intro, actions, details, status);

  return {
    element: section,
    update(lines) {
      if (!lines || lines.length === 0) {
        current = [];
        body.replaceChildren();
        section.hidden = true;
        return;
      }
      current = [...lines];
      body.replaceChildren(...current.map((line) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = line;
        return paragraph;
      }));
      section.hidden = false;
    }
  };
}
