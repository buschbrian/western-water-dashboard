# ADR-110: Accept reviewed water reports without a dam inventory record

- Status: Accepted
- Date: 2026-09-04
- Supersedes: ADR-099
- Qualifies: ADR-003 and ADR-015

## Context

The National Inventory of Dams is the default source for dam identity and full
level, but it is not a complete catalogue of every controlled western water.
ADR-099 admitted one Montana reservoir from owner-operated metadata when NID
had no corresponding record. Its loader check deliberately named that one
provider, leaving every later case to another decision.

Topaz Lake demonstrates why the exception is a class rather than one Montana
station. USGS water-data reports repeatedly define the reported series as
59,440 acre-feet of usable storage between the lowest practical outlet-tunnel
diversion and a level three feet below the levee crest. NRCS independently
publishes a 59.4-thousand-acre-foot capacity, the Walker River Irrigation
District identifies Topaz as one of the two storage reservoirs it operates,
and Nevada describes the lake as an impoundment used for irrigation storage.
NID's silence does not contradict those sources.

Requiring NID in this case would make inventory coverage, rather than evidence
quality, decide whether a real measurement can be published.

## Decision

A reservoir may be admitted without an NID record when a reviewed government
water report or owner-operated record supplies all facts NID would have
supplied:

1. an unambiguous facility identity and location;
2. the meaning and units of the reported storage series;
3. a full level defined on the same storage basis as that series; and
4. the controlled works that make the water a reservoir.

The roster must say that the NID search found no corresponding record. It must
retain the source name, URL, date checked, selected full level, its units and
semantic description. A blank `nid_id` alone is not evidence that a search ran.

Two agreeing authoritative sources are preferred where they exist. Agreement
does not replace semantic review: several sites repeating a number derived from
the same USGS table still count as one measurement lineage. One first-party
source can be sufficient when it defines the observations and their full level
together, as USGS does for Topaz.

This rule accepts evidence; it does not waive recency, spike, geography,
identity-collision or source-quality screens.

## Consequences

ADR-099's Montana admission becomes the first instance of this general rule.
Topaz has enough evidence for admission once its roster entry, current refresh,
normal baseline and reviewed waterbody point are delivered together.

The loader should validate an evidence class rather than a list of specially
named providers. Until that implementation lands, this decision changes no
published reservoir and no generated payload.

## Rejected alternatives

- **Require NID for every reservoir.** This treats an inventory omission as a
  finding against stronger first-party measurement evidence.
- **Accept any site that prints a capacity.** A number without series semantics
  can describe total volume, usable storage, flood surcharge or a legal
  withdrawal allowance. Those are not interchangeable.
- **Require two independent sources in every case.** Independent agreement is
  valuable but unavailable for some operator-defined pools. The publisher
  that defines both its series and full level can provide a stronger semantic
  match than two secondary catalogues repeating the same number.
