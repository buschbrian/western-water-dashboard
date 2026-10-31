# ADR-130: Give precipitation its own page

- Status: Accepted
- Date: 2026-10-26
- Supersedes: the placement in ADR-125 ("Precipitation joins the snow page as
  a card of its own"). ADR-125's measurement, station set and history stand.
- Relates to: ADR-021 (snow telemetry has a view of its own), ADR-045 (each
  page is named for its subject), ADR-128 (story views link to their full
  page), ADR-129 (the recent totals on the card)

## Context

ADR-125 put the precipitation card on the snow page, and on 24 October the
page was renamed "Western Precipitation and Snow" with the card moved
directly under the map. On a 390-pixel phone that page measured 6,623
pixels. The card began about 2,400 pixels down, under the five snow summary
cards, the map and three paragraphs of map notes. In October, the snow
figures say "too little normal snow to compare against", and precipitation
is the current figure a reader comes for.

Two subjects also shared one name. The bar said "Precipitation" for a page
whose summary cards, map and tables are all snow.

## Decision

**Precipitation is a page of its own, `precipitation.html`. The snow page is
the snowpack page again, at the same address.**

1. The new page shows the precipitation card for the place in the link. It
   scopes the place with the snow page's own functions (`snow-place.ts`), as
   the story views do, so both pages count the same stations for one place.
2. It reads and writes the same `state`, `area` and `level` parameters as the
   other pages, and the bar carries the place onto it.
3. The bar has six entries: Storage map, Storage charts, Precipitation,
   Snowpack, Drought, Methods. The first-visit chooser and Find a place offer
   the new page as a subject.
4. `snow.html` keeps its address and every link to it. Its title, bar text
   and lead say "Snowpack" again, as before 24 October.
5. Story views of precipitation (ADR-128) link to the new page as their full
   page.
6. The readiness field `precipitation` leaves `__snowReady` with the card
   (ADR-090). The new page reports `__precipReady`.

## Rejected

- **Keep one page and move the card to the top.** The snow page's place,
  season and site filters, and its summary cards, describe snow. Above
  them, the card would sit under filters that do not apply to it. Below the
  summary cards, it would sit under figures that are about a different
  subject.
- **Fold the card on phones.** It hides the current figure behind a tap on
  the device where it is read most.
- **A precipitation map.** The stations could be coloured by their share of
  the median. That is a new symbol scale and needs its own record. It is not
  needed to split the pages.

## Consequences

- A link that says `snow.html` opens the snowpack page. A reader who came
  for precipitation finds it in the bar, one step away.
- Station names in the card's recent totals are text on the new page. On the
  snow page they selected the site's chart, and that chart is not on this
  page.
- `deploy-pages.yml`, the content policy test and the browser suite each list
  the new page.
