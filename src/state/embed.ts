import { SITE_ADDRESS } from "../reservoir-share-model";
import { precipitationPageHref, storyRequestFromSearch, type StoryRequest } from "./story-url";

const escape = (value: string): string => value.replace(/[&<>"']/g,
  (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

/** Frame code for an existing story request; no new place or view contract. */
export function embedCode(request: StoryRequest, title: string): string | null {
  if (!request.ok) return null;
  const params = request.view === "upstream"
    ? new URLSearchParams({ reservoir: request.reservoir })
    : new URLSearchParams(precipitationPageHref(request.place).split("?")[1]);
  params.set("view", request.view);
  if (request.theme) params.set("theme", request.theme);
  if (!storyRequestFromSearch(params.toString()).ok) return null;
  const source = `https://${SITE_ADDRESS}/story.html?${params.toString()}`;
  return `<iframe src="${escape(source)}" title="${escape(title)}" width="1200" height="630" style="width:100%;border:0" loading="lazy" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups"></iframe>`;
}
