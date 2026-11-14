import "@esri/calcite-components/main.css";
import { setAssetPath as setCalciteAssetPath } from "@esri/calcite-components";
import "@esri/calcite-components/components/calcite-action";
import "@esri/calcite-components/components/calcite-navigation";

import {
  DROUGHT_GROUPS,
  ELEVATION_HISTORY_GROUPS,
  LAKE_GROUPS,
  PRECIPITATION_GROUPS,
  PRECIPITATION_HISTORY_GROUPS,
  SNOW_HISTORY_GROUPS,
  REFERENCE_GROUPS,
  RESERVOIR_GROUPS,
  RIVER_GROUPS,
  RIVER_HISTORY_GROUPS,
  SNOW_GROUPS,
  SOIL_GROUPS,
  SOIL_HISTORY_GROUPS,
  type ApiFieldGroup
} from "./data-docs-schema";
import { brandMarkup, pageLinksMarkup } from "./ui/page-header";
import { setupPlaceChooser } from "./ui/opening-splash";
import { setupPlaceSearch } from "./ui/place-search";
import { wireTheme } from "./ui/theme";
import "./styles/data-docs.css";

setCalciteAssetPath(new URL(/* @vite-ignore */ "../", import.meta.url).href);
const root = document.querySelector<HTMLElement>("#data-docs-app");
if (!root) throw new Error("Missing #data-docs-app root");

const base = "https://buschbrian.github.io/western-water-dashboard/api";

root.innerHTML = `
  <calcite-navigation class="methods-nav" aria-label="Primary navigation">
    ${brandMarkup(2, "data")}
    ${pageLinksMarkup("data", window.location.search)}
    <calcite-action id="theme-toggle" slot="content-end" text="Theme: system"
      icon="brightness" label="Change color theme"></calcite-action>
  </calcite-navigation>
  <main class="methods-main api-main">
    <header class="methods-intro">
      <p class="eyebrow">Public data API</p>
      <h1>Use the published dashboard data</h1>
      <p class="methods-lede">These JSON files are the same checked files the dashboard
        reads. The stable API paths are copies made during the site build, not separate
        datasets.</p>
      <p><a href="./reporters.html">For reporters</a>: help with quoting figures and publishing charts.</p>
    </header>

    <nav class="methods-toc" aria-label="On this page">
      <ul>
        <li><a href="#files">Published files</a></li>
        <li><a href="#reservoir-fields">Reservoir fields</a></li>
        <li><a href="#elevation-fields">Reservoir level history fields</a></li>
        <li><a href="#lake-fields">Terminal lake fields</a></li>
        <li><a href="#river-fields">River flow fields</a></li>
        <li><a href="#river-history-fields">River flow history fields</a></li>
        <li><a href="#snow-fields">Snow fields</a></li>
        <li><a href="#precipitation-fields">Precipitation fields</a></li>
        <li><a href="#precipitation-history-fields">Precipitation history fields</a></li>
        <li><a href="#snow-history-fields">Snow water history fields</a></li>
        <li><a href="#soil-fields">Soil moisture fields</a></li>
        <li><a href="#soil-history-fields">Soil moisture history fields</a></li>
        <li><a href="#drought-fields">Drought fields</a></li>
        <li><a href="#reference-fields">Reference fields</a></li>
        <li><a href="#examples">Examples</a></li>
        <li><a href="#access">Browser access and terms</a></li>
      </ul>
    </nav>

    <section class="methods-section" id="files" aria-labelledby="files-heading">
      <h2 id="files-heading">Published files</h2>
      <article class="api-file">
        <h3>Reservoir storage</h3>
        <p><a href="./api/reservoirs.json"><code>/api/reservoirs.json</code></a></p>
        <p>Current storage, changes, weekly comparisons, 12-month histories, provider
          details and drainage-area assignments. Structure version 1. Refreshed each
          morning. If one provider request fails, the last good reservoir record stays in
          the file and is marked as late data. A broadly failed run does not replace the
          last published file. Shown on the <a href="./">storage map</a>.</p>
        <p>The storage map's table downloads also include each reservoir's comparison
          with normal for the period you choose. The CSV adds
          <code>Compared with normal (percent)</code> and <code>Normal period</code>.
          The GeoJSON names them <code>percent_of_normal</code> and
          <code>normal_period</code>. A missing comparison is empty in the CSV and
          <code>null</code> in the GeoJSON. A past month's row has neither value.</p>
      </article>
      <article class="api-file">
        <h3>Weekly figures and feeds</h3>
        <p><a href="./weekly.html">Saved weekly summaries</a> keep the storage, mountain snow
          and drought figures as they were when captured. Each summary states its dates,
          reporting coverage and sources. A source revision does not rewrite an earlier summary.</p>
        <p>Subscribe with the <a href="./feed.xml">Atom feed</a> or
          <a href="./feed.json">JSON feed</a>. The feeds hold the latest 52 weekly entries;
          older summaries keep their pages. Each page has a picture and a caption to copy.</p>
      </article>
      <article class="api-file">
        <h3>Reservoir level history</h3>
        <p><a href="./api/elevation_history.json"><code>/api/elevation_history.json</code></a></p>
        <p>The daily surface level, in feet, of each reservoir whose level datum has been
          reviewed, from the Bureau of Reclamation's first reading. Each entry names its
          datum. The reservoir file carries the summary of the same level in each
          record's <code>elevation</code> block; this file carries every day. Structure
          version 1. Refreshed each morning with the reservoirs. If a level request fails,
          the last good entry stays. The Bureau of Reclamation can revise a past level, and
          each refresh then replaces it. Shown on the
          <a href="./reservoir.html?name=Lake%20Powell">Lake Powell</a> and
          <a href="./reservoir.html?name=Lake%20Mead">Lake Mead</a> pages.</p>
        <p>Example, shortened to three days:</p>
        <pre tabindex="0" role="region" aria-label="Reservoir level history example, scrolls sideways"><code>{"name": "Lake Mead", "vertical_datum": "project",
 "start": "2026-10-28", "end": "2026-10-30",
 "values": [1038.38, 1038.51, 1038.66]}</code></pre>
      </article>
      <article class="api-file">
        <h3>Terminal lakes</h3>
        <p><a href="./api/lakes.json"><code>/api/lakes.json</code></a></p>
        <p>Natural lakes with no outlet and no dam. Each record carries the surface
          level above a named datum. Volume uses a reviewed published table, or is null.
          Parts measured apart are listed in <code>arms</code>. Each arm has its own
          station, point and level. Such a lake has no level of its own.
          Changes, record readings and history rank are
          included. No full level and no percent full, because none is defined for a
          terminal lake. A target is a named level with its authority and decision,
          never a share. Structure version 2.
          Refreshed each morning, separately from the reservoirs, and never added to a
          reservoir total. Shown on the <a href="./lakes.html">terminal lakes page</a>.</p>
      </article>
      <article class="api-file">
        <h3>River flow</h3>
        <p><a href="./api/rivers.json"><code>/api/rivers.json</code></a></p>
        <p>Daily mean flow in cubic feet per second at a small reviewed set of U.S.
          Geological Survey gauges. Each gauge carries its last 30 days. Each day has the
          survey's review status and qualifiers. A gauge also carries the change from 7
          days earlier, and the survey's own station name and page. Refreshed each morning;
          every refresh reads the last 90 days again, so a revised provisional value
          replaces the earlier one. Where dams upstream store and release water, a gauge
          has no comparison with normal and no rank. Where little or no water is stored
          upstream, the newest value is compared with the U.S. Geological Survey's
          percentiles for the same date: the 10th, 25th, 50th, 75th and 90th of the
          approved daily values, from more than 10 years. Where a date has fewer than 30
          years, the record says so. Structure version 3. The file has
          no total across gauges,
          because one gauge can measure water that another measured upstream, and no gauge
          is a reservoir's inflow. Shown on the <a href="./rivers.html">river flow page</a>,
          which also offers the values as a CSV file.</p>
        <p>Example day, from a gauge record's <code>daily</code> list:</p>
        <pre tabindex="0" role="region" aria-label="River flow example, scrolls sideways"><code>{"date": "2026-10-30", "cfs": 101.0, "approval": "Provisional", "qualifiers": []}</code></pre>
      </article>
      <article class="api-file">
        <h3>Storage and reservoir flow histories</h3>
        <p><a href="./data/storage-history/index.json">Storage history index</a> names each station's
          finished-year file. <a href="./data/storage-history/current.json">Current water year</a>
          holds the daily observations from October 1. Each station carries its name, source,
          reporting interval, <code>start</code>, <code>end</code> and <code>values</code>.
          Position zero is the start date, each following position is the next day, and null is
          no reading. Values are acre-feet. Monthly feeds keep the days between readings empty.
          Earlier records are backfilled from each provider where available; a missing station in
          the index has no published history yet. These files do not change the normal or full level.</p>
        <p><a href="./api/reservoir_flow_history.json">Reservoir flow history</a> uses the same dated
          list for each station's <code>inflow</code> and <code>release</code>, in cubic feet per second.
          It starts with the first run's 90-day window and grows daily. Each series carries the
          Reclamation item, definition and source. Lake Mead has no daily inflow item; a river
          gauge is never substituted. A provider correction replaces its date, and a date the
          provider leaves out stays as stored.</p>
      </article>
      <article class="api-file">
        <h3>River flow history</h3>
        <p><a href="./api/river_history.json"><code>/api/river_history.json</code></a></p>
        <p>Every day of mean flow this site has read at each river gauge, in cubic feet per
          second. The river flow file keeps only 30 days. This file keeps all of them. Each
          gauge has one list of flows, one list of review statuses and one list of
          qualifiers, from the gauge's <code>start</code> date. A natural gauge also has the
          flow class of each day. The class compares the flow with the U.S. Geological Survey's
          percentiles of approved daily values for the same date. The percentiles are not
          published, so the class is kept here. Structure version 1. Refreshed each morning
          with the river flow file. Each refresh replaces the 30 newest days, so a revised
          value replaces the earlier one. A day the survey does not report stays as stored.
          This site deletes no day. No page shows this file yet.</p>
        <p>Example, shortened to three days:</p>
        <pre tabindex="0" role="region" aria-label="River flow history example, scrolls sideways"><code>{"name": "Blacks Fork near Robertson", "source_station_id": "09217900",
 "tier": "natural", "start": "2026-10-28", "end": "2026-10-30",
 "cfs": [116.0, 110.0, 101.0],
 "approval": ["Provisional", "Provisional", "Provisional"],
 "qualifiers": [[], [], []],
 "flow_class": ["much_above_normal", "much_above_normal", "much_above_normal"]}</code></pre>
      </article>
      <article class="api-file">
        <h3>Snow monitoring</h3>
        <p><a href="./api/snowpack.json"><code>/api/snowpack.json</code></a></p>
        <p>Daily site readings and drainage-area summaries for the current water year,
          compared with the 1991–2020 standard climate period, with each site's usual
          season timing. Structure version 1. Refreshed independently each morning. An
          incomplete provider response does not replace the last complete file. Shown on
          the <a href="./snow.html">snowpack page</a>.</p>
        <p>Each finished season is kept, unchanged, at
          <a href="./data/snow/snowpack-wy2026.json"><code>/data/snow/snowpack-wy2026.json</code></a>,
          named for the water year it ends in. It is the file as it was published on the
          season's last day, with the same fields as the current file. The first refresh
          of each October adds the season that ended, and no file is changed after that.</p>
      </article>
      <article class="api-file">
        <h3>Precipitation at mountain stations</h3>
        <p><a href="./data/precipitation.json"><code>/data/precipitation.json</code></a></p>
        <p>Rain and snow caught at the mountain stations, in inches accumulated since 1 October.
          Refreshed each morning. Structure version 1. The station codes match the snow file.
          Each station's quoted <code>series_days</code> indexes the file's dates.
          Its quoted <code>series_values</code> gives accumulated inches at those dates.
          Missing days have no entry. These are station measurements, not averages over all land in a drainage area.</p>
        <p>For a recent total, subtract a station's earlier accumulation from its later accumulation.
          The page uses stations with both readings and leaves falling totals out.
          The <a href="./precipitation.html">precipitation page</a> shows these recent totals and the season.</p>
      </article>
      <article class="api-file">
        <h3>Precipitation history</h3>
        <p><a href="./data/precipitation_history.json"><code>/data/precipitation_history.json</code></a></p>
        <p>Accumulated precipitation from 1991 through the last finished water year, at 53 calendar steps per year.
          Rebuilt each October, with the date checked in the file. Structure version 1.
          A station must cover every year and step to enter the page's fixed comparison set.</p>
        <p>The stored values are integers in tenths of an inch. In each year, the first is the accumulated reading.
          Each later integer is the change from the preceding step. Add them in order, then divide by ten for inches.
          For example, <code>[0, 3, 2]</code> decodes to <code>[0, 0.3, 0.5]</code> inches.
          A negative change stays as reported.</p>
        <p>A historical step may use a reading up to three days earlier, within the same water year.
          The file counts these steps. The chart reads straight lines between steps and compares the same station set in every year.
          The snow comparison uses 1991 through 2020; this precipitation history includes every finished year since 1991.</p>
      </article>
      <article class="api-file">
        <h3>Snow water history</h3>
        <p><a href="./data/snow_history.json"><code>/data/snow_history.json</code></a></p>
        <p>Snow water equivalent from 1991 through the last finished water year, on the same 53 calendar steps
          as the precipitation history. It is the water in the snow on the ground on each date. It is not snowfall.
          Rebuilt each October, with the date checked in the file. Structure version 1.
          A station must cover every year and step to enter the snow page's fixed comparison set.</p>
        <p>The stored values are integers in tenths of an inch, in the same encoding. The first is the reading,
          and each later integer is the change from the preceding step. A change is negative when snow melts.
          A reading below zero is not used, so no decoded value is below zero.</p>
        <p>A historical step may use a reading up to three days earlier, within the same water year.
          The <a href="./snow.html">snow page</a> compares this season with these years at the same stations.
          Its percent of normal still uses 1991 through 2020.</p>
      </article>
      <article class="api-file">
        <h3>Soil moisture</h3>
        <p><a href="./data/soil_moisture.json"><code>/data/soil_moisture.json</code></a></p>
        <p>Soil moisture at the snow monitoring sites for the last fifteen days, in percent
          of the soil's volume. Each site's change over 7 days, in percentage points.
          A site's value is the mean of its 2 in (or 4 in), 8 in and 20 in sensors. A
          reading is not used on a day the soil at that depth is frozen. No median and no
          comparison with normal. Structure version 1. Refreshed independently each
          morning. A failed refresh does not replace the last complete file. Shown on the
          <a href="./precipitation.html">precipitation page</a>.</p>
        <p>Example station, shortened:</p>
        <pre tabindex="0" role="region" aria-label="Soil moisture example, scrolls sideways"><code>{"station": "1030:CO:SNTL", "depths_inches": [2, 8, 20],
 "end_percent": 21.7, "start_percent": 18.0, "change_points": 3.7}</code></pre>
      </article>
      <article class="api-file">
        <h3>Soil moisture history</h3>
        <p><a href="./api/soil_moisture_history.json"><code>/api/soil_moisture_history.json</code></a></p>
        <p>For each refresh date, the week's change in soil moisture that this site published
          for each drainage area, in percentage points. Each entry also gives the stations
          behind the figure and the stations in the area. The first date is the first refresh
          after this file began. This site does not rebuild earlier dates. Structure version 1.
          Refreshed each morning with the soil moisture file. A second refresh on the same date
          replaces that date. This site deletes no date. No page shows this file yet.</p>
        <p>Example, shortened to one date:</p>
        <pre tabindex="0" role="region" aria-label="Soil moisture history example, scrolls sideways"><code>{"start": "2026-10-31", "end": "2026-10-31", "end_date": ["2026-10-30"],
 "areas": [{"huc6": "140100", "huc6_name": "Colorado Headwaters",
  "site_count": [17], "measured_site_count": [13],
  "mean_change_points": [-0.2]}]}</code></pre>
      </article>
      <article class="api-file">
        <h3>Drought coverage by drainage area</h3>
        <p><a href="./data/drought/usdm-huc6.json"><code>/data/drought/usdm-huc6.json</code></a></p>
        <p>The share of each drainage area's land in each U.S. Drought Monitor class,
          calculated from the monitor's weekly national polygons, with the map week and
          release date. Structure version 1. Updated when the weekly polygons are
          downloaded. Shown on the <a href="./drought.html">drought page</a>. The
          national polygons the shares are calculated from are published beside it at
          <a href="./data/drought/usdm-current.geojson"><code>/data/drought/usdm-current.geojson</code></a>.</p>
        <p>The same measurement is also published for
          <a href="./data/drought/usdm-huc2.json">regions</a>,
          <a href="./data/drought/usdm-huc4.json">subregions</a>, and
          <a href="./data/drought/usdm-huc8.json">subbasins</a>.
          Every file states its own <code>level</code>. Each area carries its
          code under the attribute that level names.</p>
        <p>Ten years of weeks are kept for
          <a href="./data/drought/usdm-huc2-history.json">regions</a>,
          <a href="./data/drought/usdm-huc4-history.json">subregions</a>, and
          <a href="./data/drought/usdm-huc6-history.json">basins</a>: each week's
          <code>percent_of_area_at_least</code> for every area, oldest first. Every
          week, in these files and in the weekly files above, is measured from the
          monitor's full-resolution archived map of that week. The weeks before
          August 2026 were measured after the fact and have a
          <code>release_date</code> of null, because the archive does not give
          one. The <code>backfill</code> block names any week the archive could
          not supply.</p>
      </article>
      <article class="api-file">
        <h3>Capacity and geography reference</h3>
        <p><a href="./api/reference.json"><code>/api/reference.json</code></a></p>
        <p>Reviewed full levels, dam-point evidence and named
          drainage-area scopes. Structure version 1. Updated when reviewed source data
          changes, not on the daily observation schedule. If a source cannot be checked,
          the last published reference file remains available.</p>
      </article>
      <article class="api-file">
        <h3>Upstream sets</h3>
        <p><a href="./data/upstream_index.json"><code>/data/upstream_index.json</code></a></p>
        <p>For each reservoir, the published reservoirs and snow-measuring sites whose
          points sit on land that drains to it. Traced once against the U.S. Geological
          Survey's Network-Linked Data Index, keyed by the same station identifier the
          storage payload uses.</p>
        <p>An upstream set names the water on land above a dam. It is not an operations
          claim, so it says "upstream of" and never "feeds". Rebuilt after the roster
          changes, not daily.
          Shown in the storage map's details panel and on each
          <a href="./reservoir.html">reservoir page</a>.</p>
      </article>
    </section>

    <section class="methods-section api-fields" id="reservoir-fields"
      aria-labelledby="reservoir-fields-heading">
      <h2 id="reservoir-fields-heading">Reservoir fields</h2>
    </section>
    <section class="methods-section api-fields" id="elevation-fields"
      aria-labelledby="elevation-fields-heading">
      <h2 id="elevation-fields-heading">Reservoir level history fields</h2>
    </section>
    <section class="methods-section api-fields" id="lake-fields"
      aria-labelledby="lake-fields-heading">
      <h2 id="lake-fields-heading">Terminal lake fields</h2>
    </section>
    <section class="methods-section api-fields" id="river-fields"
      aria-labelledby="river-fields-heading">
      <h2 id="river-fields-heading">River flow fields</h2>
    </section>
    <section class="methods-section api-fields" id="river-history-fields"
      aria-labelledby="river-history-fields-heading">
      <h2 id="river-history-fields-heading">River flow history fields</h2>
    </section>
    <section class="methods-section api-fields" id="snow-fields"
      aria-labelledby="snow-fields-heading">
      <h2 id="snow-fields-heading">Snow fields</h2>
    </section>
    <section class="methods-section api-fields" id="precipitation-fields" aria-labelledby="precipitation-fields-heading">
      <h2 id="precipitation-fields-heading">Precipitation fields</h2>
    </section>
    <section class="methods-section api-fields" id="precipitation-history-fields" aria-labelledby="precipitation-history-fields-heading">
      <h2 id="precipitation-history-fields-heading">Precipitation history fields</h2>
    </section>
    <section class="methods-section api-fields" id="snow-history-fields" aria-labelledby="snow-history-fields-heading">
      <h2 id="snow-history-fields-heading">Snow water history fields</h2>
    </section>
    <section class="methods-section api-fields" id="soil-fields"
      aria-labelledby="soil-fields-heading">
      <h2 id="soil-fields-heading">Soil moisture fields</h2>
    </section>
    <section class="methods-section api-fields" id="soil-history-fields"
      aria-labelledby="soil-history-fields-heading">
      <h2 id="soil-history-fields-heading">Soil moisture history fields</h2>
    </section>
    <section class="methods-section api-fields" id="drought-fields"
      aria-labelledby="drought-fields-heading">
      <h2 id="drought-fields-heading">Drought fields</h2>
    </section>
    <section class="methods-section api-fields" id="reference-fields"
      aria-labelledby="reference-fields-heading">
      <h2 id="reference-fields-heading">Reference fields</h2>
      <p>Boundary collections follow GeoJSON. Coordinate pairs are longitude, latitude in
        decimal degrees.</p>
    </section>

    <section class="methods-section" id="examples" aria-labelledby="examples-heading">
      <h2 id="examples-heading">Examples</h2>
      <h3>Browser JavaScript</h3>
      <!-- A code block that scrolls needs a keyboard path to scroll it, and
           a name for what the reader has just tabbed into. Same treatment the
           sideways-scrolling tables get. -->
      <pre tabindex="0" role="region" aria-label="Browser JavaScript example, scrolls sideways"><code>const response = await fetch("${base}/reservoirs.json");
if (!response.ok) throw new Error(&#96;Request failed: \${response.status}&#96;);
const data = await response.json();
console.log(data.reservoirs);</code></pre>
      <h3>Python</h3>
      <pre tabindex="0" role="region" aria-label="Python example, scrolls sideways"><code>import requests

response = requests.get("${base}/reservoirs.json", timeout=30)
response.raise_for_status()
data = response.json()
print(data["reservoirs"])</code></pre>
    </section>

    <section class="methods-section" id="access" aria-labelledby="access-heading">
      <h2 id="access-heading">Browser access and terms</h2>
      <p>GitHub Pages returned <code>Access-Control-Allow-Origin: *</code> for the
        published files when checked on August 14, 2026. Every file here comes from the
        same site in the same way. A browser application on another origin can
        fetch them directly. Responses can be cached for up to 10 minutes, so a newly
        published file may not appear at every edge immediately.</p>
      <ul class="methods-plain">
        <li>This site republishes public data from the agencies named in each file.</li>
        <li>Values are provisional and their publisher can revise them.</li>
        <li>There is no uptime guarantee or service-level agreement.</li>
        <li>Consumers should check the structure version and tolerate null values.</li>
      </ul>
    </section>
  </main>`;

function renderGroups(hostId: string, groups: readonly ApiFieldGroup[]): void {
  const host = document.querySelector<HTMLElement>(`#${hostId}`);
  if (!host) return;
  for (const group of groups) {
    const section = document.createElement("section");
    section.className = "api-field-group";
    const heading = document.createElement("h3");
    heading.textContent = group.title;
    const path = document.createElement("p");
    path.className = "api-path";
    const code = document.createElement("code");
    code.textContent = group.path;
    path.append("Path: ", code);

    const wrapper = document.createElement("div");
    wrapper.className = "api-table-scroll";
    /* These only become scrollable at narrow widths, which is why the
     * desktop accessibility pass never saw them and the 390px one did: a
     * region a mouse can scroll and a keyboard cannot is still a trap, it is
     * just a trap that only appears on a phone. Named after the group, so
     * tabbing into one says which table it is. */
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", `${group.title} fields, scrolls sideways`);
    const table = document.createElement("table");
    table.className = "api-table";
    table.innerHTML = "<thead><tr><th>Field</th><th>Units or type</th><th>Meaning</th></tr></thead>";
    const body = document.createElement("tbody");
    for (const field of group.fields) {
      const row = document.createElement("tr");
      const name = document.createElement("th");
      name.scope = "row";
      const fieldCode = document.createElement("code");
      fieldCode.textContent = field.key;
      name.append(fieldCode);
      const units = document.createElement("td");
      units.textContent = field.units;
      const meaning = document.createElement("td");
      meaning.textContent = `${field.meaning}${field.optional ? " This field appears only when needed." : ""}`;
      row.append(name, units, meaning);
      body.append(row);
    }
    table.append(body);
    wrapper.append(table);
    section.append(heading, path, wrapper);
    host.append(section);
  }
}

renderGroups("reservoir-fields", RESERVOIR_GROUPS);
renderGroups("elevation-fields", ELEVATION_HISTORY_GROUPS);
renderGroups("lake-fields", LAKE_GROUPS);
renderGroups("river-fields", RIVER_GROUPS);
renderGroups("river-history-fields", RIVER_HISTORY_GROUPS);
renderGroups("snow-fields", SNOW_GROUPS);
renderGroups("precipitation-fields", PRECIPITATION_GROUPS);
renderGroups("precipitation-history-fields", PRECIPITATION_HISTORY_GROUPS);
renderGroups("snow-history-fields", SNOW_HISTORY_GROUPS);
renderGroups("soil-fields", SOIL_GROUPS);
renderGroups("soil-history-fields", SOIL_HISTORY_GROUPS);
renderGroups("drought-fields", DROUGHT_GROUPS);
renderGroups("reference-fields", REFERENCE_GROUPS);
wireTheme();
void setupPlaceChooser();
setupPlaceSearch("data");

window.__dataDocsReady = {
  files: document.querySelectorAll(".api-file").length,
  groups: RESERVOIR_GROUPS.length + ELEVATION_HISTORY_GROUPS.length
    + LAKE_GROUPS.length + RIVER_GROUPS.length + SNOW_GROUPS.length + SOIL_GROUPS.length
    + RIVER_HISTORY_GROUPS.length + SOIL_HISTORY_GROUPS.length
    + PRECIPITATION_GROUPS.length + PRECIPITATION_HISTORY_GROUPS.length + SNOW_HISTORY_GROUPS.length
    + DROUGHT_GROUPS.length + REFERENCE_GROUPS.length
};
