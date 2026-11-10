import { embedCode } from "../state/embed";
import { copyText } from "../state/share";
import type { StoryRequest } from "../state/story-url";

export interface EmbedChoice {
  label: string;
  title: string;
  request: StoryRequest;
}

export function createEmbedView(id: string, choices: readonly EmbedChoice[]): HTMLDetailsElement | null {
  const available = choices.map((choice) => ({ ...choice, code: embedCode(choice.request, choice.title) }))
    .filter((choice): choice is EmbedChoice & { code: string } => choice.code !== null);
  if (!available.length) return null;
  const details = document.createElement("details");
  details.className = "embed-view copy-figures";
  details.dataset["embedView"] = "block";
  const summary = document.createElement("summary");
  summary.textContent = "Embed this view";
  const intro = document.createElement("p");
  intro.textContent = "Paste this code into your story or website. The view updates when the dashboard updates.";
  details.append(summary, intro);
  const code = document.createElement("textarea");
  code.id = `${id}-code`;
  code.className = "embed-code";
  code.rows = 5;
  code.readOnly = true;
  code.spellcheck = false;
  code.value = available[0]!.code;
  if (available.length > 1) {
    const label = document.createElement("label");
    label.htmlFor = `${id}-view`;
    label.textContent = "View";
    const select = document.createElement("select");
    select.id = label.htmlFor;
    for (const [index, choice] of available.entries()) {
      const option = document.createElement("option");
      option.value = String(index); option.textContent = choice.label;
      select.append(option);
    }
    select.addEventListener("change", () => { code.value = available[select.selectedIndex]!.code; });
    details.append(label, select);
  }
  const label = document.createElement("label");
  label.htmlFor = code.id; label.textContent = "Frame code";
  const button = document.createElement("button");
  button.type = "button"; button.className = "copy-figures-button";
  button.textContent = "Copy embed code";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  let timer: number | undefined;
  button.addEventListener("click", async () => {
    const copied = await copyText(code.value, navigator.clipboard);
    status.textContent = copied ? "Embed code copied" : "The code could not be copied. Select the frame code above.";
    window.clearTimeout(timer);
    timer = window.setTimeout(() => { status.textContent = ""; }, 2500);
  });
  details.append(label, code, button, status);
  return details;
}
