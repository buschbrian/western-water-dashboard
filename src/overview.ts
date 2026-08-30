import "@esri/calcite-components/main.css";
import { setAssetPath as setCalciteAssetPath } from "@esri/calcite-components";
import "@esri/calcite-components/components/calcite-action";
import "@esri/calcite-components/components/calcite-button";
import "@esri/calcite-components/components/calcite-label";
import "@esri/calcite-components/components/calcite-loader";
import "@esri/calcite-components/components/calcite-navigation";
import "@esri/calcite-components/components/calcite-option";
import "@esri/calcite-components/components/calcite-select";

import { loadReservoirs } from "./data/load";
import { baselineChoices, periodLabel } from "./state/baseline";
import { loadDroughtCoverage } from "./data/drought-load";
import { loadSnowpack } from "./data/snow-load";
import {
  loadOpeningRosters,
  openingSelectionFromSearch,
  resolveOpeningScope,
  withinOpeningArea,
  type OpeningRosters,
  type OpeningScope,
  EMPTY_OPENING_ROSTERS,
  isOpeningScopeChosen
} from "./data/opening-scope";
import { weeklySummary } from "./weekly-model";
import { describeWeek } from "./viz/weekly-summary";
import { downloadCsv } from "./data/download";
import { overviewCsv, overviewCsvFilename } from "./data/export";
import {
  asScoped, isLakeMead, isLakePowell, isLate, rollupOfScoped, WIDEST_SCOPE,
  type RollupCoverage, type StatewideRollup
} from "./data/rollup";
import { classIndexOf } from "./state/filters";
import { offeredStates } from "./data/state-vocabulary";
import {
  overviewStateFromSearch,
  writeOverviewUrl,
  type OverviewUrlState
} from "./state/overview-url";
import { STORAGE_CLASSES } from "./viz/classes";
import { contrastingTextColor } from "./viz/color";
import {
  distributionOverlayKey,
  renderArcgisBarChart,
  renderArcgisDistributionChart,
  offScaleNote,
  renderArcgisNormalChart,
  renderArcgisTrendChart,
  storageLegendEntries
} from "./overview-charts";
import { renderSpread } from "./viz/spread";
import {
  filterAndSort,
  filterOverview,
  distributionStats,
  largestReservoirRecords,
  monthlyTrend,
  normalComparison,
  openingScopeSummary,
  overviewDrainageRosters,
  overviewScope,
  percentFullValues,
  placeAxesAfterPick,
  reservoirInState,
  spreadBoxes,
  countyOptions,
  stateOptions,
  watershedOptions,
  watershedRecords,
  type ChartMeasure,
  type ChartRank,
  type DistributionStats,
  type OverviewCadence,
  type OverviewSort
} from "./overview-model";
import { createDrainageMenu, createWhereMenu } from "./ui/where-control";
import { placeInSlot } from "./ui/dom";
import type { CountyChoice } from "./ui/where-control-model";
import type {
  BaselineChoice, BaselineId, DroughtCoveragePayload, Reservoir, SnowpackPayload
} from "./types";
import { brandMarkup, pageLinksMarkup, updatePageLinks } from "./ui/page-header";
import { setupPlaceChooser } from "./ui/opening-splash";
import {
  wireMobileDisclosure,
  wireMobileFilterDisclosure
} from "./ui/mobile-filter-disclosure";
import { THEME_CHANGE_EVENT, wireTheme } from "./ui/theme";
import { reservoirLabel } from "./state/selection";
import { formatAcreFeet, formatDate, formatPercent } from "./viz/format";
import "./styles/overview.css";

setCalciteAssetPath(new URL(/* @vite-ignore */ "../", import.meta.url).href);
const root = document.querySelector<HTMLElement>("#overview-app");
if (!root) throw new Error("Missing #overview-app root");

root.innerHTML = `
  <calcite-navigation class="overview-nav" aria-label="Primary navigation">
    <!-- The brand is this page's only heading of the first rank. The page
         used to carry its own "Utah reservoir conditions" below the bar,
         which said the same thing twice at two sizes; with that gone the
         bar has to be the h1, or the page has none at all. The map shell
         has always done it this way. -->
    ${brandMarkup(1, "overview")}
    ${pageLinksMarkup("overview", window.location.search)}
    <calcite-action id="theme-toggle" slot="content-end" text="Theme: system"
      icon="brightness" label="Change color theme"></calcite-action>
  </calcite-navigation>
  <main class="overview-main">
    <header class="overview-intro">
      <p>Explore current storage for the reservoirs this site tracks across the western
        United States. Lake Powell and Lake Mead are each large enough to hide local
        conditions in a combined total. Both start included, and either can be taken out at
        any time.</p>
    </header>
    <section id="overview-content" aria-live="polite"><calcite-loader label="Loading reservoir data"></calcite-loader></section>
  </main>`;
wireTheme();
void setupPlaceChooser();

/** The permanent map link for one reservoir. Qualified against the complete
 * roster so a filtered table never turns one of two shared names back into
 * an ambiguous bare-name link. */
function reservoirMapHref(reservoir: Reservoir, allReservoirs: readonly Reservoir[]): string {
  return `./?reservoir=${encodeURIComponent(reservoirLabel(reservoir, allReservoirs))}`;
}

function renderRows(
  tbody: HTMLTableSectionElement,
  reservoirs: readonly Reservoir[],
  allReservoirs: readonly Reservoir[]
): void {
  tbody.replaceChildren(...reservoirs.map((reservoir) => {
    const row = document.createElement("tr");
    row.dataset.reservoir = reservoir.name;
    const label = reservoirLabel(reservoir, allReservoirs);
    const cells = [label, reservoir.huc6_name ?? "Not assigned",
      formatPercent(reservoir.pct_of_capacity), formatAcreFeet(reservoir.current_storage_af),
      formatAcreFeet(reservoir.capacity_af), formatDate(reservoir.as_of)];
    cells.forEach((value, index) => {
      const cell = document.createElement("td");
      if (index === 0) {
        const link = document.createElement("a");
        link.className = "overview-reservoir-link";
        link.href = reservoirMapHref(reservoir, allReservoirs);
        link.textContent = value;
        link.setAttribute("aria-label", `Open ${value} on the storage map`);
        cell.append(link);
      } else {
        cell.textContent = value;
      }
      if (index === 5 && isLate(reservoir)) cell.className = "late-badge";
      row.append(cell);
    });
    return row;
  }));
}

/**
 * When the readings behind a combined figure were taken.
 *
 * Two facts, and the second is the one that matters: a reader can discount
 * "9 late" as a rounding detail, and cannot discount "97% of the combined
 * full level was read on time" or fail to notice its absence. Ten small late
 * reservoirs and one enormous late reservoir give the same count.
 */
function describeObservations(coverage: RollupCoverage): string {
  const { earliestDate, latestDate } = coverage;
  if (!earliestDate || !latestDate) return "No readings in view";
  const span = earliestDate === latestDate
    ? `All readings from ${formatDate(earliestDate)}`
    : `Readings from ${formatDate(earliestDate)} to ${formatDate(latestDate)}`;
  const onTime = coverage.percentCapacityCurrent;
  return onTime === null ? span
    : `${span} · ${formatPercent(onTime)} of the full level read on time`;
}

/**
 * What the combined full level divides by, when it divides by more than one
 * thing.
 *
 * The two largest by capacity, then a count of the rest. Every kind was named
 * until there were six of them, and the sentence ran to 27 words -- over
 * ADR-006's limit, and unreadable in a tile's small print well before that.
 * Its length followed the data, so it was inside the limit on the morning it
 * was written and outside it on the morning a sixth basis appeared.
 *
 * Two rather than one, because the point of the tile is that the denominator
 * is mixed; `basisShares` is sorted by capacity, so these are the two that
 * carry it. The complete breakdown is not lost -- every reservoir publishes
 * its own `capacity_basis`, and the details panel names each one in full.
 */
function describeDenominator(rollup: StatewideRollup): string {
  const shares = rollup.basisShares;
  const only = shares[0];
  if (!only) return "No reservoirs in view";
  if (shares.length === 1) return `Measured against ${only.label.toLowerCase()}`;
  const named = shares.slice(0, 2)
    .map((share) => `${share.label.toLowerCase()} ${share.count}`)
    .join(", ");
  const rest = shares.length - 2;
  if (rest <= 0) return `Full levels: ${named}`;
  return `Full levels: ${named}, and ${rest} other ${rest === 1 ? "kind" : "kinds"}`;
}

function updateKpis(
  reservoirs: readonly Reservoir[], period: ComparisonPeriod
): void {
  /* The rows handed in are already the scope the reader chose.
   * `rollupOfScoped` takes no scope dimensions, so a second
   * dominant-reservoir filter cannot be applied on top of it -- which is what
   * makes the toggles work. */
  const rollup = rollupOfScoped(asScoped(reservoirs), {
    baseline: period.id,
    minimumBaselineYears: period.minimumYears
  });
  const signed = (value: number): string =>
    `${value >= 0 ? "+" : ""}${formatAcreFeet(value)}`;
  const years = periodLabel(period.choices, rollup.normalBaseline);
  const { coverage } = rollup;
  const values: Record<string, string> = {
    percent: formatPercent(rollup.percentFull),
    volume: `${formatAcreFeet(rollup.storageAf)} of ${formatAcreFeet(rollup.capacityAf)}`,
    count: String(rollup.count),
    /* Which reservoirs, and against how many kinds of full level. The tile
     * used to say "Utah-intersecting waterbodies", which was the whole
     * roster's description once and describes 60 of 198 rows now. */
    "count-note": describeDenominator(rollup),
    /* How full against how full it usually is on this date. The headline
     * percentage cannot answer that on its own: a reservoir at 60% in April
     * and one at 60% in September are not the same news, and this is the
     * number a drought reader is actually looking for. The years are named
     * because two periods are published and they do not agree (ADR-041). */
    normal: formatPercent(rollup.percentOfNormal),
    "normal-note": rollup.normalCovers === rollup.count
      ? `Of the usual storage for this date, ${years}`
      : `Of the usual storage for this date, ${years}, for ${rollup.normalCovers} `
        + `of ${rollup.count} reservoirs`,
    year: signed(rollup.change365dAf),
    change: `30 days: ${signed(rollup.change30dAf)}`,
    late: String(rollup.stale),
    /* The readings are not all from the publication date, and until now the
     * tile said only "Observation dates vary by reservoir" -- true, and no
     * help in judging whether the total is a picture of now. */
    observed: describeObservations(coverage)
  };
  for (const [name, value] of Object.entries(values)) {
    const element = document.querySelector<HTMLElement>(`[data-kpi="${name}"]`);
    if (element) element.textContent = value;
  }
}

/**
 * Which period this page's combined comparison is measured against, and the
 * words for it.
 *
 * The page has no period control of its own -- the storage map has that -- so
 * it takes the payload's declared default, which is the period the map opens
 * on. Before this it took neither: the tile read `seasonal_normal_af`
 * unconditionally, which is the recent period, and printed it under the words
 * "Of the usual storage for this date". A reader who had just seen the map's
 * standard-period figure saw a different number here with no way to know why
 * (ADR-041).
 */
interface ComparisonPeriod {
  id: BaselineId;
  choices: readonly BaselineChoice[];
  minimumYears: number;
}

async function renderOverview(
  allReservoirs: Reservoir[], generatedAt: string,
  regions: readonly { huc2: string; name: string }[],
  subregions: readonly { huc4: string; name: string }[],
  subbasins: readonly { huc8: string; name: string }[],
  openingScope: OpeningScope, openingRosters: OpeningRosters,
  period: ComparisonPeriod
): Promise<void> {
  const content = document.querySelector<HTMLElement>("#overview-content");
  if (!content) return;
  /* Built from the widest scope so the list of drainage areas does not
   * change shape when Lake Powell is toggled. `widestScope` is also what
   * `update()` rebuilds the subregion and drainage-area options from, for
   * the same reason -- a control that answers "where can a reader go" must
   * not follow ADR-011's other dimension, which is what is in the total. */
  const stateChoices = stateOptions(allReservoirs);
  const widestScope = overviewScope(allReservoirs, WIDEST_SCOPE);
  content.innerHTML = `
    <!-- Two rows, and each row is one kind of thing: what this section is
         and how to undo it, then the controls themselves. They used to share
         a single wrapping flex line, so the heading competed with the four
         selects for the same space and "Reset view" was pushed wherever
         the last control left room -- a different place at every width. -->
    <section class="overview-card weekly-card" id="weekly-summary"
      aria-labelledby="weekly-heading" aria-busy="true">
      <div class="card-heading">
        <div>
          <h2 id="weekly-heading">What moved this week</h2>
          <p class="weekly-intro">The last seven days, worked out from the same files the rest of this site draws. The storage figures follow the reservoirs the scope includes, so a change to the Lake Powell control changes them. The snow and drought figures describe the whole region and cannot follow a reservoir scope, which each of them says. Nothing here is a forecast.</p>
          <p class="weekly-scope" data-weekly="scope" role="status" aria-live="polite"></p>
        </div>
        <button id="weekly-toggle" class="mobile-disclosure-toggle" type="button"
          aria-controls="weekly-sections" aria-expanded="false">Show weekly update</button>
      </div>
      <div id="weekly-sections" class="weekly-sections"></div>
    </section>
    <!-- What a shared link's ?state= and ?area= narrowed this page to when
         it opened (slice S3d, docs/OPENING-SCOPE-AND-THE-WESTERN-ROSTER.md).
         Read once from the address bar the page loaded with -- the filter
         bar's own controls are what the reader adjusts from there, and
         #filter-status already reports what they currently hold. Hidden
         rather than empty when the reader asked for nothing, so this never
         announces a blank status line. -->
    <p id="opening-scope-summary" class="opening-scope-summary" role="status" hidden></p>
    <section class="dashboard-filterbar mobile-filterbar" aria-labelledby="filter-heading">
      <!-- Lake Powell rides with the heading rather than in the row of
           selects below it. It is not the same kind of question they are:
           they narrow the set the reader is studying, and this one decides
           whether a single reservoir big enough to move every headline
           number on the page is in the total at all. Sat fifth in the row
           it read as one more narrowing filter. -->
      <div class="filterbar-head">
        <div class="filterbar-title"><p class="eyebrow">Cross-filter dashboard</p><h2 id="filter-heading">Focus the analysis</h2></div>
        <button id="overview-filter-toggle" class="mobile-filter-toggle" type="button"
          aria-controls="overview-filter-actions overview-filter-search overview-filter-controls"
          aria-expanded="false">Show filters</button>
        <div id="overview-filter-actions" class="filterbar-head-actions">
          <label class="switch-label" for="lake-powell-toggle"><span>Include Lake Powell</span><input id="lake-powell-toggle" type="checkbox" role="switch" checked /></label>
          <label class="switch-label" for="lake-mead-toggle"><span>Include Lake Mead</span><input id="lake-mead-toggle" type="checkbox" role="switch" checked /></label>
          <button id="reset-filters" class="reset-button" type="button">Reset view</button>
        </div>
      </div>
      <!-- The open control, above the closed ones and ruled off from them.
           A search matches a name, operator, provider, drainage area or county, all at once
           and on anything a reader types; every control below it offers a
           closed list and narrows to one member of it. Laid out among them
           it read as the first dropdown. -->
      <div id="overview-filter-search" class="filterbar-search">
        <label>Find a reservoir<input id="reservoir-search" type="search" placeholder="Name, operator, provider, drainage area or county" autocomplete="off" /></label>
      </div>
      <!-- Coarsest first, then finest: Where (state, with counties beneath),
           then one Drainage area menu spanning region, subregion and basin.
           The two controls that are not places come last,
           because a reader narrowing by place should not have to step
           over a reporting schedule to get from one place to a smaller
           one. -->
      <div id="overview-filter-controls" class="filterbar-controls">
        <!-- One menu for both place axes (ADR-084), built by the shared
             createWhereMenu from the published roster and this payload's
             county assignments -- states as rows, counties grouped beneath
             their state's name. Arrives after first paint like every
             control here; see the control-slot rule in app.css. -->
        <div class="control-slot" data-slot="place"></div>
        <div class="control-slot" data-slot="drainage"></div>
        <!-- One control family to the bar: a Calcite select at the same
             scale as the two place menus beside it. -->
        <calcite-label>Reporting<calcite-select id="cadence-filter" scale="l"><calcite-option value="all">All reporting</calcite-option><calcite-option value="daily">Daily</calcite-option><calcite-option value="monthly">Monthly</calcite-option><calcite-option value="late">Late or unavailable</calcite-option></calcite-select></calcite-label>
      </div>
    </section>
    <p id="filter-status" class="filter-status" role="status"></p>
    <section class="overview-kpis" aria-label="Filtered storage summary">
      <article class="overview-kpi overview-kpi-primary"><span>Combined storage</span><strong data-kpi="percent">—</strong><small data-kpi="volume">—</small></article>
      <article class="overview-kpi"><span>Reservoirs in view</span><strong data-kpi="count">—</strong><small data-kpi="count-note">—</small></article>
      <article class="overview-kpi"><span>Compared with normal</span><strong data-kpi="normal">—</strong><small data-kpi="normal-note">—</small></article>
      <article class="overview-kpi"><span>Change over the year</span><strong data-kpi="year">—</strong><small data-kpi="change">30 days: —</small></article>
      <article class="overview-kpi"><span>Late or unavailable</span><strong data-kpi="late">—</strong><small>Evaluated against each source update schedule</small></article>
      <article class="overview-kpi"><span>Data published</span><strong>${formatDate(generatedAt.slice(0, 10))}</strong><small data-kpi="observed">—</small></article>
    </section>
    <section class="class-strip" aria-labelledby="class-heading">
      <div class="class-strip-head">
        <h2 id="class-heading">How the reservoirs are spread</h2>
        <p>Choose a level to filter everything below. The widths are the share of reservoirs in view.</p>
      </div>
      <div class="class-bar" data-classes role="group" aria-labelledby="class-heading"></div>
    </section>
    <section class="chart-settings mobile-chart-settings" aria-labelledby="chart-settings-heading">
      <div class="chart-settings-copy">
        <p class="eyebrow">Chart display</p>
        <h2 id="chart-settings-heading">Choose how the charts show the filtered data</h2>
        <p>The filters above change every chart and the table. Each setting here says which charts it changes.</p>
      </div>
      <button id="chart-settings-toggle" class="mobile-disclosure-toggle" type="button"
        aria-controls="chart-settings-controls" aria-expanded="false">Show chart options</button>
      <div id="chart-settings-controls" class="chart-settings-controls">
        <label>Largest reservoirs shown<select id="chart-limit"><option value="10">Top 10</option><option value="15" selected>Top 15</option><option value="25">Top 25</option><option value="0">All</option></select></label>
        <label>Storage charts measure<select id="chart-measure"><option value="percent">Percent full</option><option value="storage">Acre-feet stored</option></select></label>
        <label>Largest reservoirs ordered by<select id="chart-rank"><option value="capacity">Capacity</option><option value="storage">Storage</option><option value="percent">Percent full</option><option value="name">Name</option></select></label>
      </div>
    </section>
    <div class="overview-chart-grid">
      <section class="overview-card overview-card-wide" aria-labelledby="capacity-heading">
        <div class="card-heading">
          <div><h2 id="capacity-heading">Largest reservoirs</h2><p>Click a bar to open that reservoir on the storage map. A reservoir can hold more than its full level when water is held above the usual pool. A bar can then run past 100%.</p></div>
          <span class="sdk-badge">Bar chart</span>
        </div>
        <div id="capacity-chart" class="chart-host" aria-busy="true"></div>
        <div class="chart-legend" data-legend></div>
      </section>
      <section class="overview-card overview-card-wide" aria-labelledby="watershed-heading">
        <div class="card-heading"><div><h2 id="watershed-heading">Drainage-area conditions</h2><p>Combined storage divided by the combined full level within each area. Click a bar to filter to it.</p></div><span class="sdk-badge">Bar chart</span></div>
        <div id="watershed-chart" class="chart-host" aria-busy="true"></div>
        <div class="chart-legend" data-legend></div>
      </section>
      <section class="overview-card" aria-labelledby="trend-heading">
        <div class="card-heading"><div><h2 id="trend-heading">The last 12 months</h2><p>Combined storage for the reservoirs in view, month by month. The only chart here that shows direction. Each month counts only the reservoirs that reported it, so the months are not all drawn from the same set. The newest month is the one to read with care. Reservoirs read once a month report at month end, so that month is thin until they do. Hover any month to see how many reservoirs are behind it.</p></div><span class="sdk-badge">Bar and line chart</span></div>
        <div id="trend-chart" class="chart-host" aria-busy="true"></div>
      </section>
      <section class="overview-card" aria-labelledby="normal-heading">
        <div class="card-heading"><div><h2 id="normal-heading">Stored now against normal</h2><p>Each dot is a reservoir. Dots below the dashed line hold less than they usually do on this date. The reservoirs get larger to the right, in tenfold steps, so the small ones are as readable as Flaming Gorge. The scale stops at twice the usual level. A reservoir that usually holds very little on this date can read far above that. A small change in storage is then a large change in the percentage.</p></div><span class="sdk-badge">Scatter plot</span></div>
        <div id="normal-chart" class="chart-host" aria-busy="true"></div>
        <!-- Which reservoirs the ratio axis could not reach, named rather
             than dropped. Filled by offScaleNote and hidden when every
             reservoir fits, so this never announces an empty status. -->
        <div id="normal-off-scale" class="chart-note" role="status" hidden></div>
        <div class="chart-legend" data-legend></div>
      </section>
      <section class="overview-card overview-card-wide" aria-labelledby="distribution-heading">
        <div class="card-heading"><div><h2 id="distribution-heading">How full, across all of them</h2><p>Reservoirs sorted into ten equal bands of percent full, with the mean, the middle value, and the range the middle half of them fall in. These reservoirs differ in size, purpose and operating rules, so they are not one population with a shape to fit a curve to.</p></div><span class="sdk-badge">Histogram</span></div>
        <div id="distribution-chart" class="chart-host" aria-busy="true"></div>
        <!-- Under the chart, not beside it. The histogram is the widest thing
             on this page and a key in a side rail would take width from the
             bars; a row underneath spreads across the full card and keeps the
             chart symmetrical. -->
        <ul class="overlay-key" id="distribution-key"
          aria-label="What the lines across the histogram mean"></ul>
      </section>
      <section class="overview-card overview-card-wide" aria-labelledby="spread-heading">
        <div class="card-heading"><div><h2 id="spread-heading">Spread within each drainage area</h2><p>Each row is one drainage area, driest first. The box holds the middle half of its reservoirs and the line inside it is the middle value. The whiskers reach the rest, and every dot beyond them is one reservoir worth opening on the map. The figure at the right of each row is how many reservoirs the row holds. A box drawn over three of them carries less weight than one drawn over forty. The box takes its colour from that area's middle value, in the same colours as the map circles. An area at 60% can be forty reservoirs near 60, or half full and half empty. Areas with fewer than three reservoirs are left out, because a box drawn over two of them is just the two values again. A reservoir can hold more than its full level when water is held above the usual pool. A whisker or a mark pressed against the right edge can then stand for a value past 100%.</p></div><span class="sdk-badge">Box plot</span></div>
        <div id="spread-chart" class="chart-host" aria-busy="true"></div>
        <div class="chart-legend" data-legend></div>
      </section>
    </div>
    <section class="overview-card table-card mobile-table-card" aria-labelledby="table-heading">
      <div class="card-heading">
        <div><h2 id="table-heading">Reservoir detail</h2><p>Exact values for the same filtered records shown above. Choose a reservoir name to open it on the storage map.</p></div>
        <button id="overview-table-toggle" class="mobile-disclosure-toggle" type="button"
          aria-controls="overview-table-actions overview-table-scroll"
          aria-expanded="false">Show table</button>
        <div id="overview-table-actions" class="table-actions"><label class="sort-control">Sort rows<select id="reservoir-sort"><option value="capacity">Capacity</option><option value="name">Name</option><option value="storage">Current storage</option><option value="percent">Percent full</option><option value="updated">Observation date</option></select></label><calcite-button id="download-overview-csv" appearance="outline" icon-start="export" scale="s">Download filtered table (CSV file)</calcite-button></div>
      </div>
      <div id="overview-table-scroll" class="table-scroll" tabindex="0" role="region" aria-label="Reservoir table, scrolls sideways"><table class="overview-table"><thead><tr><th>Reservoir</th><th>Drainage area</th><th>Full</th><th>Storage (acre-feet)</th><th>Capacity (acre-feet)</th><th>Observed</th></tr></thead><tbody id="reservoir-rows"></tbody></table></div>
    </section>`;

  const weeklyCard = document.querySelector<HTMLElement>("#weekly-summary");
  const weeklyToggle = document.querySelector<HTMLButtonElement>("#weekly-toggle");
  if (weeklyCard && weeklyToggle) {
    wireMobileDisclosure(weeklyCard, weeklyToggle, {
      openClass: "weekly-open",
      openLabel: "Hide weekly update",
      closedLabel: "Show weekly update"
    });
  }
  const filterbar = document.querySelector<HTMLElement>("#overview-content .mobile-filterbar");
  const filterToggle = document.querySelector<HTMLButtonElement>("#overview-filter-toggle");
  if (filterbar && filterToggle) wireMobileFilterDisclosure(filterbar, filterToggle);
  const chartSettings = document.querySelector<HTMLElement>(".mobile-chart-settings");
  const chartSettingsToggle = document.querySelector<HTMLButtonElement>("#chart-settings-toggle");
  if (chartSettings && chartSettingsToggle) {
    wireMobileDisclosure(chartSettings, chartSettingsToggle, {
      openClass: "mobile-chart-settings-open",
      openLabel: "Hide chart options",
      closedLabel: "Show chart options"
    });
  }
  const tableCard = document.querySelector<HTMLElement>(".mobile-table-card");
  const tableToggle = document.querySelector<HTMLButtonElement>("#overview-table-toggle");
  if (tableCard && tableToggle) {
    wireMobileDisclosure(tableCard, tableToggle, {
      openClass: "mobile-table-open",
      openLabel: "Hide table",
      closedLabel: "Show table"
    });
  }

  /* One legend per chart, built from the class table rather than by the
   * chart SDK: the bars, the map circles and this all read the same rows, so
   * a break that moves moves in one place (ADR-008). */
  for (const host of document.querySelectorAll<HTMLElement>("[data-legend]")) {
    host.replaceChildren(...storageLegendEntries().map((entry) => {
      const item = document.createElement("span");
      item.className = "chart-legend-item";
      const swatch = document.createElement("span");
      swatch.className = "chart-legend-swatch";
      swatch.style.background = entry.color;
      const label = document.createElement("span");
      label.textContent = entry.label;
      item.append(swatch, label);
      return item;
    }));
    host.setAttribute("aria-label", "Storage levels, the same colours the map uses");
  }

  /* The class the reader has narrowed to, or null for all of them. Held
   * here rather than in a control because the strip *is* the control: the
   * distribution and the filter are one thing, so a reader cannot be
   * looking at a spread that does not match what is below it. */
  let storageClassFilter: number | null = null;

  const openingSummary = document.querySelector<HTMLElement>("#opening-scope-summary");
  if (openingSummary) {
    const summary = openingScopeSummary(openingScope.selection, openingRosters);
    openingSummary.textContent = summary;
    openingSummary.hidden = summary === "";
  }

  /* The subregion names travel in the payload's own envelope (ADR-048), so a
   * code the roster does not carry is labelled by its code rather than lost.
   * They are also what the drainage-area list's group headings read, which is
   * why this map is built before that list is first filled. */
  const subregionNames = new Map<string, string>(
    subregions.map((entry) => [entry.huc4, entry.name]));
  /* Built from the widest scope like the drainage-area list, and for the
   * same reason -- and so the full list exists before the link's choice is
   * restored, or a shared ?huc4= would be discarded against an empty
   * control. */
  const watershedChoices = watershedOptions(widestScope, 6, subregionNames);
  /* The two place axes, held here rather than read back out of the menu
   * (ADR-084: "The two axes stay two"). The merged Where menu *shows* the
   * finer of whatever is held -- a county over its state -- but a county
   * row writes `?county=` and leaves `?state=` alone, because state is the
   * axis that survives the navigation to another page. Deriving state from
   * the menu's visible value silently dropped it on every county pick;
   * that is what these two variables exist to not do again.
   *
   * `countyStateOf` is what "a county the new state does hold" means,
   * built from the same choices list that builds the menu's headings, so
   * the keep-or-clear rule cannot drift from what a reader sees grouped in
   * front of them (the ADR-076 fallback rule, carried into one menu). */
  let chosenState = "all";
  let chosenCounty = "all";
  let chosenDrainage: string | null = openingScope.selection.area;
  const countyChoices = countyOptions(allReservoirs);
  const countyStateOf = new Map(countyChoices
    .filter((choice) => choice.group !== undefined)
    .map((choice) => [choice.code, choice.group!]));
  const counties: CountyChoice[] = countyChoices.map((choice) => ({
    fips: choice.code,
    name: choice.label,
    /* A county whose record carries no state cannot be placed under a
     * heading; it stays out of the menu rather than wearing one that names
     * nothing -- the same rule the model applies to unplaceable drainage
     * rows. */
    state: choice.group ?? ""
  })).filter((choice) => choice.state !== "");
  const placeMenuHost = document.querySelector<HTMLElement>(
    "#overview-filter-controls");
  const reflectPlace = (): void => {
    placeMenu?.set({ state: chosenState, area: null },
      chosenCounty === "all" ? null : chosenCounty);
  };
  const menuRosters = openingRosters.areas.length > 0
    ? openingRosters
    : overviewDrainageRosters(allReservoirs, regions, subregions, subbasins);
  const drainageHasReservoir = (code: string, state = chosenState): boolean =>
    widestScope.some((reservoir) =>
      reservoirInState(reservoir, state)
        && withinOpeningArea(reservoir.huc8 ?? reservoir.huc6, code));
  const reflectDrainage = (): void => {
    drainageMenu?.set({ state: chosenState, area: chosenDrainage });
  };
  const applyPlacePick = (pick: { kind: "state" | "county"; value: string }): void => {
    const next = placeAxesAfterPick(
      { state: chosenState, county: chosenCounty }, pick, countyStateOf);
    chosenState = next.state;
    chosenCounty = next.county;
    if (chosenDrainage !== null && !drainageHasReservoir(chosenDrainage, chosenState)) {
      chosenDrainage = null;
    }
    reflectPlace();
    reflectDrainage();
    void update();
  };
  /* Built from the published roster (`openingRosters`) and this payload's
   * county assignments, by the same builder the three map pages use -- one
   * implementation of one menu, headings carrying full state names like
   * the top-level rows they sit beneath. */
  /* This page skips the reference export when the address bar names no
   * place, so the menu's states come from this payload's waterbodies --
   * `offeredStates` maps them to published names, which is what makes a
   * county's heading read the same way as the rows above it. */
  const placeStates = offeredStates({
    reservoirStates: allReservoirs.map((reservoir) =>
      reservoir.waterbody_states?.length
        ? reservoir.waterbody_states
        : (reservoir.state ? [reservoir.state] : []))
  });
  const placeMenu = placeMenuHost
    ? createWhereMenu(openingRosters, { state: chosenState, area: null },
      (pick) => applyPlacePick(pick),
      { counties, scale: "l", states: placeStates })
    : null;
  if (placeMenu && placeMenuHost) {
    placeInSlot(placeMenuHost, "place", placeMenu.element);
  }
  const drainageMenu = placeMenuHost
    ? createDrainageMenu(menuRosters, { state: chosenState, area: chosenDrainage },
      (selection) => {
        chosenDrainage = selection.area;
        void update();
      }, {
        scale: "l",
        /* A storage-chart pick removes rows rather than dimming map context.
         * Offer only basin families that contain at least one reservoir in
         * the held state, so every row has an honest non-empty result. */
        include: (code) => drainageHasReservoir(code)
      })
    : null;
  if (drainageMenu && placeMenuHost) {
    placeInSlot(placeMenuHost, "drainage", drainageMenu.element);
  }
  const placeState = (): string => chosenState;
  const placeCounty = (): string => chosenCounty;
  const tbody = document.querySelector<HTMLTableSectionElement>("#reservoir-rows");
  const search = document.querySelector<HTMLInputElement>("#reservoir-search");
  const cadence = document.querySelector<HTMLElement & { value: string }>("#cadence-filter");
  const sort = document.querySelector<HTMLSelectElement>("#reservoir-sort");
  const lakePowell = document.querySelector<HTMLInputElement>("#lake-powell-toggle");
  const lakeMead = document.querySelector<HTMLInputElement>("#lake-mead-toggle");
  const reset = document.querySelector<HTMLButtonElement>("#reset-filters");
  const status = document.querySelector<HTMLElement>("#filter-status");
  const capacityHost = document.querySelector<HTMLElement>("#capacity-chart");
  const watershedHost = document.querySelector<HTMLElement>("#watershed-chart");
  const trendHost = document.querySelector<HTMLElement>("#trend-chart");
  const normalHost = document.querySelector<HTMLElement>("#normal-chart");
  const distributionHost = document.querySelector<HTMLElement>("#distribution-chart");
  const distributionKey = document.querySelector<HTMLElement>("#distribution-key");
  const offScaleHost = document.querySelector<HTMLElement>("#normal-off-scale");
  /* The only legend the histogram has, so it is rebuilt whenever the chart
   * is: the four lines mean the same thing whatever is in view, but the
   * three values they sit at follow the filters. It used to be written once,
   * which was right when the numbers lived in the SDK's own rail inside the
   * chart -- and that rail is what made two legends of one. */
  const renderDistributionKey = (stats: DistributionStats | null): void => {
    if (!distributionKey) return;
    distributionKey.replaceChildren(...distributionOverlayKey(stats).map((entry) => {
      const item = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = `overlay-key-line overlay-key-${entry.style}`;
      swatch.style.setProperty("--overlay-key-color", entry.color);
      const text = document.createElement("span");
      text.textContent = entry.label;
      item.append(swatch, text);
      return item;
    }));
  };
  renderDistributionKey(null);
  const spreadHost = document.querySelector<HTMLElement>("#spread-chart");
  const chartLimit = document.querySelector<HTMLSelectElement>("#chart-limit");
  const chartMeasure = document.querySelector<HTMLSelectElement>("#chart-measure");
  const chartRank = document.querySelector<HTMLSelectElement>("#chart-rank");
  const exportButton = document.querySelector<HTMLElement>("#download-overview-csv");
  if (!tbody || !search || !cadence || !sort || !reset || !status
      || !capacityHost || !watershedHost || !trendHost || !normalHost
      || !distributionHost || !spreadHost
      || !chartLimit || !chartMeasure || !chartRank
      || !lakePowell || !lakeMead || !exportButton) return;

  let exportRows: readonly Reservoir[] = [];
  exportButton.addEventListener("click", () => {
    downloadCsv(overviewCsv(exportRows), overviewCsvFilename(generatedAt));
  });

  /* Every chart host, so busy state and failure handling are written once.
   * Six hosts named individually in three places is five chances to add a
   * seventh chart and leave it announcing itself as loading forever. */
  const chartHosts = [capacityHost, watershedHost, trendHost, normalHost,
    distributionHost, spreadHost];

  /**
   * The distribution across the storage classes, drawn as one bar.
   *
   * Reads from `statewideRollup`, which has computed this since the port and
   * which the page has never shown -- so "is this a few empty reservoirs or
   * most of the state?" had no answer here. Each segment is a button: the
   * spread and the filter are the same control, which is what stops them
   * disagreeing.
   */
  const renderClassStrip = (visible: readonly Reservoir[]): void => {
    const host = document.querySelector<HTMLElement>("[data-classes]");
    if (!host) return;
    const rollup = rollupOfScoped(asScoped(visible));
    const total = rollup.classes.reduce((sum, entry) => sum + entry.count, 0);
    host.replaceChildren(...rollup.classes.map((entry, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "class-seg";
      button.dataset.class = String(index);
      // A class nobody is in still gets a sliver, so the scale stays legible
      // and the button stays clickable.
      button.style.flexGrow = String(Math.max(entry.count, total === 0 ? 1 : 0.12));
      button.style.background = entry.color;
      /* Counts sit on the data colour. The red and dark-blue ends need white
       * text; the three pale middle classes need dark text. Compute it from
       * the same fill rather than maintaining a second five-item table. */
      button.style.color = contrastingTextColor(entry.color);
      button.setAttribute("aria-pressed", String(storageClassFilter === index));
      button.setAttribute("aria-label",
        `${entry.label}: ${entry.count} of ${total} reservoirs`);
      const count = document.createElement("span");
      count.className = "class-seg-count";
      count.textContent = String(entry.count);
      button.append(count);
      button.addEventListener("click", () => {
        storageClassFilter = storageClassFilter === index ? null : index;
        void update();
      });
      return button;
    }));
    const chosen = storageClassFilter === null ? null : rollup.classes[storageClassFilter];
    host.setAttribute("data-chosen", chosen ? chosen.label : "");
  };

  /* Everything the address bar carries, read from the controls themselves
   * rather than from a parallel copy. One function, so the writer cannot go
   * stale as controls are added -- the map shell keeps `viewState` for the
   * same reason. */
  const currentUrlState = (): OverviewUrlState => ({
    query: search.value,
    drainageArea: chosenDrainage ?? "all",
    state: placeState(),
    /* Read for compatibility below; new picks use the one shared `area=`
     * parameter at every tier (ADR-084). */
    subregion: "all",
    county: placeCounty(),
    reporting: cadence.value as OverviewCadence,
    lakePowell: lakePowell.checked ? "include" : "exclude",
    lakeMead: lakeMead.checked ? "include" : "exclude",
    storageClass: storageClassFilter,
    sort: sort.value as OverviewSort,
    measure: chartMeasure.value as ChartMeasure,
    limit: Number(chartLimit.value),
    rank: chartRank.value as ChartRank
  });

  let revision = 0;
  const update = async (): Promise<void> => {
    const currentRevision = ++revision;
    /* One drainage axis at any of its three widths. Prefix matching is the
     * level contract: region, subregion and basin codes nest exactly. */
    const inChosenDrainage = (reservoir: Reservoir): boolean =>
      withinOpeningArea(reservoir.huc8 ?? reservoir.huc6, chosenDrainage);
    const scoped = overviewScope(allReservoirs, {
      lakePowell: lakePowell.checked ? "include" : "exclude",
      lakeMead: lakeMead.checked ? "include" : "exclude"
    }).filter(inChosenDrainage);

    const matching = filterOverview(scoped, {
      query: search.value,
      state: placeState(),
      huc4: "all",
      huc6: "all",
      county: placeCounty(),
      cadence: cadence.value as OverviewCadence
    });
    /* The strip narrows what is below it, but the strip itself keeps showing
     * the whole spread of the other filters -- otherwise choosing a class
     * would collapse the very chart that offers the choice. */
    const visible = storageClassFilter === null
      ? matching
      : matching.filter((reservoir) => classIndexOf(reservoir) === storageClassFilter);
    updateKpis(visible, period);
    /* The digest follows the scope, not the filters.
     *
     * That is the same line the map draws (ADR-011): a scope changes which
     * reservoirs exist, a filter changes which of them are picked out. A
     * digest that answered the search box would be describing a text query;
     * one that ignores the Lake Powell switch is worse, because Powell is
     * 25 of the region's 34 million acre-feet and "the measured reservoirs
     * lost 69,480 acre-feet" is very nearly a sentence about Powell alone.
     * Turning it off has to change the sentence, or the switch is decorative
     * on this card. */
    void renderWeekly(scoped);
    renderClassStrip(matching);
    exportRows = filterAndSort(visible, "", sort.value as OverviewSort);
    renderRows(tbody, exportRows, allReservoirs);
    const chosenClass = storageClassFilter === null
      ? "" : ` · ${STORAGE_CLASSES[storageClassFilter]?.label ?? ""}`;
    /* Both dominant reservoirs are named, whatever their state: a scope
     * that includes 28 million acre-feet without saying so is the silent
     * total ADR-011 and ADR-062 exist to prevent. */
    status.textContent = `${visible.length} of ${scoped.length} reservoirs shown · ` +
      `Every reservoir · Lake Powell ` +
      `${lakePowell.checked ? "included" : "excluded"} · Lake Mead ` +
      `${lakeMead.checked ? "included" : "excluded"}${chosenClass}`;
    for (const host of chartHosts) host.setAttribute("aria-busy", "true");
    const still = (): boolean => currentRevision === revision;
    const measure = chartMeasure.value as ChartMeasure;
    const limit = Number(chartLimit.value) || visible.length;
    const values = percentFullValues(visible);
    const normalPoints = normalComparison(visible);
    /* Before the charts, not after: the key is the histogram's only legend
     * now, so a reader watching a filter change should see the three values
     * move with the bars rather than a step behind them. */
    renderDistributionKey(distributionStats(values));
    /* The same rule, for the same reason: the scatter clips its ratio axis
     * at twice the usual level, and this is where the reservoirs above it
     * are named. Written from the same points the chart is drawn from, so
     * the sentence cannot describe a different set than the plot. */
    if (offScaleHost) {
      const note = offScaleNote(normalPoints);
      offScaleHost.replaceChildren();
      offScaleHost.hidden = note === null;
      if (note) {
        const lead = document.createElement("p");
        lead.textContent = note.lead;
        const list = document.createElement("ul");
        for (const item of note.items) {
          const entry = document.createElement("li");
          entry.textContent = item;
          list.append(entry);
        }
        offScaleHost.append(lead, list);
      }
    }
    try {
      await Promise.all([
        renderArcgisBarChart(capacityHost,
          largestReservoirRecords(visible, {
            limit, measure, rank: chartRank.value as ChartRank,
            labelAmong: allReservoirs
          }),
          measure === "storage"
            ? "Acre-feet stored by the largest reservoirs in the filtered view"
            : "Percent full for the largest reservoirs in the filtered view",
          still,
          {
            measure,
            categoryTitle: "Reservoir",
            /* The bar is a route into the map's own reservoir details. Its
             * label is already qualified against the complete roster, so
             * the public `?reservoir=` contract can resolve it exactly. */
            onSelect: (labels) => {
              const label = labels[0];
              if (label) window.location.assign(`./?reservoir=${encodeURIComponent(label)}`);
            }
          }),
        renderArcgisBarChart(watershedHost, watershedRecords(visible),
          "Combined percent full by drainage area in the filtered view", still, {
            categoryTitle: "Drainage area",
            onSelect: (labels) => {
              const chosen = watershedChoices.find((choice) => choice.label === labels[0]);
              chosenDrainage = chosen?.code ?? null;
              reflectDrainage();
              void update();
            }
          }),
        renderArcgisTrendChart(trendHost, monthlyTrend(visible),
          "Combined storage for the filtered reservoirs over the last twelve months",
          still, measure),
        renderArcgisNormalChart(normalHost, normalPoints,
          "Percent of the usual storage for this date against how large that usual "
          + "storage is, one point per reservoir",
          still),
        renderArcgisDistributionChart(distributionHost, values,
          "How many reservoirs fall in each of ten equal bands of percent full", still),
        Promise.resolve(renderSpread(spreadHost, spreadBoxes(values), {
          ariaLabel: "The spread of percent full within each drainage area, "
            + "driest first. Each row is a box for the middle half, a line at "
            + "the middle value, whiskers for the range and a dot for every "
            + "reservoir outside them."
        })).then((drawn) => {
          if (drawn === 0) {
            spreadHost.replaceChildren();
            const empty = document.createElement("p");
            empty.className = "chart-empty";
            empty.textContent = "Too few reservoirs in view to show a spread.";
            spreadHost.append(empty);
          }
          spreadHost.setAttribute("aria-busy", "false");
        })
      ]);
    } catch (error) {
      /* A chart that throws used to leave both hosts reporting `aria-busy`
       * with nothing in them and no readiness signal -- an empty box that
       * announces itself as still loading, forever. Say what happened and
       * stop claiming to be busy; the table below still has every value. */
      console.error("A chart could not be drawn:", error);
      if (currentRevision === revision) {
        for (const host of chartHosts) {
          host.setAttribute("aria-busy", "false");
          if (host.childElementCount === 0) {
            const failed = document.createElement("p");
            failed.className = "chart-empty";
            failed.setAttribute("role", "alert");
            failed.textContent =
              "This chart could not be drawn. The table below has the same values.";
            host.replaceChildren(failed);
          }
        }
      }
      return;
    }
    // Only the winning revision owns these: a superseded run clearing them
    // would report "not busy" while its successor is still drawing.
    if (currentRevision !== revision) return;
    for (const host of chartHosts) host.setAttribute("aria-busy", "false");
    /* The address bar last, once the view it describes is actually on
     * screen: written earlier it would advertise a state the page was still
     * drawing, and a reader who copied it mid-render would send a link to
     * something they had not seen yet. */
    writeOverviewUrl(currentUrlState());
    /* The write is a `replaceState`; there is no navigation to re-render the
     * bar, so its links are brought up to date here or not at all. */
    updatePageLinks(window.location.search);
    window.__overviewReady = {
      reservoirs: scoped.length,
      visible: visible.length,
      charts: chartHosts.length,
      lakePowellExcluded: !visible.some(isLakePowell),
      lakeMeadExcluded: !visible.some(isLakeMead)
    };
  };
  /* The Where menu is deliberately absent: its own pick handler calls
   * `update`, because a pick also has to move the two held axes before any
   * read of them means anything. */
  for (const control of [search, sort,
    lakePowell, lakeMead, chartLimit, chartMeasure, chartRank]) {
    const event = control instanceof HTMLSelectElement
      || (control instanceof HTMLInputElement && control.type === "checkbox")
      ? "change"
      : "input";
    control.addEventListener(event, () => void update());
  }
  cadence.addEventListener("calciteSelectChange", () => void update());
  /* Each chart reads the page's Calcite colours once, when it is built --
   * they are baked into the SDK's own chart config, not CSS the cascade can
   * re-theme on its own. Without this, flipping the theme toggle after the
   * charts have drawn leaves them in whichever theme was active at the time,
   * while the rest of the page has already moved on. */
  document.addEventListener(THEME_CHANGE_EVENT, () => void update());
  reset.addEventListener("click", () => {
    search.value = "";
    chosenDrainage = null;
    chosenState = "all";
    chosenCounty = "all";
    reflectPlace();
    reflectDrainage();
    cadence.value = "all";
    sort.value = "capacity";
    /* Both large reservoirs back in, matching what the page opens on.
     * Resetting them off would make "reset" a filter of its own. */
    lakePowell.checked = true;
    lakeMead.checked = true;
    chartLimit.value = "15";
    chartMeasure.value = "percent";
    chartRank.value = "capacity";
    storageClassFilter = null;
    void update();
    search.focus();
  });

  /* Restore the whole view a link describes before the first draw, so the
   * page renders once into the state it was asked for rather than drawing
   * the default and then redrawing. Six charts make that difference
   * visible. A drainage area the current scope does not contain falls back
   * to every area, which is why this runs after the options are filled. */
  const wanted = overviewStateFromSearch(window.location.search);
  search.value = wanted.query;
  /* A county in the link that this payload does not carry falls back to all,
   * the same way a drainage area does. A shared link outliving the roster it
   * was made from should show everything rather than nothing. Both axes are
   * restored -- the link carries two parameters and the page honours two --
   * and the menu shows whichever is finer. */
  chosenCounty = countyChoices.some((choice) => choice.code === wanted.county)
    ? wanted.county : "all";
  chosenState = stateChoices.some((choice) => choice.code === wanted.state)
    ? wanted.state : "all";
  /* `?area=` is the shared spelling. `?huc4=` remains a readable legacy
   * spelling and is canonicalised to the same menu row on the next URL
   * write. When both are present, `?area=` wins because it is the axis the
   * merged menu owns. */
  const wantedDrainage = openingScope.selection.area
    ?? (wanted.drainageArea !== "all" ? wanted.drainageArea : null)
    ?? (wanted.subregion !== "all" ? wanted.subregion : null);
  chosenDrainage = wantedDrainage !== null
    && [2, 4, 6].includes(wantedDrainage.length)
    && drainageHasReservoir(wantedDrainage, chosenState)
    ? wantedDrainage : null;
  reflectPlace();
  reflectDrainage();
  cadence.value = wanted.reporting;
  lakePowell.checked = wanted.lakePowell === "include";
  lakeMead.checked = wanted.lakeMead === "include";
  sort.value = wanted.sort;
  chartMeasure.value = wanted.measure;
  chartRank.value = wanted.rank;
  /* Only a limit the control actually offers. A link asking for the top 7
   * would otherwise leave the select showing nothing at all. */
  chartLimit.value = [...chartLimit.options].some((option) =>
    Number(option.value) === wanted.limit) ? String(wanted.limit) : "15";
  storageClassFilter = wanted.storageClass !== null
    && wanted.storageClass < STORAGE_CLASSES.length ? wanted.storageClass : null;

  await update();
}

/**
 * The weekly digest.
 *
 * Rendered after the page's own charts, from two extra fetches this page can
 * do without: the snow payload is 1.9 MB and the drought coverage is a
 * separate weekly file, and neither should delay the charts a reader came
 * for. Each section degrades on its own -- a failed snow fetch costs the snow
 * paragraph and nothing else -- which is why the model takes them as
 * nullable rather than requiring all three.
 */
/*
 * The two extra payloads, fetched once.
 *
 * The digest is redrawn whenever the reader changes the scope, and the snow
 * file is 1.9 MB. Refetching it to answer "what if Lake Powell were not
 * counted" would be a megabyte of network for a question about sixty-eight
 * other reservoirs.
 */
let weeklyContext: Promise<[SnowpackPayload | null, DroughtCoveragePayload | null]>
  | null = null;

function weeklyPayloads(): Promise<[SnowpackPayload | null, DroughtCoveragePayload | null]> {
  weeklyContext ??= Promise.all([
    loadSnowpack().catch((error: unknown) => {
      console.warn("The weekly summary has no snow measurements:", error);
      return null;
    }),
    loadDroughtCoverage().catch((error: unknown) => {
      console.warn("The weekly summary has no drought coverage:", error);
      return null;
    })
  ]);
  return weeklyContext;
}

async function renderWeekly(reservoirs: readonly Reservoir[]): Promise<void> {
  const card = document.querySelector<HTMLElement>("#weekly-summary");
  const host = card?.querySelector<HTMLElement>(".weekly-sections");
  if (!card || !host) return;

  const [snow, drought] = await weeklyPayloads();

  /* Which reservoirs these figures are about, in the card rather than only in
   * the controls that set it. A reader who arrives at the digest first should
   * not have to look elsewhere to find out what "the measured reservoirs"
   * means this time. */
  const scopeLine = document.querySelector<HTMLElement>('[data-weekly="scope"]');
  if (scopeLine) {
    /* Both dominant reservoirs, whatever their state. Read from the rows the
     * digest was handed rather than from the controls, so the sentence
     * describes the figures beside it even if the two ever disagree. Powell
     * is 25 million acre-feet and Mead 28, against about 34 for everything
     * else on the roster put together: a digest that names one and stays
     * quiet about the other invites the reader to assume it is in there
     * (ADR-011, ADR-062). */
    const hasPowell = reservoirs.some(isLakePowell);
    const hasMead = reservoirs.some(isLakeMead);
    scopeLine.textContent =
      `Storage covers ${reservoirs.length} reservoirs, Lake Powell ` +
      `${hasPowell ? "included" : "excluded"}, Lake Mead ` +
      `${hasMead ? "included" : "excluded"}.`;
  }

  const sections = describeWeek(weeklySummary(reservoirs, snow, drought));
  host.replaceChildren(...sections.map((section) => {
    const block = document.createElement("section");
    block.className = "weekly-section";
    const heading = document.createElement("h3");
    heading.textContent = section.heading;
    block.append(heading);
    for (const line of section.lines) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      block.append(paragraph);
    }
    return block;
  }));
  card.setAttribute("aria-busy", "false");

  window.__overviewReady = {
    ...(window.__overviewReady ?? {}),
    weeklySections: sections.length,
    weeklyLines: sections.reduce((sum, section) => sum + section.lines.length, 0)
  } as NonNullable<typeof window.__overviewReady>;
}


try {
  const openingSelection = openingSelectionFromSearch(window.location.search);
  /* The reference export is a second fetch this page otherwise has no reason
   * to make, so it is skipped entirely when the address bar asks for nothing
   * -- an ordinary visit to overview.html pays for it exactly as often as it
   * needs the answer. Requested alongside the reservoir payload rather than
   * after it: the two are independent, and every chart below has to wait for
   * the opening scope to resolve before the first one is built (never built
   * against everything and then rebuilt once a filter arrives), so the two
   * fetches racing rather than queuing is what keeps that wait to one round
   * trip rather than two. A failed roster fetch is not fatal to the page:
   * `resolveOpeningScope` against an empty roster drops a dead `area` to
   * `null` and leaves `state` exactly as asked (it never resets), so a
   * reader loses only the area half of the opening scope, not the page. */
  const [payload, openingRosters] = await Promise.all([
    loadReservoirs(),
    isOpeningScopeChosen(openingSelection)
      ? loadOpeningRosters().catch((error: unknown) => {
        console.warn("The opening scope's drainage-area roster did not load:", error);
        return EMPTY_OPENING_ROSTERS;
      })
      : Promise.resolve(EMPTY_OPENING_ROSTERS)
  ]);
  const openingScope = resolveOpeningScope(openingSelection, openingRosters);
  const choices = baselineChoices(payload);
  const preferred = payload.default_baseline ?? "recent";
  await renderOverview(payload.reservoirs, payload.generated_at,
    payload.watersheds?.regions ?? [],
    payload.watersheds?.subregions ?? [],
    payload.watersheds?.subbasins ?? [], openingScope, openingRosters, {
      id: choices.some((choice) => choice.id === preferred) ? preferred : "recent",
      choices,
      minimumYears: payload.climate_normals?.minimum_years ?? 0
    });
} catch (error) {
  console.error("Reservoir overview failed:", error);
  const content = document.querySelector<HTMLElement>("#overview-content");
  if (content) content.innerHTML = `<div class="overview-error" role="alert"><strong>The reservoir dashboard could not load.</strong><p>Try again later or return to the map.</p></div>`;
}
