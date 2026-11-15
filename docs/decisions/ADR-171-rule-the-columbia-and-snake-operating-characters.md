# ADR-171: Rule the Columbia and Snake operating characters

- Status: Accepted (Brian Busch, 2026-11-15)
- Date: 2026-11-15
- Applies: ADR-156 (region review), ADR-114 (operating character)
- Relates to: ADR-072 (what `METHOD_VERSION` names)

## Context

ADR-156 rules operating characters one drainage region at a time, from the
census and each region's evidence side by side. The first packet, the Lower
Snake, Clearwater and Middle Columbia basins, is in
`docs/OPERATING-CHARACTER-CENSUS.md` with the census rerun of 2026-11-15.
Brian Busch accepted it as proposed on 2026-11-15, including the two rows the
packet marked for judgment.

## Decision

**Eight steady pools (`run_of_river`):** Lake Wallula (McNary), Lake Umatilla
(John Day), Lake Celilo (The Dalles), Lower Granite Lake, Lake Bryan (Little
Goose), Lake Herbert G. West (Lower Monumental), Lake Sacajawea (Ice Harbor)
and Hells Canyon Reservoir. Each is a navigation or power pool on the Columbia
or Snake mainstem that turns over in under five days. John Day is a steady
pool although it moved between 58% and 77% of its full level in the last 12
months: its pool is a navigation pool, and the swing is its operating band,
not seasonal storage.

**One flood-control basin (`flood_space`):** Bennington Lake, the Corps'
off-channel basin on Mill Creek, whose inventory purposes are flood risk
reduction and recreation and which stayed between 5% and 18% of full.

**Ordinary storage:** Dworshak Reservoir, which refills every spring (ADR-156
names it), and Willow Creek, which refills an irrigation pool. The census had
proposed both as flood space under its broader rule.

Each character is written to `admitted_cwms_reservoirs.json` with its
reviewed date, the dam's National Inventory of Dams record as its source, and
the census evidence. The daily refresh carries them to `reservoirs.json`.

**`METHOD_VERSION` does not move, and no normal is rebuilt.** ADR-156's
consequences expected both. Since then the implementation (ADR-156's
machinery, PR #137) computes an area's comparison with normal at run time
from each reservoir's own normal over the seasonal-storage line, and keeps no
committed area normal. A character changes which reservoirs are summed, not
how any normal is estimated, so every committed normal is still a correct
answer: the test ADR-072 sets for the version.

## Measured effect (2026-11-15 payload)

| Area | % full before | Seasonal storage % full | Against normal before\* | After\* |
|---|---:|---:|---:|---:|
| Lower Snake (170601) | 92% | 22% | 99% | 75% |
| Middle Columbia (170701) | 86% | 12% | 102% | 100% |
| Oregon | 36% | 19% | 84% | 68% |
| Washington | 73% | 71% | 97% | 96% |
| Pacific Northwest (17) | 64% | 61% | 93% | 92% |
| The West | 49% | 47% | 89% | 88% |

\* Summed storage over summed reservoir normals; the page's own figure is the
same sum over the reservoirs that have a normal for the period chosen.

About 3.9 million acre-feet move from the headline into "pools held at a
steady level", and 361 acre-feet into flood-control basins. Each reservoir's
own figures do not change.

## Rejected alternatives

- **John Day as ordinary storage.** Its swing would read as a water-supply
  signal in the Middle Columbia's seasonal line, which would then be one
  navigation pool and four small irrigation reservoirs.
- **Willow Creek as flood space.** It refills an irrigation pool, which
  ADR-156 keeps as ordinary storage.
- **Bump `METHOD_VERSION` as ADR-156 expected.** It would force a full
  normals rebuild that changes nothing and claim an estimator change that did
  not happen.

## Consequences

- The storage map, storage charts, filtered subtotals, share pictures,
  drainage figures, weekly figures and feeds read lower for these basins and
  for Oregon and Washington from the first refresh after merge.
- The other regions' proposals stay in the census until they are reviewed.
