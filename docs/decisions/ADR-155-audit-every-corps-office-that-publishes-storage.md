# ADR-155: Audit every Corps office that publishes storage

- Status: **Proposed** (for Brian Busch's approval. The number follows ADR-154 on
  `origin/main` at 2a37299; renumber if another branch claims it first.)
- Date: 2026-11-11
- Amends: ADR-102 ("reading the `NWDP` office")
- Relates to: ADR-066 (station identity), ADR-069 (one dam, one reservoir),
  ADR-056 (freshness), ADR-111 and ADR-113 (held full levels)

## Context

ADR-102 admitted the Corps of Engineers' CWMS Data API reading one office,
`NWDP`, because the 2026-08-20 survey had queried three district offices,
found them empty and then found the Columbia Basin under the region office.
`tools/audit_cwms_stations.py` hard-coded that office.

A western reservoir census for the 30 Day Map Challenge (2026-11-10) found
that four more offices answer the same catalog query with storage series:
`SPK` (260 series), `SPL` (42), `SPA` (46) and `NWDM` (131). The district
offices `NWP`, `NWS`, `NWW` and `SPN` returned none. `SPK` and `SPL` stand
inside the drawn drainage areas: California, the Great Basin and the Lower
Colorado. `SPA` and `NWDM` stand almost entirely on the Rio Grande and Missouri
sides.

The pipeline already reads any office: every roster entry commits its own
`office`, and `load_admitted_cwms_reservoirs` refuses an entry without one.
Only the audit and this record's predecessor were bound to `NWDP`.

## Decision (proposed)

1. **The audit reads every office whose catalog carries storage**
   (`--office`, default all five) and decides each location with the shared
   screens in `admission.py`, unmodified. A location outside the drawn areas
   is reported and not audited, whichever office holds it.
2. **The Corps' own published reservoirs count as already published.** A
   location within three kilometres of any published point, the Corps' own
   under another office included, is deduplicated rather than audited
   (ADR-069), so one water is never admitted twice through two offices.
3. **A location id the roster already holds under another office is
   reported as a collision and not audited.** The roster is keyed by
   location id alone (ADR-066), and ids repeat across offices: `Lemon` and
   `Vallecito` appear under both `SPK` and `SPA`. A colliding location needs
   its own keying decision before it can be admitted.
4. **First in keeps it.** Where another provider already publishes a
   reservoir, or a reviewed hold stands on it, a Corps series does not
   replace or route around it. Success Lake passes the Corps screens on the
   inventory's 230,000 acre-feet, but California's withheld finding for the
   same water (SCC) holds it for a full level containing its 2019 water,
   and that finding stands until it is resolved.
5. **Admissions are separate changes**, each through the reviewed roster.
   Nothing is admitted by this record.

## Evidence (2026-11-11, `origin/main` 2a37299)

All five offices audited: 7 clear, 31 held, 148 already published,
23 republished from Reclamation, 14 quiet, 2 unreadable, 39 outside the drawn
areas, 2 location-id collisions. `NWDP`'s results reproduce the roster's
existing findings: the mid-Columbia pools never seen a third full, and Lake
Pend Oreille, Coeur d'Alene, Flathead and Bonneville held for their
denominators.

Of the 7 clear:

| Location | Office | Dam (inventory) | Full level | Disposition |
| --- | --- | --- | ---: | --- |
| Bear-Pool | SPK | Bear Dam, CA10101 | 7,723 af | New; no published point within 19 km |
| Big Dry Cr | SPK | Big Dry Creek, CA01075 | 30,200 af | New; Millerton Lake 13.5 km away |
| Mojave | SPL | Mojave River Dam, CA10021 | 179,400 af | New; Lake Silverwood 8.5 km away |
| Farmington Dam-Pool | SPK | Farmington Dam, CA10104 | 119,314 af | Duplicate of CDEC FRM (#121) |
| Mariposa-Pool | SPK | Mariposa Dam, CA10107 | 21,500 af | Duplicate of CDEC MAR (#121) |
| Twitchell | SPL | Twitchell Dam, CA10197 | 151,050 af | Duplicate of CDEC TWT (#121) |
| Success Lake-Pool | SPK | Richard L. Schafer Dam, CA10113 | 230,000 af | Held by CDEC's SCC finding (point 4) |

Most `SPL` locations are flood-control basins that the "never seen a third
full" screen holds, as it should: Prado, Santa Fe, Sepulveda, Hansen, Whittier
Narrows, Painted Rock, Alamo and others. They sit near empty between storms.

## Consequences

- `tools/audit_cwms_stations.py` takes `--office` and reports `offices`,
  `location_id_collisions` and each record's `office`.
- If accepted, Bear, Big Dry Creek and Mojave can be admitted in one roster
  change. All three are flood-control pools that sit low most of the year.
- Re-run the audit after #121 merges: Farmington, Mariposa and Twitchell
  then report as already published.
- Lemon and Vallecito are already published through Reclamation, so their
  collision changes nothing today. It will matter the first time a
  colliding id is a real candidate.
