# Changelog

Notable changes to the dashboard. The data itself is refreshed every morning
and is not listed here.

The format is [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
version numbers are [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
A version names the application and its published data contracts. The payloads
carry their own `schema_version`, and the seasonal estimator carries its own
`METHOD_VERSION`; neither follows this number.

## [Unreleased]

### Added

- **A page for reporters.** `reporters.html` says how to cite a figure (the
  provider first, then this site, with the reading date and a link to the page
  that shows it), what the main figures mean, and what they cannot support: no
  forecasts, operated reservoirs, a history rank that starts in 2015, and
  provisional readings. It is words only, like the terms page: no script and no
  new computation. The reservoir, terminal lakes, terms and landscape pages
  link to it from their footers.
- **River flow and the soil-moisture change kept day by day** (ADR-146).
  `river_history.json` keeps every day of mean flow at each gauge, with its
  review status, qualifiers and, at a natural gauge, its flow class.
  `soil_moisture_history.json` keeps the week's change published for each
  drainage area on each refresh date. Both are published under `api/` and
  `data/`, and merge by date: a revised river value replaces its day.
  The data reference now documents both, with an example record for each, and
  completes the river flow, soil moisture and reservoir level history cards.
- **Four natural river gauges compared with normal** (ADR-144, ADR-145) on
  the river flow page: Mill Creek near Moab, Blacks Fork near Robertson, South
  Creek near Monticello and Middle Fork Beaver Creek near Lonetree. Each
  gauge's newest daily flow is placed in one of five classes, from much below
  normal to much above normal, against the U.S. Geological Survey's
  percentiles of approved daily values for the same date. The page shows the
  normal range, the median and how many years they rest on, with the reading
  and the range at three significant figures. A date with 10 years or fewer
  gets no comparison, and the page says why; a date with fewer than 30 years
  is compared, and the page says it has fewer than the usual 30. The four
  rivers toward Lake Powell are unchanged and are still not compared with
  normal. `rivers.json` moves to structure version 3 with `normal_band`,
  `flow_class`, `normal_withheld` and `short_record` on natural gauges; the
  percentiles are a committed reference file, `river_normals.json`, rebuilt
  by `tools/build_river_normals.py`.
- **Eastman Lake**, behind Buchanan Dam in California, from the California
  Department of Water Resources. It was held for one monthly reading that
  its own daily series shows was wrong. With that reading excluded
  (ADR-116), it passes every admission screen. Its full level is the
  provider's 150,000 acre-feet. Its 1991-2020 normal is built.
- **Three natural river gauges compared with normal** (ADR-144) on the river
  flow page: Mill Creek near Moab, Blacks Fork near Robertson and South Creek
  near Monticello. Each gauge's newest daily flow is placed in one of five
  classes, from much below normal to much above normal, against the U.S.
  Geological Survey's percentiles of approved daily values for the same date.
  The page shows the normal range, the median and how many years they rest
  on. A date with fewer than 30 years gets no comparison, and the page says
  why. Middle Fork Beaver Creek is held out at 22 years. The four rivers
  toward Lake Powell are unchanged and are still not compared with normal.
  `rivers.json` moves to structure version 2 with `normal_band`, `flow_class`
  and `normal_withheld` on natural gauges; the percentiles are a committed
  reference file, `river_normals.json`, rebuilt by
  `tools/build_river_normals.py`.
- **A picture for a shared Lake Powell or Lake Mead link** (ADR-141). Two
  share pages, `share/lake-powell.html` and `share/lake-mead.html`, carry the
  card tags and send a person on to the reservoir page. The picture on the
  card is the reservoir's name, surface level with its datum, reading date and
  water-year chart, captured from the site in each morning's deploy; a
  committed picture is published if the capture fails. The same frame opens
  at `reservoir.html?name=...&view=share`.
- **Surface level for Lake Powell and Lake Mead** (ADR-135) on their
  reservoir pages: a "Surface level" card with dated changes and record
  readings, a chart of the current water year against five earlier ones
  with Reclamation's reference levels, and a note on why another source can
  show a different number. Powell is above the National Geodetic Vertical
  Datum of 1929; Mead is above Reclamation's own Hoover Dam powerhouse
  datum, named as such. Published from a reviewed roster that must name each
  datum with evidence; the daily record is `elevation_history.json`, also at
  `/api/elevation_history.json`, and the reservoir's CSV file gains the
  level's columns.
- **River flow** (ADR-136): `rivers.html` shows the daily mean flow of four
  rivers that flow toward Lake Powell -- the San Juan near Bluff, the
  Colorado near Cisco, the Green at Green River and the Dirty Devil near
  Hanksville -- for the last 30 days, with the review status of each value
  and a link to each gauge's U.S. Geological Survey page. Dams upstream
  store and release water, so no flow is compared with normal, and the
  gauges are never added together. Published as `/api/rivers.json` and as
  a CSV download. Reached from the methods and data pages.
- **Storage gained since the low** (ADR-134): each daily reservoir's gain
  since its own lowest reading in the last 120 days, with the date of that
  low, in the reservoir details and on the storage map hover. The storage
  charts page totals it for the place and says how many of its daily
  reservoirs the total holds. Monthly reservoirs show none.
- **Story views** (ADR-128): `story.html` shows one figure alone, for a
  story to embed: the precipitation card or its "Where this year stands"
  strip for a state or drainage area, or the water stored above a
  reservoir. Each view fills its frame without scrolling, takes its theme
  from the link or the reader's system and never stores it, and links to
  its full page in a new tab. Not in the navigation.
- The precipitation chart reads a day on a tap as well as on hover.
- **Recent precipitation** on the precipitation card: totals for the last 1,
  3 and 7 days for the place shown, each the mean of the stations that
  measured both days, and the eight stations with the most. A gauge total
  that falls is left out and counted, never shown as zero (ADR-129).
- **Two Army Corps of Engineers reservoirs**: Galesville Reservoir in
  Oregon and Bennington Lake in Washington. Both were held because their
  storage series returned no values; a re-audit on 2026-10-31 found both
  reporting and passing every admission screen (ADR-102). Their full levels
  come from the National Inventory of Dams.
- **Soil moisture this week** (ADR-142): a "Rain | Soil moisture" switch on
  the precipitation map turns the same map to the change in soil moisture
  over 7 days at the snow stations, in percentage points, brown drier and
  blue wetter. A station's value is the mean of its 2 in (or 4 in), 8 in and
  20 in sensors; a reading is not used on a day the soil there is frozen.
  Its own key, a list of the stations that changed most, and a table of
  every station. A new daily file, `soil_moisture.json` (27 KB gzipped),
  fetched only when a reader turns the switch. The link carries the mode:
  `precipitation.html?layer=soil` opens on soil moisture.

### Changed

- **The weekly card's storage figures follow every filter** (ADR-149) on the
  storage charts page: state, county, search, reporting and storage class, as
  well as the Lake Powell and Lake Mead switches and the drainage area. The
  scope line says how many reservoirs of how many the figures cover. The snow
  and drought figures still describe the whole region.
- **The soil map says how old it is.** Once the soil readings load, the
  switch reads "Soil moisture to Oct 26" (the week's end date), and the date
  line says why it can end before the rain totals: it is the newest day on
  which 9 in 10 on-time stations sent readings at all three depths. The grey
  key entry now reads "No value: too few stations, or no reading on both
  days".
- **Soil moisture lists wetter and drier stations apart.** The soil map's
  list of eight is now "Largest increase" (four) and "Largest decrease" (four),
  each by 2 points or more; an empty side says no station moved that way (ADR-142,
  update of 2026-10-31).
- **The share picture names its source and its lines.** The Lake Powell and
  Lake Mead pictures end with a key (this water year, the year before, the
  earlier years and the dashed lines) and "Readings: Bureau of Reclamation ·
  buschbrian.github.io/western-water-dashboard". The committed fallback
  pictures carry the same source line. The frame stays 1200 by 630.
- **Lake Powell and Lake Mead lead with their level.** The top of each page
  shows two tiles: the surface level above its named datum, beside percent
  full and the level it is measured against ("23.7% full (maximum level)").
  Reservoirs without a reviewed level are unchanged.
- **Lake Mead's three 24-Month Study levels are named once.** The chart key
  and the list under the chart say "Levels Reclamation's 24-Month Study
  reports against" one time, and each line is marked by its height alone
  ("1,075 feet"), on the reservoir page and the share picture. Levels that
  share a roster label must share one source, or the roster loader refuses
  the file.
- **River flow is in the page menu and the bar** (ADR-148), between Drought
  and Methods, on every page. It is not in the first-visit chooser. From 1,024
  to 1,151 px wide the page-link buttons show their icons alone, and the river
  flow button does so up to 1,199 px, so the bar no longer clips the storage
  map's panel buttons.
- **The river flow page opens on a summary table.** "Flow at each gauge" gives
  each gauge's flow on the newest reading date and how it compares with
  normal, or "Not compared: dams upstream"; each row links to its card. The
  cards follow in two groups: "Compared with normal", then "Flow only: dams
  upstream".
