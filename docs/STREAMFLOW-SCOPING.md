# Scoping streamflow, and what it would make this site

This site is called the Western Water Dashboard and its roster is reservoirs.
That gap is not an accident of naming -- ADR-045 chose the name for the water
and each page for its subject, and snow and drought already have their own
subjects, payloads and pages. Streamflow is the third such subject, and it is
the first one that cannot be added without saying out loud what this site
measures.

This document scopes it. It recommends nothing be built yet.

## The question

Two questions, and only the second is hard.

**Can the data be had?** Yes, and cheaply. It is the same service, the same
key and the same collection the reservoir provider already reads.

**Is a river gauge a thing this site can publish?** Today, no. ADR-078 says
every water this site measures is a reservoir, and it means it: the type
follows roster membership, there is no per-record type field, and every
surface downstream assumes a dam, a full level and a percentage of it. A
gauge has none of those. That is a decision to be remade, not a gap to be
filled in.

## What the service gives, measured

Measured 2026-08-29 against the live service with the pipeline key.

The modern collection the reservoir provider already reads carries discharge
alongside storage. Storage is parameter `00054` in acre-feet; discharge is
parameter `00060`, statistic `00003`, in cubic feet per second:

| site | parameter | statistic | unit | earliest seen |
|---|---|---|---|---|
| `09380000` Colorado River at Lees Ferry | `00060` | `00003` | `ft^3/s` | 1938 |
| `09509501` Horseshoe Reservoir | `00060` | — | — | no rows |

Two things follow from those two rows.

**Gauges and reservoirs are different sites.** Horseshoe Reservoir returns
storage and no discharge at all. The roster for this subject is a new roster,
not a column added to the existing one.

**The record is long.** Lees Ferry answers back to 1938, where reservoir
storage on this site starts in 2015 and every history rank rests on eight to
eleven years. A flow page could carry a real climate baseline over the closed
1991-2020 period that ADR-041 already defines, with decades behind it rather
than a decade. That is the strongest argument for the page: it can say things
about normality that the storage pages honestly cannot.

The service advertises `daily`, `latest-daily`, `continuous`,
`latest-continuous`, `field-measurements`, `monitoring-locations`, `peaks` and
metadata collections. Only `daily` is needed for a first page.

**What is not measured: how many gauges there are.** The collection does not
return a match count for a bounding-box query, so the size of the admission
problem is unknown. It is certainly far larger than the 392-reservoir roster,
and the screening question below is therefore the real work.

## Where the work goes: the morning pipeline, not the browser

This is settled and worth restating, because "a live API" is the natural thing
to reach for and it is closed off in three places.

- **ADR-098** holds the key in the pipeline and never lets it reach a reader's
  browser. The collection requires the key.
- **ADR-004** runs the pages anonymous and refuses credential challenges.
- **The pages' own policy** allows `connect-src` to `'self'`, the Esri hosts
  and `hydro.nationalmap.gov`. The service host is not on it, so the request
  would not leave the browser.

So streamflow arrives the way everything else does: a stage in the morning
refresh writes a committed payload, and the commit is the deploy (ADR-002).
Nothing is extracted by hand. What that buys, beyond the key staying secret,
is a page that loads without waiting on a government service, degrades to
yesterday's numbers when that service is down, and publishes figures a reader
can check against a dated commit.

## What is already shared, and what is reservoir-shaped

The encouraging half: the site is more separable than it looks. Snow and
drought each own a payload, a page, a model, a method record and a colour
table, and neither borrows the reservoir roster to exist.

Reservoir-shaped, and would need an answer:

| Thing | Why it does not transfer |
|---|---|
| ADR-078's single type | A gauge is not a reservoir. Needs a successor. |
| `shared/reservoir-viz.js` | A frozen percent-full colour table. Flow has no percentage of full. |
| `capacity_basis`, `pct_of_capacity` | There is no denominator. See below. |
| `upstream_index.json` | Keyed by reservoir station (ADR-077). A gauge has an upstream set too, and it is a second index, not a column. |
| The admission screens | Written around a dam match and a capacity trace (ADR-003, ADR-015). |
| `data/rollup.ts` basis shares | A combined percentage of mixed full levels. Meaningless for a rate. |

Genuinely shared and reusable as-is: the drainage-area scopes and their URL
state, the freshness and withdrawal rules (ADR-056), the place chooser, the
export and download surfaces, the payload validator's shape, and the
generated-file ownership table.

## Flow is a rate; storage is a volume

This is the methodological centre of the page and the thing most likely to be
got wrong quietly.

Storage has a ceiling and the site divides by it. Flow has no ceiling, so
"percent full" has no analogue and must not be invented. The honest
comparisons are against the site's own history: today's flow against the
median for this day of the year over a closed period, and a position in the
record. Both are estimators, both need a method record, and neither is
ADR-081's ratio-of-sums for snow -- summing flows across gauges double-counts
every gauge downstream of another, which is exactly the trap the upstream
work already mapped.

**A regional total is therefore probably not publishable at all**, and saying
so is likely to be one of this page's decisions. Snow could be summed because
sites do not contain one another. Gauges do.

## Estimated shape of the work

Comparable to the snow page, not to adding a provider.

1. A successor to ADR-078, and the vocabulary that follows it. Scope, level
   and capacity already mean several things each; a fourth subject needs its
   terms distinguished, not overloaded.
2. A screening rule and a reviewed roster, the size of which is unmeasured.
3. A pipeline stage, a payload, a schema version and a validator.
4. A method record for the comparison, and a normals build over 1991-2020.
5. A colour language of its own, and the ADR that fixes it.
6. A page, its model, its tests, its URL state and its smoke coverage.
7. Visible language in Simplified Technical English throughout (ADR-006).

## What this scoping does not answer

- **How many gauges qualify**, and on what screen. Unmeasured above.
- **Whether a regional figure exists at all**, given nesting.
- **Whether the subject is flow or is water movement generally** -- diversions
  and reservoir releases are the same question asked differently, and the
  answer decides whether this is one page or the first of two.
- **What it costs gzipped** (ADR-051). A daily series per gauge over a long
  record is the largest payload this site would carry, and the budget may
  decide the roster size rather than the screen doing it.

## Sources, all on services this project already reads

- U.S. Geological Survey OGC daily values,
  `https://api.waterdata.usgs.gov/ogcapi/v0/collections/daily/items`,
  parameter `00060`, statistic `00003`. Same host, key and collection as the
  reservoir provider (ADR-098).
- Its `monitoring-locations` collection for the roster, keyless metadata.
- The drainage areas and the place vocabulary this site already publishes.
