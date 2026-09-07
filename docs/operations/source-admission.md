# Admitting a reservoir source

The procedure for adding, replacing or reviewing a provider or a reservoir.
The agent-facing short form is
[`.claude/skills/reservoir-source/SKILL.md`](../../.claude/skills/reservoir-source/SKILL.md);
this is the detail behind it. The candidate evidence itself lives in
`docs/WESTERN-SOURCE-CANDIDATES.md`, `docs/CDSS-CDEC-API-REVIEW.md` and the
admission reviews indexed by [`docs/README.md`](../README.md).

## Nine providers, and a provider is named by its agency

`SourceKey` is `rise | awdb | cdec | cdss | usgs | srp | dnrc | cwms | cap` and
every table keyed by it is exhaustive, so a tenth provider is a compile error
rather than an `undefined` reaching a reader. Visible text names the agency and never
the system: "Bureau of Reclamation", "Natural Resources Conservation Service",
"California Department of Water Resources", "Colorado Division of Water
Resources", "U.S. Geological Survey", "Salt River Project", "Montana Department
of Natural Resources and Conservation", "U.S. Army Corps of Engineers",
"Central Arizona Project" (ADR-006).

The Corps is keyed by its location id under its office, with the whole
six-part series name committed beside it; the loader refuses a forecast or a
republished Reclamation (`USBR`) version, because the version suffix is what
says whose number a series is (ADR-102). `tools/audit_cwms_stations.py` is
its audit. The Central Arizona Project is one reservoir behind one endpoint
that holds no history; its series grows in the dense-history cache from the
day of admission (ADR-104).

## A reservoir is keyed by its station, not its name (ADR-066)

A name is a label, not an identity: the west holds a Lost Creek in Utah and
another in Oregon, 946 km apart. Every roster is keyed by the provider's own
identifier, which is what the payload publishes as `source_station_id`.

## The two questions a candidate must answer

**A dam match is not the whole question.** `admit` asks whether the inventory
holds the right dam and answers from the inventory alone. `discrepancies` asks
whether everything else known about the same reservoir agrees with it:

1. whether the provider's own full level and the inventory's differ;
2. whether the water has stood above the capacity it would be divided by;
3. whether it has ever stood a third of the way up it; and
4. whether one reading sits far above the rest of the series.

All four reuse the measured `SURCHARGE_ALLOWANCE` rather than a new number. Of
169 California candidates the inventory admitted 162 and the screens held 36 —
Keswick's conservation pool of 7,470 acre-feet against the service's 23,772, and
O'Neill Forebay matched to a dam 1.18 km away carrying San Luis Reservoir's
2,094,900, thirty-seven times its own. The spike screen reads the **third**
highest reading, because Lake Havasu carries two and a rule reading the second
would have called them agreement.

**Nothing is repaired.** Every correction available is a guess about which
source is wrong, so the screen reports and a person decides
([#25](https://github.com/buschbrian/western-water-dashboard/issues/25)).
`publishable` is the field a roster builder reads and it is deliberately
narrower than `admitted`, which still states that the dam match itself stands.

**A confirmed anomaly may be excluded, one named reading at a time**
(ADR-116). This extends the no-repair rule rather than breaking it: an
exclusion says which reading cannot be true and against what, and a repair
would say what the reading should have been. It is committed in the provider's
admission file under `excluded_readings`, keyed by station, and each record is
exactly the sensor, the stamp as the provider writes it, the raw value, the
reason in plain words, an HTTPS source for the independent figure, the review
date and the tracking issue. `load_excluded_readings` refuses a station the
file does not know, a missing or extra field, a foreign sensor, a non-HTTPS
URL, a malformed date, and any replacement value. The match is on station,
sensor, day **and** raw value, so a corrected reading returns by itself.

Five readings are excluded today, all California: Lake Havasu's 5,913,000 and
5,775,421 acre-feet against the then-reviewed total capacity of 646,200
(the current denominator remains held; see the HVS review below),
O'Neill Forebay's 443,348 against a 56,400
acre-foot facility, Railroad Canyon's 58,508 against nearly 12,000, and Grant
Lake's 82,410 against 47,575. The issues stay open
([#44](https://github.com/buschbrian/western-water-dashboard/issues/44)
to [#47](https://github.com/buschbrian/western-water-dashboard/issues/47)):
an exclusion says what this project did in the meantime, not what the provider
answered. **An exclusion is not an admission** -- removing the reading answers
the spike screen and nothing else, and the audit is re-run afterwards to see
what the remaining screens say. Grant Lake subsequently passed its admission;
Havasu, O'Neill Forebay and Railroad Canyon remain withheld.

**Being listed is not reporting.** The candidate screen asks whether a station
has answered **within the year**. Bon Tempe is why — five usable readings ever,
the last in March 2023 — and admitting it would have put a name on the roster
that is withdrawn for a quiet feed the same morning, which is what a silently
failed fetch looks like.

## The denominator

**Where the operator publishes a full level, that is the denominator**
(ADR-070). ADR-003 prefers the conservation pool because that is what an
operator means by full, and the dam inventory was long the only place to read
one; where the provider that publishes the readings publishes a full level too,
that figure wins.

`preferred_capacity` is the rule and it is **opt-in** -- a caller names the
`capacity_basis` its provider's figure carries, and `tools/audit_cdec_stations.py`
is still the only audit that names one, so nothing outside California moved. A preferred figure **names its
source or the roster refuses to load**: `cdec_reservoir_report` and
`reclamation_project_record` both require `capacity_source_url` in
`validate_capacity_evidence`. The disagreement screen measures against the
figure *actually chosen*, so it reports an inventory contradicting a denominator
this project divides by and stays quiet once the rule has settled it.

Two keys, one reader-facing phrase: `basisShares` groups by label, because
"published by the reservoir operator 4, published by the reservoir operator 33"
is one fact printed twice.

**A missing inventory record is not an automatic refusal** (ADR-110). A
reviewed government water report or owner-operated record may replace it when
the evidence identifies the facility and controlled works, defines the storage
series, and gives a full level on the same basis. The roster states that the
inventory search ran and found no corresponding record; a blank identifier is
not enough.

**An active operating restriction is the current full level** (ADR-111). Keep
the physical capacity separately and retain each full-level version with its
authority, effective dates and source. Historical observations use the version
effective on their own date. A restriction notice without an acre-foot limit
is a lead for operator research, not a denominator.

What that looks like in the roster entry's `capacity` block: `capacity_af` and
`capacity_basis` stay the figure in force today, `physical_capacity_af` holds
what the structure takes, and `capacity_versions` lists every full level
oldest first. Each version carries `capacity_af`, `capacity_basis` and
`effective_from` — null only on an earliest version that opens the record —
plus `effective_to` where the end is known, which has to be the day before the
next version starts. A version whose basis is `operating_restriction` also
names `authority`, `source_url` and `source_checked`, and always carries a
start date, because a limit begins on one. That date may predate the readings:
a reservoir restricted since 1993 and reporting since 2015 has one version,
dated 1993, and one version is allowed precisely because it says when it began.
The loader refuses anything incomplete or contradictory, and the refresh
refuses a series older than the earliest full level, so a reviewer finds out at
import or at run time rather than in a published percentage.

**Do not introduce another capacity precedence rule without a decision record.**

## A natural terminal lake is a separate admission path

ADR-112 permits a `natural_terminal_lake`, but it is not a reservoir with a
missing capacity. Review its waterbody point, closed-basin assignment, vertical
datum and any stage-volume relation. It receives no dam or outlet point, no
percent full and no membership in reservoir rollups. A target level stays a
named restoration or regulatory target and never becomes capacity.

## A reviewed admission names the screen it was admitted against

Five California reservoirs are on the roster over a screen that held them, and
`admitted_cdec_reservoirs.json` carries `review.waived` and `review.why` for
each — the loader refuses a waiver with no reason, because a waiver with no
reason is a screen turned off. The same file's `withheld` block names every
candidate kept out and the finding behind it, so the next reader meets the work
rather than repeating it: Lake Havasu's candidate full levels are recorded
there beside the readings excluded under ADR-116 and the finding that keeps it
unpublished while its storage basis is unresolved.

### Lake Havasu (HVS) capacity review

**Decision on 2026-09-06: retain the admission hold.** The two exclusions are
valid under ADR-116, but 646,200 acre-feet is not established as the full level
on the basis of the current storage series. The roster and generated payloads,
including the normal baseline, remain unchanged. The exact current hold
is in `admitted_cdec_reservoirs.json`; issue #44 remains open for the original
provider anomalies.

The live [CDEC station metadata](https://cdec.water.ca.gov/dynamicapp/staMeta?station_id=HVS)
identifies Lake Havasu, Bureau of Reclamation operation, and monthly sensor 15
storage in acre-feet. Its [reservoir profile](https://cdec.water.ca.gov/dynamicapp/profile?s=HVS&type=res)
names Parker Dam but gives 648,000 acre-feet without defining total versus live
storage. The [Reclamation project record](https://www.usbr.gov/projects/index.php?id=207)
still gives 646,200 total acre-feet at elevation 450 feet and identifies Parker
Dam as AZ10312. A live NID query within 15 km of CDEC's point
(-114.156, 34.317) returns Parker Dam at (-114.139211, 34.296605), with
180,000 in all three storage fields, plus Gene Wash and Copper Basin.
Facility identity is supported; those inventory volumes do not describe the
reported series.

Read with `pipeline.providers.fetch_cdec_series('HVS', 'monthly', '20150101',
'20260906')`, the series retains 137 readings through 2026-07-31 after excluding
the two exact stamp/value pairs. Its three largest readings are 601,300,
600,100 and 599,900 acre-feet. `admission.admit` still returns "no dam close
enough to confirm" against the nearby inventory records. A hypothetical
reviewed capacity of 646,200 clears `admission.discrepancies`; so do 590,262
and 570,253. The numerical screens cannot distinguish their storage bases.

The newer [Reclamation allocation sheet](https://www.usbr.gov/lc/region/g4000/Mohave-Havasu_ReservoirCapacityAllocations_2026.pdf),
page 3, gives total capacity 590,262, live capacity 570,253, active capacity
176,837 and dead storage 20,009 acre-feet. Its summary explicitly supersedes
previous allocation sheets. Its approval date is not evidence of when CDEC
changed its measurement table. The [current operations report](https://www.usbr.gov/lc/region/g4000/hourly/levels.html)
also uses 570,253 available acre-feet at elevation 450 feet.

**To release the hold:** establish whether CDEC sensor 15 reports total or live
storage; identify the elevation-capacity table and its effective dates in the
CDEC observations, including whether earlier observations were recomputed;
then record matching full levels and determine whether the 1991-2020 readings
are comparable with the current series. The
[2026 survey implementation study](https://www.usbr.gov/main/qoi/docs/Mohave-Havasu-ACAPS-Study.pdf)
supports new area-capacity tables in operational record-keeping but does not
establish that CDEC transition. Do not choose a date from a change in the
numbers or repair observations to fit a capacity. Once resolved, complete the
geography review, refresh and normal build in the admission change.

## A roster addition needs a refresh in the same change

`tests/test_refresh.py` asserts every roster name is either published or
withdrawn, and there is no "pending" state on purpose: a name on the roster and
absent from the payload is what a silently failed fetch looks like.

- `refresh_reservoirs.py --only "Name"` prints and never writes, so it is a
  probe.
- `tools/build_normal_baselines.py` merges on every path — `--only` used to
  write its one reservoir as the whole file, and a full run used to drop the
  normal of every reservoir withdrawn that morning.

## Checklist

1. Identify the measurement semantics: what the value means, its units, and
   what date the provider stamps it with. Correct the calendar, never the
   reading.
2. Identify the full-level authority and whether the provider publishes one.
3. Read the closest existing adapter in `pipeline/providers.py`.
4. Discover candidates with the matching `tools/audit_*_stations.py`.
5. Run the admission and discrepancy screens; record every withheld candidate
   with its finding. Where a reading is confirmed impossible against an
   independent figure, exclude that one reading with its evidence (ADR-116)
   and re-run the screens; never repair it.
6. Add the roster entries **and** run the refresh in the same change.
7. Build the missing normals: `tools/build_normal_baselines.py --missing`.
8. Re-run the dam-versus-waterbody check; it is what found Lake Powell.
9. `npm run verify:pipeline`.
