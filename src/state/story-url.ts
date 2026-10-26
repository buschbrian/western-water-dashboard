/*
 * The story views' address contract (ADR-128): `story.html?view=...`.
 *
 * A public contract, like the other pages' parameters: a story that embeds
 * a view keeps its link for as long as the story is published. The place
 * parameters are the snow page's own -- `state`, `area`, `level` -- so a
 * view and its full page read one place the same way.
 *
 * Pure, so it is tested without a browser. It decides only what the link
 * says; whether the place or the reservoir is published is answered once
 * the data has loaded.
 */
import { DEFAULT_LEVEL, JOINABLE_LEVELS } from "../data/boundaries";
import { HUC_CODE } from "../data/huc";
import { EVERYWHERE } from "../data/opening-scope";
import { isUsStateCode } from "../data/state-vocabulary";
import type { EffectiveTheme } from "./theme";
import { writeLevel } from "./level";

export const STORY_VIEWS = ["precip", "strip", "upstream"] as const;
export type StoryView = (typeof STORY_VIEWS)[number];

/** A place as the snow page reads it. `state` is a USPS code or "all". */
export interface StoryPlace {
  state: string;
  area: string | null;
  level: number;
}

/** Why a link cannot be shown. Each has one sentence (`invalidSentence`). */
export type StoryInvalid =
  | "view" | "place-missing" | "place" | "reservoir-missing"
  | "reservoir-unknown" | "reservoir-not-published";

export type StoryRequest =
  | { ok: true; view: "precip" | "strip"; place: StoryPlace; theme: EffectiveTheme | null }
  | { ok: true; view: "upstream"; reservoir: string; theme: EffectiveTheme | null }
  | { ok: false; view: string | null; reason: StoryInvalid; theme: EffectiveTheme | null };

/** The finest area the snow figures are published at (ADR-103). */
const FINEST_AREA_WIDTH = 8;

function isStoryView(value: string | null): value is StoryView {
  return value !== null && (STORY_VIEWS as readonly string[]).includes(value);
}

/** `light` or `dark`; anything else, or nothing, follows the reader's system. */
export function storyThemeFromSearch(search: string): EffectiveTheme | null {
  const theme = new URLSearchParams(search).get("theme");
  return theme === "light" || theme === "dark" ? theme : null;
}

/**
 * The place a link names, or why it names none. Stricter than the full
 * pages, which fall back to everywhere: a story view that quietly widened
 * would show a figure for a place the story does not name.
 */
export function storyPlaceFromSearch(
  search: string
): StoryPlace | "place-missing" | "place" {
  const params = new URLSearchParams(search);
  const state = params.get("state");
  const area = params.get("area");
  const level = params.get("level");
  if (state === null && area === null) return "place-missing";
  if (state !== null && state !== EVERYWHERE && !isUsStateCode(state)) return "place";
  if (area !== null && (!HUC_CODE.test(area) || area.length > FINEST_AREA_WIDTH)) return "place";
  let levelValue = DEFAULT_LEVEL;
  if (level !== null) {
    levelValue = Number(level);
    if (!Number.isInteger(levelValue) || !JOINABLE_LEVELS.includes(levelValue)) return "place";
  }
  return { state: state ?? EVERYWHERE, area, level: levelValue };
}

export function storyRequestFromSearch(search: string): StoryRequest {
  const params = new URLSearchParams(search);
  const theme = storyThemeFromSearch(search);
  const view = params.get("view");
  if (!isStoryView(view)) return { ok: false, view, reason: "view", theme };
  if (view === "upstream") {
    const reservoir = params.get("reservoir")?.trim() ?? "";
    return reservoir === ""
      ? { ok: false, view, reason: "reservoir-missing", theme }
      : { ok: true, view, reservoir, theme };
  }
  const place = storyPlaceFromSearch(search);
  return typeof place === "string"
    ? { ok: false, view, reason: place, theme }
    : { ok: true, view, place, theme };
}

/** The one sentence an embed shows in place of a view it cannot draw. */
export function invalidSentence(reason: StoryInvalid): string {
  switch (reason) {
    case "view": return "This link does not name a view. The view must be precip, strip or upstream.";
    case "place-missing": return "This view needs a place. Add a state or a drainage area to the link.";
    case "place": return "The place in this link is not a place this site publishes.";
    case "reservoir-missing": return "This view needs a reservoir. Add its name to the link.";
    case "reservoir-unknown": return "No published reservoir has the name in this link.";
    case "reservoir-not-published": return "This reservoir is not in the current published data.";
  }
}

/**
 * The full page a precipitation view comes from, carrying the same place.
 * The state is always written, `all` included, so the link never defers to
 * the reader's stored place (docs/architecture/scopes.md).
 */
export function precipitationPageHref(place: StoryPlace): string {
  const params = new URLSearchParams({ state: place.state });
  if (place.area !== null) params.set("area", place.area);
  writeLevel(params, place.level);
  return `precipitation.html?${params.toString()}`;
}

/** The full page an upstream view comes from, by the reservoir's label. */
export function reservoirPageHref(label: string): string {
  return `reservoir.html?${new URLSearchParams({ name: label }).toString()}`;
}
