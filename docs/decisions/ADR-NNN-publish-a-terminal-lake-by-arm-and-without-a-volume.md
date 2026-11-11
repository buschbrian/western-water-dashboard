# ADR-NNN: Publish a terminal lake by arm, and without a volume where none is reviewed

- Status: **Proposed** (for Brian Busch's approval; no number claimed until it lands)
- Date: 2026-11-11
- Extends: ADR-112 (terminal lakes as a separate water type), ADR-118 (their own roster and payload)

## Context

ADR-112 and ADR-118 admitted terminal lakes with two measurements, an elevation and a volume, each with its own provenance. Walker Lake is the only one published. Three are held, each for a limit of that shape:

| Lake | Held because |
| --- | --- |
| Great Salt Lake | Separately measured arms. One point and one volume would collapse waters the survey measures apart (ADR-112). |
| Pyramid Lake | A strong elevation series and no reviewed modern volume relation. The roster requires a volume block. |
| Mono Lake | Its restoration level is a State Water Resources Control Board target, not a capacity. ADR-112 allows a target only as a named target. |

Brian ruled on 2026-11-11 to build the representation Great Salt Lake and Mono need. Great Salt Lake is the lake Utah readers will ask about.

## Decision (proposed)

1. **A lake record may carry arms.** Each arm has its own reviewed point and its own elevation block (datum named), plus a volume block where the survey publishes one for that arm.
   - The lake's headline is a named list of its arms: for Great Salt Lake, the South Arm and the North Arm.
   - No combined level is computed, because the arms stand at different elevations behind the causeway.
   - A combined volume is published only where the survey publishes one.
2. **The volume block is optional.** A lake may publish elevation only, with its datum, changes and same-date rank (ADR-118). It then carries no volume and says so. Pyramid and Mono qualify on that alone.
3. **A target is a named line, never a denominator.** A lake with a regulatory or restoration target shows it beside the elevation: "Target: 6,392 ft, State Water Resources Control Board Decision 1631 (1994)". That figure and decision are to be confirmed against the decision text before release, and the gap is in feet. There is no percent of the target.
4. **Rollups don't change.** Terminal lakes stay out of reservoir counts, combined storage and percent-full rollups (ADR-112).
5. **Every arm and every target is reviewed evidence.** The roster names the survey site, parameter, statistic, unit and datum for each arm, and the authority and date for each target. The loader refuses a target stored as capacity.

## Consequences

- `admitted_terminal_lakes.json` gains an `arms` list and an optional `volume`. `pipeline/lakes.py` and its validator follow, and `lakes.json` moves to a new structure version.
- The data needs a reviewed answer before Great Salt Lake ships:
  - the USGS sites for each arm (South Arm at Saltair, North Arm at Saline) and their datums;
  - whether a reviewed volume relation exists per arm.
- Mono needs its elevation source reviewed (Los Angeles DWP, USGS or the Mono Lake Committee's record) and the target's decision text cited.

## Rejected alternatives

- **One point and one volume for Great Salt Lake.** ADR-112 refused it, and the arms differ by feet and in salinity.
- **Divide Mono's level by its target.** A percent of a regulatory target reads like a percent full, which ADR-112 forbids.
- **Leave Pyramid held until a volume relation exists.** The elevation series is strong now, and a missing volume is better stated than hidden.
