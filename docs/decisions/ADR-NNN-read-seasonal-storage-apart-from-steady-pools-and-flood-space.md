# ADR-NNN: Read seasonal storage apart from steady pools and kept-empty flood space

- Status: **Proposed** (for Brian Busch's approval; no number claimed until it lands)
- Date: 2026-11-11
- Extends: ADR-114 (water type and operating character), which labelled these waters and deferred the arithmetic
- Relates to: ADR-153 (the map's storage against normal), ADR-072 (the denominator), ADR-102 and ADR-155 (the Corps)

## Context

ADR-114 decided the labels `run_of_river`, `flood_space` and `restricted`. It left two questions to "its own decision with its own measurement":
- whether a navigation pool belongs in a drainage area's combined full level;
- whether flood space should be totalled separately.

No published reservoir carries a character yet. The 2026-09-04 census proposed 78: 33 run-of-river, 30 flood space and 15 restricted. None has been reviewed.

**Measured on origin/main 4ab93fe (420 reservoirs, 2026-11-11), with the census proposals as written:**

| Area | Published today | Seasonal storage only | Steady pools, share of full level | Flood space, share of full level |
| --- | ---: | ---: | ---: | ---: |
| Middle Columbia (170701) | 85% | 12% | 95% | 1% |
| Lower Snake (170601) | 92% | 22% | 98% | 0% |
| Willamette (170900) | 25% | 55% | 3% | 92% |
| Tulare-Buena Vista Lakes (180300) | 23% | 46% | 0% | 87% |
| Clearwater (170603) | 63% | 23% | 0% | 100% |
| Upper Sacramento (180200) | 60% | 39% | 40% | 0% |
| Pacific Northwest (17) | 64% | 65% | 11% | 13% |
| California (18) | 55% | 57% | 1% | 9% |
| The West | 49% | 48% | 4% | 6% |

1. **Steady pools inflate a basin's headline.** Middle Columbia and Lower Snake read 85% and 92% because barge and power pools are held near full. Their seasonal storage is 12% and 22%.
2. **The census's flood-space rule reaches too far.** It tags Corps-operated reservoirs whose primary purpose is flood control. Willamette's Detroit (record high 426,115 of 455,000 af, peaking at 403,478 af on 2026-04-30), Green Peter and Lookout Point keep winter flood space but refill every spring for summer water. So do Tulare's Pine Flat, Kaweah and Isabella, and Clearwater's Dworshak (62% to 99.9% full over the last 12 months). They are seasonal storage with a flood rule curve, not empty basins. Treating them as flood space would hide the water supply of whole basins.

The waters that fit ADR-114's own sentence, "keeps space empty to catch floods; it is not expected to fill", are detention basins:
- Martis Creek (record high 13% of full), Mud Mountain and Seven Oaks;
- the Southern California and Arizona basins the ADR-155 audit held: Prado, Santa Fe, Sepulveda, Hansen, Whittier Narrows, Painted Rock, Alamo and others.

Their yearly peaks since 2015 stay under 25% of full even in 2023, one of the wettest years on record in Southern California.

## Decision (proposed)

1. **Narrow `flood_space` to detention.** A reservoir is `flood_space` only when its primary purpose is flood risk reduction AND it holds no conservation or supply pool that it refills each year.
   - Evidence toward the ruling: the NID purposes, the operator's description, and a record whose yearly peaks never reach a third of full. The series is evidence, never the source (ADR-114).
   - A multi-purpose reservoir with winter flood space stays unlabelled as ordinary seasonal storage.
2. **Rule by region.** The 78 proposals and the flood-space candidates ADR-155 held are reviewed one drainage region at a time, with each region's evidence side by side. A reviewed character is written to its roster with its evidence and source.
3. **Every area total splits into three lines** once a region's characters are reviewed:
   - **Seasonal storage:** ordinary and `restricted` waters. This is the headline percent full and the comparison with normal (ADR-153).
   - **Steady pools:** `run_of_river` waters, as stored volume, "held at a steady level", with no percent in the headline. A steady 95% is an operating choice, not a water-supply signal.
   - **Flood space:** `flood_space` waters, as "water held in flood space" in acre-feet with the empty space beside it, never as a percent full of the area.
4. **Each reservoir keeps its own figures.** Its own percent, record and comparison with normal stay on its card with ADR-114's sentence. Only area totals change.
5. **Admission follows the label.** `NEVER_FILLED_SHARE` stops referring a reviewed `flood_space` reservoir, as ADR-114's consequences said it would. The basins and mid-Columbia pools held for "never seen a third full" become eligible again, each on its own ruling, without moving any total.

## What a reader sees (words settled under ADR-006 before release)

| Line | Example |
| --- | --- |
| Seasonal storage | Middle Columbia: seasonal storage is 12% full. |
| Steady pools | 2.2 million acre-feet in pools held at a steady level for barges and power. |
| Flood space | 4,400 acre-feet held in flood-control basins, which are kept empty to catch storms. |

## Consequences

- Published area percentages change, most in the Middle Columbia (85% to 12%) and Lower Snake (92% to 22%). The release notes say so.
- `METHOD_VERSION` moves, and the area normals are rebuilt over seasonal storage (the `science-method-change` skill).
- Colour stays with `ReservoirViz.CLASSES` (ADR-008). A character remains panel and data, with the outline ADR-114 gave `restricted`.

## Rejected alternatives

- **Exclude steady and flood waters from totals silently.** The water is real, and a reader asking how much the Snake stores deserves the whole answer, split.
- **Keep the census's broad flood-space rule.** It would label Pine Flat and Detroit as not expected to fill, which is false every spring.
- **Classify from the series alone.** ADR-114 refused it, and a drought decade would make supply reservoirs look like detention basins.
