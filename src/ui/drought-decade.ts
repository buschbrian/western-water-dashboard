/*
 * The two ten-year charts on the drought page, and the one request they share.
 *
 * The archive is the largest drought file the page can read, and both charts
 * sit below the week's figures, so it is fetched only when the first of the
 * two cards comes near the screen. A reader who never scrolls that far never
 * pays for it (ADR-123). Every way out of the wait -- loaded, failed, or no
 * archive kept at this level -- clears `aria-busy` and says so in words.
 */
import "@esri/calcite-components/components/calcite-label";
import "@esri/calcite-components/components/calcite-option";
import "@esri/calcite-components/components/calcite-select";

import {
  DROUGHT_HISTORY_LEVELS,
  loadDroughtHistory,
  type DroughtHistory
} from "../data/drought-history";
import {
  calendarCounts,
  calendarRows,
  latestHeld,
  yearSummaries,
  type CalendarRow
} from "../drought-history-model";
import { isMeasured } from "../drought-model";
import type { DroughtUnit } from "../types";
import { calendarKeyItems, renderDroughtCalendar } from "../viz/drought-calendar";
import { DROUGHT_CLASSES, NO_DROUGHT_LABEL } from "../viz/drought-classes";
import {
  describeWeek,
  DROUGHT_HISTORY_FALLBACK_WIDTH,
  renderDroughtHistory
} from "../viz/drought-history";
import { formatDate, formatPercent } from "../viz/format";
import { renderResponsiveChart, stopResponsiveChart } from "../viz/responsive";
import { mapStatusNote } from "./view-map";

/** How far below the screen the cards may be when the archive is requested,
 * so the charts are usually drawn by the time a reader scrolls to them. */
const PREFETCH_MARGIN = "600px 0px";

export function droughtDecadeMarkup(): string {
  return `
    <section class="overview-card" id="drought-decade-card" aria-labelledby="drought-decade-heading">
      <div class="card-heading">
        <div><h2 id="drought-decade-heading">Ten years in one area</h2><p>The share of the measured land in each class, for each week of the last ten years, in the same colours as the map. Each colour shows the land in that class or worse, so the top of the yellow is all the land in any class. The line at the right marks this week. A grey band is a week with no map. Move the pointer over the chart, or select it and use the arrow keys, to read one week.</p><p id="drought-decade-source" class="drought-chart-note"></p></div>
      </div>
      <div class="drought-decade-controls" id="drought-decade-controls"></div>
      <div id="drought-decade-host" class="drought-decade-host" aria-busy="true"></div>
      <p id="drought-decade-readout" class="drought-chart-note" aria-live="polite"></p>
      <details class="snow-month-details" id="drought-decade-years" hidden><summary>Highest share in each year</summary>
        <div class="table-scroll" tabindex="0" role="region" aria-label="Highest share in each year, scrolls sideways"><table class="overview-table"><thead><tr><th>Year</th><th>Weeks</th>${DROUGHT_CLASSES.map((entry) => `<th>${entry.code} or worse</th>`).join("")}</tr></thead><tbody id="drought-decade-year-rows"></tbody></table></div>
      </details>
    </section>
    <section class="overview-card" id="drought-calendar-card" aria-labelledby="drought-calendar-heading">
      <div class="card-heading">
        <div><h2 id="drought-calendar-heading">Ten years across the areas</h2><p>One row for each drainage area in view and one column for each week. A week takes the colour of the most severe class that at least half of the area's measured land is in, or worse. A hatched week had less than half of its land even abnormally dry. A grey week has no share, because there was no map that week or the monitor does not measure that land. The rows are in drainage code order, so areas on the same river system are together. A name marked with an asterisk is measured over only part of its area. Select a name to show that area in the chart above.</p></div>
      </div>
      <div id="drought-calendar-host" class="drought-calendar-host" aria-busy="true"></div>
      <ul class="overlay-key" id="drought-calendar-key" aria-label="What each calendar colour means"></ul>
      <details class="snow-month-details" id="drought-calendar-table" hidden><summary>Weeks at each class, by area</summary>
        <div class="table-scroll" tabindex="0" role="region" aria-label="Weeks at each class by area, scrolls sideways"><table class="overview-table"><thead><tr><th>Drainage area</th><th>${NO_DROUGHT_LABEL}</th>${DROUGHT_CLASSES.map((entry) => `<th>${entry.code}</th>`).join("")}<th>No share</th></tr></thead><tbody id="drought-calendar-rows"></tbody></table></div>
      </details>
    </section>`;
}

type DecadeState = "waiting" | "loaded" | "failed" | "not-kept";

function report(fields: Record<string, unknown>): void {
  window.__droughtReady = {
    ...(window.__droughtReady ?? {}), ...fields
  } as NonNullable<typeof window.__droughtReady>;
}

export interface DroughtDecadeContext {
  level: number;
  /** The areas in view, in the page's order. */
  units: readonly DroughtUnit[];
  /** The area the chart opens on: the reader's chosen one when it is in view. */
  opening: string | null;
}

export function mountDroughtDecade(content: HTMLElement, context: DroughtDecadeContext): void {
  const card = content.querySelector<HTMLElement>("#drought-decade-card");
  const host = content.querySelector<HTMLElement>("#drought-decade-host");
  const calendarHost = content.querySelector<HTMLElement>("#drought-calendar-host");
  if (!card || !host || !calendarHost) return;

  const settle = (state: DecadeState, message: string | null): void => {
    for (const target of [host, calendarHost]) {
      target.setAttribute("aria-busy", "false");
      if (message !== null) target.replaceChildren(mapStatusNote(message));
    }
    report({ decadeState: state });
  };

  if (!DROUGHT_HISTORY_LEVELS.has(context.level)) {
    settle("not-kept", "Ten years of weekly figures are kept for regions, subregions " +
      "and basins. Choose one of those under Area size to see them.");
    return;
  }
  if (context.units.length === 0) {
    settle("loaded", "No drainage area matches the chosen place.");
    return;
  }
  report({ decadeState: "waiting" });

  let started = false;
  const start = (): void => {
    if (started) return;
    started = true;
    loadDroughtHistory(context.level).then((history) => {
      draw(content, context, history);
      report({ decadeState: "loaded", decadeWeeks: history.dates.length });
    }).catch((error: unknown) => {
      console.warn("The ten-year drought record could not load:", error);
      settle("failed", "The ten-year record could not load just now. " +
        "This week's figures above are not affected.");
    });
  };
  if (typeof IntersectionObserver === "undefined") {
    start();
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    observer.disconnect();
    start();
  }, { rootMargin: PREFETCH_MARGIN });
  observer.observe(card);
  const calendarCard = content.querySelector<HTMLElement>("#drought-calendar-card");
  if (calendarCard) observer.observe(calendarCard);
}

function draw(content: HTMLElement, context: DroughtDecadeContext, history: DroughtHistory): void {
  const host = content.querySelector<HTMLElement>("#drought-decade-host")!;
  const calendarHost = content.querySelector<HTMLElement>("#drought-calendar-host")!;
  const readout = content.querySelector<HTMLElement>("#drought-decade-readout");
  const source = content.querySelector<HTMLElement>("#drought-decade-source");
  const controls = content.querySelector<HTMLElement>("#drought-decade-controls");
  const names = new Map(context.units.map((unit) => [unit.huc6, unit.huc6_name]));
  const measured = new Map(context.units.map((unit) => [unit.huc6, unit]));
  let chosen = context.opening !== null && names.has(context.opening)
    ? context.opening : context.units[0]!.huc6;

  if (source) {
    /* Every week is one measurement of one kind of map (ADR-122), so this
     * says so once and counts the weeks the archive could not supply. */
    const notes = ["Each week is measured from the Drought Monitor's archived map of that week."];
    if (history.skipped.length > 0) {
      notes.push(`The archive had no usable map for ${history.skipped.length} ` +
        `${history.skipped.length === 1 ? "week" : "weeks"}, shown as gaps.`);
    }
    source.textContent = notes.join(" ");
  }

  /* A select of the areas in view, in the page's own order. It changes only
   * this chart, so it is not written to the address bar: `?area=` already
   * says which place a link is about, and this is which of its areas the
   * reader is looking at right now. */
  const select = document.createElement("calcite-select") as HTMLElement & { value: string };
  select.id = "drought-decade-area";
  select.setAttribute("scale", "l");
  select.setAttribute("label", "Drainage area for the ten-year chart");
  for (const unit of context.units) {
    const option = document.createElement("calcite-option");
    option.setAttribute("value", unit.huc6);
    option.textContent = unit.huc6_name;
    if (unit.huc6 === chosen) option.setAttribute("selected", "");
    select.append(option);
  }
  const field = document.createElement("calcite-label");
  field.append("Drainage area", select);
  controls?.replaceChildren(field);

  const rows: CalendarRow[] = calendarRows(history, context.units.map((unit) => ({
    code: unit.huc6,
    name: unit.huc6_name,
    measuredPercent: unit.measured?.percent_of_area ?? null
  })));
  const current = history.dates.length - 1;
  let cursor: number | null = null;

  const drawChart = (): void => {
    const name = names.get(chosen) ?? chosen;
    const unit = measured.get(chosen);
    const series = history.series.get(chosen) ?? history.dates.map(() => null);
    const yearRows = content.querySelector<HTMLElement>("#drought-decade-year-rows");
    const years = content.querySelector<HTMLElement>("#drought-decade-years");
    if (unit && !isMeasured(unit)) {
      stopResponsiveChart(host);
      host.removeAttribute("tabindex");
      host.replaceChildren(mapStatusNote("The drought monitor does not measure land in this area."));
      if (readout) readout.textContent = "";
      years?.setAttribute("hidden", "");
      report({ decadeArea: chosen });
      return;
    }
    const latest = latestHeld(series);
    const partial = unit?.measured !== undefined
      ? ` The figures cover ${formatPercent(unit.measured.percent_of_area)} of the area.` : "";
    const ariaLabel = `${name}: the share of the measured land in each drought class, ` +
      `each week from ${formatDate(history.dates[0]!)} to ${formatDate(history.dates[current]!)}. ` +
      (latest !== null ? describeWeek(history.dates[latest]!, series[latest]!) : "") +
      partial + " The table below lists the highest share in each year.";
    renderResponsiveChart(host, (width) => {
      const chart = renderDroughtHistory({ dates: history.dates, series, current }, ariaLabel, width);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("class", "drought-history-cursor");
      line.setAttribute("y1", String(chart.plotTop));
      line.setAttribute("y2", String(chart.plotBottom));
      const place = (index: number | null): void => {
        cursor = index;
        if (index === null) {
          line.setAttribute("visibility", "hidden");
          return;
        }
        const middle = chart.weekX(index) + chart.weekWidth / 2;
        line.setAttribute("x1", String(middle));
        line.setAttribute("x2", String(middle));
        line.setAttribute("visibility", "visible");
        if (readout) readout.textContent = describeWeek(history.dates[index]!, series[index]!);
      };
      chart.svg.append(line);
      place(cursor);
      chart.svg.addEventListener("pointermove", (event) => {
        const box = chart.svg.getBoundingClientRect();
        const unitX = ((event.clientX - box.left) / box.width) * chart.svg.viewBox.baseVal.width;
        const index = Math.floor((unitX - chart.weekX(0)) / chart.weekWidth);
        if (index >= 0 && index < history.dates.length) place(index);
      });
      host.onkeydown = (event: KeyboardEvent): void => {
        const step = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1
          : event.key === "PageUp" ? -52 : event.key === "PageDown" ? 52 : 0;
        const jump = event.key === "Home" ? 0 : event.key === "End" ? current : null;
        if (step === 0 && jump === null) return;
        event.preventDefault();
        place(jump ?? Math.min(current, Math.max(0, (cursor ?? current) + step)));
      };
      host.replaceChildren(chart.svg);
      return chart;
    }, { fallbackWidth: DROUGHT_HISTORY_FALLBACK_WIDTH, minimumWidth: 200 });
    host.tabIndex = 0;
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", `Ten-year chart for ${name}. ` +
      "Use the left and right arrow keys to read one week, Page Up and Page Down for a year.");
    host.setAttribute("aria-busy", "false");
    if (readout) {
      readout.textContent = latest !== null
        ? describeWeek(history.dates[cursor ?? latest]!, series[cursor ?? latest]!) : "";
    }

    if (yearRows && years) {
      yearRows.replaceChildren(...yearSummaries(history.dates, series).map((year) => {
        const row = document.createElement("tr");
        const label = document.createElement("th");
        label.scope = "row";
        label.textContent = year.year;
        row.append(label);
        for (const value of [String(year.weeks),
          ...DROUGHT_CLASSES.map((entry) => formatPercent(year.highest[entry.key]))]) {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        }
        return row;
      }));
      years.removeAttribute("hidden");
    }
    report({ decadeArea: chosen });
  };

  const choose = (code: string, fromCalendar: boolean): void => {
    chosen = code;
    cursor = null;
    if (select.value !== code) select.value = code;
    for (const button of calendarHost.querySelectorAll<HTMLButtonElement>(".drought-calendar-name")) {
      button.setAttribute("aria-pressed", String(button.dataset.code === code));
    }
    drawChart();
    /* A name chosen down in the calendar changes a chart that may be a
     * screen above it, so the reader is taken to what changed. */
    if (fromCalendar) {
      content.querySelector<HTMLElement>("#drought-decade-card")
        ?.scrollIntoView({ block: "start" });
      host.focus({ preventScroll: true });
    }
  };
  select.addEventListener("calciteSelectChange", () => choose(select.value, false));

  drawChart();
  const drawn = renderDroughtCalendar(calendarHost, rows, {
    dates: history.dates, current, chosen,
    onChoose: (code) => choose(code, true)
  });
  calendarHost.setAttribute("aria-busy", "false");
  content.querySelector<HTMLElement>("#drought-calendar-key")
    ?.replaceChildren(...calendarKeyItems());

  const tableRows = content.querySelector<HTMLElement>("#drought-calendar-rows");
  const table = content.querySelector<HTMLElement>("#drought-calendar-table");
  if (tableRows && table) {
    tableRows.replaceChildren(...rows.map((row) => {
      const counts = calendarCounts(row.cells);
      const line = document.createElement("tr");
      const label = document.createElement("th");
      label.scope = "row";
      label.textContent = row.name;
      line.append(label);
      for (const value of [counts.none, ...DROUGHT_CLASSES.map((entry) => counts[entry.key]),
        counts.missing]) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        line.append(cell);
      }
      return line;
    }));
    table.removeAttribute("hidden");
  }
  report({ calendarRows: drawn });
}
