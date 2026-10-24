/*
 * The "What is above it" section of a reservoir (ADR-077, ADR-127), built
 * once and used by the reservoir page and by the upstream story view
 * (ADR-128), so the two cannot word or total it differently.
 */
import { reservoirLabel } from "../state/selection";
import type { Reservoir, UpstreamTrace } from "../types";
import { GROUP_AFTER, upstreamSummary, type UpstreamGroup, type UpstreamRow } from "../upstream-model";
import { storageColor } from "../viz/classes";
import { formatAcreFeet } from "../viz/format";

export interface UpstreamSectionOptions {
  /** Open every link in a new tab. A page shown inside another page sets
   * this, so a link does not replace the frame it is in. */
  newTab?: boolean;
  /** Show each drainage area as one row with its total, and no list to
   * open. For a frame of fixed size, where an opened list would not fit. */
  groupRows?: boolean;
}

function note(text: string, className = "reservoir-note"): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  return p;
}

function sectionHeading(text: string): HTMLHeadingElement {
  const heading = document.createElement("h2");
  heading.className = "reservoir-subhead";
  heading.textContent = text;
  return heading;
}

function pageLink(href: string, text: string, options: UpstreamSectionOptions): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = href;
  link.textContent = text;
  if (options.newTab) {
    link.target = "_blank";
    link.rel = "noopener";
  }
  return link;
}

/**
 * The "What is above it" section: every published reservoir on land that
 * drains to this one, linked by the same labels the pages resolve by.
 *
 * Upstream of, never feeds: several of these sit on transbasin diversions,
 * and the water they hold does not always go where the river points
 * (ADR-077). The snow sites are counted in the sentence and named nowhere --
 * their own page is the place for them, and that filter is not built yet.
 */
export function upstreamSection(
  trace: UpstreamTrace,
  roster: readonly Reservoir[],
  station: string,
  options: UpstreamSectionOptions = {}
): HTMLElement[] {
  if (trace.screen != null) {
    return [
      sectionHeading("What is above it"),
      note("The contributing area above this reservoir could not be traced "
        + "when the site last asked.", "reservoir-note")
    ];
  }
  const count = trace.upstream_reservoirs.length;
  const sites = trace.upstream_snow_sites.length;
  const children: HTMLElement[] = [sectionHeading("What is above it")];
  const sentence = document.createElement("p");
  sentence.className = "reservoir-note";
  if (count === 0 && sites === 0) {
    sentence.textContent =
      "No published reservoir or snow-measuring site sits upstream of this "
      + "one, on land that drains to it.";
    children.push(sentence);
    return children;
  }
  sentence.textContent = `${count} published `
    + `reservoir${count === 1 ? "" : "s"} and ${sites} snow-measuring `
    + `site${sites === 1 ? "" : "s"} sit upstream of this one, on land that `
    + "drains to it.";
  children.push(sentence);
  if (sites > 0) {
    const snowLink = document.createElement("p");
    snowLink.className = "reservoir-links";
    const link = pageLink(`snow.html?state=all&upstream=${encodeURIComponent(station)}`,
      "See snow upstream of this reservoir", options);
    snowLink.append(link);
    children.push(snowLink);
  }
  if (count > 0) {
    children.push(...upstreamStorage(trace.upstream_reservoirs, roster, options));
  }
  return children;
}

/** One reservoir as a row: its name, a small fill bar in the storage
 * colours, percent full and acre-feet. */
function upstreamRow(row: UpstreamRow, options: UpstreamSectionOptions): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "upstream-row";
  const link = pageLink(`reservoir.html?name=${encodeURIComponent(row.label)}`, row.label, options);
  item.append(link, fillBar(row.percent), note(
    `${row.percent === null ? "—" : `${Math.round(row.percent)}%`} · ` +
    `${formatAcreFeet(row.reservoir.current_storage_af)} acre-feet`, "upstream-figure"));
  return item;
}

function fillBar(percent: number | null): HTMLElement {
  const bar = document.createElement("span");
  bar.className = "upstream-bar";
  bar.setAttribute("aria-hidden", "true");
  const fill = document.createElement("span");
  fill.style.inlineSize = `${Math.min(100, Math.max(0, percent ?? 0))}%`;
  fill.style.background = storageColor(percent);
  bar.append(fill);
  return bar;
}

/** A drainage area's name and count, its fill bar and its figures. The
 * count sits with the name, so the figure column holds the same two values
 * as every row below it and the bars stay in one column. */
function groupHead(group: UpstreamGroup): HTMLElement[] {
  const name = document.createElement("span");
  name.className = "upstream-group-name";
  name.textContent = group.name;
  const count = document.createElement("span");
  count.className = "upstream-group-count";
  count.textContent = ` · ${group.rows.length} reservoir${group.rows.length === 1 ? "" : "s"}`;
  name.append(count);
  return [name, fillBar(group.rollup.percentFull), note(
    `${group.rollup.percentFull === null ? "—" : `${Math.round(group.rollup.percentFull)}%`} · ` +
    `${formatAcreFeet(group.rollup.storageAf)} acre-feet`, "upstream-figure")];
}

/**
 * The reservoirs above this one as stored water (ADR-127): one total, then
 * the drainage areas they sit in, largest first, each with its own total and
 * its reservoirs by size. The totals are `rollupOfScoped` over the upstream
 * set, the storage map's own rule for any set of reservoirs.
 */
export function upstreamStorage(
  stations: readonly string[], roster: readonly Reservoir[], options: UpstreamSectionOptions = {}
): HTMLElement[] {
  const summary = upstreamSummary(stations, roster, (reservoir) => reservoirLabel(reservoir, roster));
  if (summary.rows.length === 0) return [];
  const total = summary.rollup;
  const out: HTMLElement[] = [note(
    `Together they hold ${formatAcreFeet(total.storageAf)} acre-feet` +
    (total.percentFull === null ? "." : `, ${Math.round(total.percentFull)}% of what they can hold.`) +
    " Their readings are not all from the same day." +
    (summary.notPublished > 0
      ? ` ${summary.notPublished} more ${summary.notPublished === 1 ? "is" : "are"} above it but not published today.`
      : ""), "reservoir-note")];
  const list = (rows: readonly UpstreamRow[]): HTMLUListElement => {
    const ul = document.createElement("ul");
    ul.className = "upstream-list";
    ul.append(...rows.map((row) => upstreamRow(row, options)));
    return ul;
  };
  if (summary.rows.length < GROUP_AFTER) {
    out.push(list(summary.rows));
    return out;
  }
  if (options.groupRows) {
    const ul = document.createElement("ul");
    ul.className = "upstream-list";
    ul.append(...summary.groups.map((group) => {
      const item = document.createElement("li");
      item.className = "upstream-row";
      item.append(...groupHead(group));
      return item;
    }));
    out.push(ul);
    return out;
  }
  summary.groups.forEach((group, index) => {
    const details = document.createElement("details");
    details.className = "upstream-group";
    details.open = index < 2;
    const head = document.createElement("summary");
    head.append(...groupHead(group));
    details.append(head, list(group.rows));
    out.push(details);
  });
  return out;
}
