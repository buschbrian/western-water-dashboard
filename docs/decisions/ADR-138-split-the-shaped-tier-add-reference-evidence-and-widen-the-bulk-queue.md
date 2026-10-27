# ADR-138: Split the shaped tier, add reference evidence, and widen the bulk queue

## Status

Accepted

## Date

2026-10-27

## Relates to

ADR-137 (published reservoir or ten percent storage; its rules stand and its
`shaped` tier is split here), ADR-130 (merge saved gauge reviews; the merge
rules now cover the accepted name and the new tier keys), ADR-124 (bounded
Utah recent-conditions pilot). No existing decision is superseded.

## Context

One worksheet tier, `shaped`, covered two different things a reader would be
told: dams upstream store and release the water, or water is taken out above
the gauge so the gauge reads low. Brian ruled on 2026-10-27 (R8) that readers
get four tiers: Natural (compared with normal), Shaped by reservoirs (shown,
not ranked), Reduced by diversions (shown, not ranked) and Not a river (a
canal, tunnel or drain; not shown). He also ruled that both ADR-137 outcomes
may be agreed in bulk, asked for three keyless evidence sources (R9), and asked
for an accepted display name that the private review page saves.

## Decision

**Tier keys stay machine names; the reader words live in one table.** The
worksheet keys are `natural`, `reservoir`, `diversion`, `short`, `check` and
`exclude`. `TIER_WORDS` in `tools/build_gauge_review.py` maps them to Natural,
Shaped by reservoirs, Reduced by diversions, Short record, Check and Not a
river, and `TIER_TREATMENT` to what a reader sees. The review page keeps the
same words; a test holds the page and the table together.

**What suggests each tier.** `reservoir`: a published reservoir in the basin,
or inventoried storage at or above 10% of a year's flow (or storage with no
flow to compare). `diversion`: the name places the gauge below a diversion,
canal, ditch, powerplant or tunnel; or the Natural Resources Conservation
Service (NRCS) adjusts the gauge's volume and no storage finding explains it.
`exclude`: the name is a tunnel, drain or canal, or the U.S. Geological Survey
(USGS) lists the site as a canal (`ST-CA`) or ditch (`ST-DCH`). Irrigation
dams stay a prompt to look for diversions and do not set a tier: a dam listing
irrigation among its purposes does not show that water leaves this river
above this gauge.

**Order when findings compete:** `exclude`, `check`, `diversion`, `reservoir`,
`short`, `natural`. A diversion finding is a statement about this gauge (its
name, or NRCS adjusting its volume where no storage explains it); a reservoir
finding is a statement about its basin. The suggestion reason lists every
finding, and a row with both kinds goes to review, never to bulk.

**An old `shaped` ruling.** It never said which kind of shaping the reviewer
meant. It stands as `reservoir` unless the row has a diversion finding, in
which case it returns to review as an empty ruling. `resolve_ruling` holds the
rule. The importer reads `shaped` from an export, writes `reservoir`, or leaves
the ruling unchanged and lists the site under `returned_to_review` in its
report; notes still import. The review page shows a saved `shaped` the same
way, says so beside the choices, and keeps the stored value until a person
chooses. Exports carry the stored value. Nothing is rewritten on its own, and
the worksheet's `reviewer_ruling` is only ever changed by the importer.

**Bulk queue.** Three outcomes are `bulk`: not a river by name or site type;
shaped by reservoirs; and natural (inventoried storage under 10% of a year's
flow with no published reservoir, including a basin with no inventoried dam
when a flow exists to compare). Each is `bulk` only when nothing else is in
doubt. Irrigation dams, a dam within 1 km of the gauge, a record starting after
1991, or diversion evidence (for the reservoir outcome) send the row to
`review`; an untraced or mismatched basin sends it to `check`. A diversion
named in the gauge's own name is `bulk` only when no reservoir finding competes
and nothing else is in doubt. An NRCS adjustment alone is never `bulk`: it
does not say what it adjusts. Rows with no storage comparison (no flow or
evidence not yet run) are `review`.

**Reference evidence (R9), all keyless.**

- `gages2_class`: `reference`, `non_reference` or `not_listed`, from the
  USGS GAGES-II point file on ScienceBase (a 2011 release, 9,322 gauges). The
  0.7 MB zip is fetched at build time and nothing is committed; the file was
  checked on 2026-10-27. The disturbance index sits in a 55 MB archive that the
  server will not serve in part, so it is not read. A reference class is a
  supporting finding for `natural` and decides no tier; it describes the basin
  in 2011.
- `nrcs_adjustment_pct`: NRCS carries `SRVO` (volume adjusted for upstream
  projects) and `SRVOO` (observed) at a station whose id is the gauge's USGS
  number. Most pairs are identical, so the column is adjusted over observed, in
  percent, over the months both exist since October 1991. `no_pair` and
  `no_data` are written as such. An absolute value of 5 or more is a finding
  (`NRCS_MATERIAL_PCT`); under that the volumes agree to rounding. Only an id
  match counts: a station a kilometre away can measure other water. The pair
  says the flow is altered, not by what, so with a reservoir finding it
  corroborates the reservoir and without one it suggests `diversion`. A
  negative value (water added, such as a transbasin import) lands on the same
  tier; the reason says it adds water, and a person decides.
- `usgs_site_type`: `ST-CA` or `ST-DCH` when USGS lists the site as a canal or
  ditch, otherwise `ST`, because the screen admits only `ST`. The lookup is two
  queries per state.

**Accepted display name.** The worksheet gains `accepted_display_name`
(after `notes`). The private review page saves it with the ruling record
(`{ruling, notes, name, updatedAt}`) and exports it as
`accepted_display_name`. The importer merges it under the ADR-130 rules:
saved records only, one trimmed line of at most 120 characters, a change to
an existing name needs `--replace SITE`, an export without the column leaves
names alone. `proposed_display_name` stays a proposal; accepting is the
person's act. Nothing published is renamed.

**Names.** `la`, `de`, `del`, `los` and `las` are lower case inside a name
("Cache la Poudre", "Rio Pueblo de Taos") and capital at the start of a name or
after a locator, where one opens a place ("near La Jara", "near Del Norte").

## Rejected alternatives

- Keep `shaped` and add a second field: two fields for one ruling invite
  disagreement, and the reader word would still need a lookup.
- Rewrite saved `shaped` rulings to `reservoir`: the reviewer may have meant a
  diversion, and the page store is not the importer's to edit.
- Turn irrigation dams into a diversion tier: they are common on large
  reservoirs and say nothing about this river's withdrawals.
- Treat any NRCS pair as altered: 77 Utah gauges have a pair and 61 agree to
  rounding.
- Read GAGES-II disturbance from the 55 MB archive on every run, or commit it:
  the point file carries the reference class alone, and a static 2011 index adds
  little to a screen that a person rules on.
- Match NRCS stations by distance: a station 0 to 1 km away at a dam or a
  reservoir inflow measures different water.

## Consequences

Utah suggestions moved from 39 `natural`, 96 `shaped`, 15 `short`, 11 `check`
and 3 `exclude` to 36 `natural`, 91 `reservoir`, 8 `diversion`, 15 `short`,
11 `check` and 3 `exclude`. Of the five `shaped` rows that became `diversion`,
all are named below a diversion; three `natural` rows became `diversion` on an
NRCS adjustment. The queue moved from 79 `bulk`, 74 `review` and 11 `check` to
19 `bulk` (15 `natural`, 3 `exclude`, 1 `reservoir`), 134 `review` and 11
`check`. The drop is irrigation dams: 90 of the 91 `reservoir` rows and 19 of
the 36 `natural` rows have one in the basin, and Brian's list of findings that
send a row to review names them. Without that one condition on the
`reservoir` outcome the queue would hold 78 `bulk` rows. The cost is review
time; the benefit is that no natural row is agreed in bulk past a prompt to
look for canals. A record starting after 1991 or a dam beside the gauge also
keeps a row out of `bulk`.

Colorado, New Mexico and Arizona worksheets pick up the tiers and columns when
`--suggest` and `--reference-evidence` run on them after their traces end. The
importer reads the worksheet by its column list, so a worksheet written before
this change needs one `--suggest` run before it can be merged. The review page
needs its bundle refreshed with `tools/build_gauge_review_page.py` and a
republish; its title still says Utah.

Not decided here, and left to Brian: whether irrigation dams should hold a
`reservoir` row out of `bulk` when the gauge is already shown without a rank;
whether a `natural` row should be `bulk` on storage evidence alone, since a
hidden diversion costs most there (15 Utah rows are, 4 of them GAGES-II
non-reference); and whether five active Utah
canal gauges that the `ST`-only screen never lists should be added as
`exclude` rows.
