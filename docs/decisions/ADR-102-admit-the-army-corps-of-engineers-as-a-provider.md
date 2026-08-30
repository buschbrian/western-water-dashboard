# ADR-102: Admit the Army Corps of Engineers as a provider

- Status: Accepted
- Date: 2026-08-29

## Context

The roster held no Corps of Engineers reservoir. The 2026-08-20 source survey
called that the single largest confirmed coverage gap and then found the
Columbia Basin absent from the national CWMS Data API, because it queried the
three district offices and each was empty. The 2026-08-29 follow-up in
`docs/WESTERN-SOURCE-CANDIDATES.md` found the same data under the
Northwestern Division's Pacific Northwest *region* office, `NWDP`: 595
storage series across 125 locations, keyless, in acre-feet on request, and
current to the hour. Idaho, Oregon and Washington were the survey's remaining
open ground, and this is where their Corps and public-utility reservoirs are.

Three properties of the service shape the admission.

**A series name says whose number it is.** A Corps series is
`Location.Parameter.Type.Interval.Duration.Version`, and the version suffix
names the network or agency the reading came from: `CBT-*` is the Columbia
Basin Teletype network, `IDP-*` Idaho Power's computation, `CENWS-*` the
Seattle District's own, and `USBR-RAW`/`USBR-REV` are Reclamation's Hydromet
readings republished by the Corps. `*-FCST` versions are forecasts and carry
catalog extents a year into the future.

**The catalog is not the reading.** Seven series advertised August extents
and answered nothing for July and August in every window tried. A candidate
is confirmed by a read, never by the catalog.

**No full level is published as storage.** `/pools` names each project's
pools by elevation level ids and `/levels` returns none for this office, so
there is no acre-foot capacity to prefer under ADR-070.

And one question the roster rule did not anticipate: the mainstem Columbia
and Snake projects — Bonneville, The Dalles, John Day, McNary, the four lower
Snake locks and dams, the five mid-Columbia public-utility dams — are
run-of-river pools. Each has a dam, a storage series and a dam-inventory
record, so ADR-078's rule admits them as written; they hold hundreds of
thousands of acre-feet and swing a few feet for power rather than filling and
emptying with the season.

## Decision

**Admit the U.S. Army Corps of Engineers CWMS Data API as the eighth
provider**, `SourceKey` `cwms`, visible name "U.S. Army Corps of Engineers",
reading the `NWDP` office.

**A roster entry commits the office and the whole six-part series name**,
keyed by the Corps' location id (ADR-066). The loader refuses a series whose
version is a forecast or a republished Reclamation reading: the Corps is not
the source of a `USBR` series, and ADR-069's one-dam-one-reservoir rule
means those locations are checked against Reclamation's own feed rather than
admitted twice. Milner, Henrys Lake, Mann Creek and Lake Waha are the
locations this keeps out.

**The audit chooses one series per location by a stated preference, then
confirms it by a read.** Storage parameters in the order `Stor`,
`Stor-Total`, `Stor-Lake`; among those, the longest history first, because
the seasonal estimator and the normals read years and a `Best` series that
began in 2025 is a worse reading of the same water than a revised one that
began in 1970; then `Best`, then revised, then raw; then the coarsest
interval. A series counts as answering only if its last reading is inside
the last thirty days — the revised versions of several series stop months
before their raw counterparts, and a series that would be withdrawn on its
first morning is not the reading.

**The run-of-river pools are admitted on the same rule as everything else.**
ADR-078 says a reservoir is a dam, a full level and reported storage, and
they have all three; the shared screens compare their series against the
inventory exactly as they compare every other candidate's. A pool that a
reader would not call storage is a product question about what the map is
*of*, and this record answers it the way ADR-078 already did: membership is
the evidence, and a rule that admitted a pool by its name and refused
another by its purpose would be the per-record typing ADR-078 set aside. If
that answer is wrong it is reversed by holding them in the roster file with
a finding, not by a rule in code.

**Every denominator is the dam inventory's** (ADR-003, ADR-072). ADR-070's
preferred-figure rule never fires for this provider, the same position the
Geological Survey is in.

**A day is the series' last reading in its own time zone** (ADR-100). The
service stamps instants in UTC and names each series' zone; the adapter
converts before reading the date, so a 23:00 Pacific reading belongs to
that evening. The frame is then bounded by the range the caller asked for,
because that conversion pulls the first reading of a range into the evening
before it -- which would otherwise put a 1990 reading inside a 1991-2020
standard-period normal.

**A range is asked for in five-year windows.** The service answers eleven
years of hourly readings in about three minutes and refuses thirty outright:
building the standard-period normals returned 408, 500 and 400 for nine of
the twelve locations, and succeeded for exactly the three whose chosen
series is daily rather than hourly. The limit is the number of readings
rather than the number of years, so the range is split rather than the
request retried. A refusal that consistent is an answer about what the
service will do, and asking again is asking the same impossible question.

## Rejected alternatives

- **Build against the Northwestern Division's own water-control portal.**
  It answers 403 from its edge and an error page for every path tried, and
  the national API turned out to hold the same data.
- **Admit the `USBR` series where Reclamation's own feed is quiet.** That
  is a second provider for one reservoir under another name, the exact
  double counting ADR-069 exists to prevent; a quiet Reclamation feed is a
  freshness question for that provider.
- **Hold the run-of-river pools by rule.** See the decision. Rejected
  because the rule would have to say what "run-of-river" means in a field
  no source publishes.
- **Cache the series in the dense-history file as the Salt River Project's
  are.** Not needed for correctness, which is what that cache exists for:
  the Salt River Project serves only three years, so without the cache its
  series would shrink, while this service holds the whole record and can be
  asked for it again every morning.

  It is not free, and the first full run measured the cost rather than
  assuming it: a daily series answers in a page or two, and the largest
  hourly series -- Grand Coulee, about 100,000 readings since 2015 --
  takes about three minutes on its own. Twelve locations, several of them
  hourly, is the heaviest fetch on the roster and it is paid again every
  morning. Caching them would trade that for a committed file that grows by
  roughly fifty thousand rows and is rewritten daily. The cache is available
  if the morning job's cost becomes the binding problem; it is not taken
  here, because a slow job is a cheaper fault than a repository that grows
  by a rewritten megabyte a day, and because nothing about the published
  numbers depends on it.

## Consequences

- `SourceKey` gains `cwms`; every table keyed by it names the Corps, and the
  smoke suite's acronym rule gains `USACE` and `CWMS`.
- `admitted_cwms_reservoirs.json` is the reviewed roster, with a `withheld`
  block naming every location kept out — republished, quiet, unreadable, or
  held by a screen — and the finding behind each.
- `tools/audit_cwms_stations.py` is the audit; it prints evidence and writes
  nothing.
- The states the survey called open ground are covered by the provider that
  holds their largest reservoirs, and Wyoming's remaining gap is recorded as
  a scope decision rather than a source gap: its Corps and Reclamation
  reservoirs on the Missouri side are outside the drawn regions 14–18.
- Normals for the admitted locations are built from the same series over
  1991–2020 where the series reaches that far; ALF's, which began in 2025,
  will have none.
