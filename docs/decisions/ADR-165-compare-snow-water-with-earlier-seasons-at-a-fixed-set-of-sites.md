# ADR-165: Compare snow water with earlier seasons at a fixed set of sites

- Status: Accepted
- Date: 2026-11-11
- Relates to: ADR-081 (snow's summed ratio), ADR-097 (snow filtered by the
  upstream set), ADR-121 (the denominator floor and the finished season),
  ADR-125 (precipitation's fixed history), ADR-051 (payload cost)

## Context

The snow page compares a season with one thing: the 1991–2020 median for
the same day, as a percent. A reader cannot see whether this season is the
lowest in thirty-five years or merely below the middle, and in October and
November the percent is withheld most days because the normal is under an
inch (ADR-121). The question readers bring in winter -- "is this a bad year,
compared with the bad years?" -- has no answer on the page.

The precipitation page already answers that question for precipitation
(ADR-125): one fixed set of stations, every water year since 1991 on 53
weekly steps, bands drawn from the years read on straight lines between the
steps, and the current year as a line over them. The service that serves
`PREC` at the snow stations serves their snow water (`WTEQ`) in the same
request shape. Item 13 of the November product review plan asks for that
comparison on the snow page before February, for a state, a drainage area or
an upstream set, keeping the ratio of sums and the floor.

The first full build, 2026-11-11, for water years 1991–2026:

- **366 of 639 stations** cover every year and step. 273 do not: 216 have no
  record before the window, and 57 began in time but have one gap past the
  three-day rule (38 of those since 2021).
- 20 stations took 21 steps from a day or two earlier.
- 347 stations are in both histories; 19 are in the snow set only and 21 in
  precipitation's only. Neither history's set is a subset of the other.
- On 2026-11-11 the page's set is 365 sites of 636 for the whole West and 74
  of 140 for Utah. One site in each is left out for late data.

## Decision

**The snow page gains a card, "Snow water against earlier seasons", drawn
from a new committed file, `snow_history.json`.**

1. **The precipitation history's builder, with the element as a parameter.**
   `tools/build_snow_history.py` calls
   `tools/build_precipitation_history.main` with `element="WTEQ"` and its own
   output. The steps, the three-day substitution within the water year, the
   encoding, the window and the merge rules are unchanged and shared. A snow
   reading that is negative or not a finite number is not used; a zero is
   kept. A run refuses to merge into a file of another element. The
   precipitation file the builder writes is byte for byte what it wrote
   before.
2. **One fixed set, by precipitation's rule.** The place's sites with a full
   history and no late data; of those, the ones with a value on the newest
   day that nine in ten of them report. A site without a value that day is
   counted as late. Every figure on the card is a mean over that one set,
   and a day of this season draws only when every site in the set has a
   value. A place with no site in the set says so and draws nothing.
3. **Earlier seasons are earlier water years.** The bands cover 1991 through
   the season before the one shown, capped at the file's last year, so a
   finished season (`?season=`) is never compared with itself. The bands use
   ADR-125's quantile rule and regions; the history rank counts the seasons
   strictly above, to a tenth of an inch.
4. **The percent keeps ADR-081 and ADR-121.** "Of normal at these sites" is
   the set's snow water added up over their 1991–2020 normal added up, once,
   over the sites with both a value and a normal that day. It is printed only
   when that mean normal is at least `MEANINGFUL_NORMAL_INCHES` and the sites
   behind it reach `headlineFloor(placeSites, 2)`, the floor the page's own
   headline holds: at least half the sites in the place. Otherwise the card
   says which floor withheld it. Inches, the median for the date and the rank
   lead; none needs a normal.
5. **It follows the page's place.** The card takes the sites the page shows
   -- state, level, drainage area, upstream set -- after narrowing, so it has
   no URL parameter of its own.
6. **It says what it measures.** The card says it is snow water equivalent at
   a fixed set of sites, names how many and lists them, names the seasons
   compared, and says it is not snowfall.
7. **The file is fetched only when the card nears the screen** (800 pixels),
   with the snow file's 30-second deadline. A failure says so in the card,
   clears `aria-busy` and costs nothing else on the page. The card publishes
   its state on `window.__snowReady.snowHistory`.

## Alternatives

- **A percentile against the 1991–2020 normal period only.** It would drop
  the six most recent seasons, including 2023, from the bands, and repeat the
  normal the page already prints. A history is not a normal; ADR-125 rejected
  the same choice for the same reason.
- **The Conservation Service's own per-site percentile medians.** Each is
  taken over that site's own years, so a place's figure would mix sites of
  different ages, and there are no bands. One population for every number is
  the point.
- **Each season from whichever sites reported it.** The fault ADR-125 exists
  to remove.
- **Precomputed bands per named area.** The page lets a reader choose four
  area sizes, a state and an upstream set; the bands must follow whichever
  sites are shown, and a second implementation would drift.
- **A percent of normal over every site in the set.** One site with no
  published normal would withhold it for the whole season. ADR-081's
  population is the site-days with both a reading and a median.
- **Load the history with the page.** About 420 KB gzipped, larger than the
  snow file itself; most readers come for the map.

## Consequences

- No published snow figure, estimator, normal or threshold moves.
  `SNOW_METHOD_VERSION` does not move: nothing in `snowpack.json` changes,
  and the percent here is a new figure on a new card, computed by the
  existing rule.
- A new file is published at `/data/snow_history.json`: 1,736 KB raw,
  419 KB gzipped (gzip -9, as ADR-125 measured precipitation's; 433 KB at
  gzip -6). It is documented on the Data page; no `/api/` alias, as for
  precipitation's history.
- `snow_history.json` is long-lived derived, owned by
  `tools/build_snow_history.py`, rebuilt each October after the water year
  closes, after precipitation's history.
- The precipitation chart takes its words as a parameter. Its own defaults
  are the words it wrote before.
- On 2026-11-11 the card withholds its percent everywhere, because the mean
  normal under the set is under an inch. That is ADR-121 working.
- The gap rule is the setting most worth revisiting, as for precipitation:
  57 stations began in time and miss one step.
