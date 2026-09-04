# ADR-111: Use the current operating limit as full

- Status: Accepted
- Date: 2026-09-04
- Qualifies: ADR-070

## Context

The dashboard calls the denominator a full level. ADR-070 prefers the
operator's own figure because it describes what full means in operation, while
NID may describe another dam pool. A dam-safety restriction makes the same
distinction explicit: the reservoir can physically hold one amount but may
currently be operated only to a lower amount.

Vail Lake is physically 45,207 acre-feet at its spillway. Rancho California
Water District is limited to 31,395 acre-feet under its current interim
operating restriction. Calling 45,207 “full” while the restriction is active
would make a reservoir at its allowed limit read 69% full.

This is not isolated. California's September 2025 reservoir-restriction report
intersects at least fifteen currently published dams. Three published Valley
Water reservoirs alone would move from a combined 121,464 acre-feet to 19,474
under the district's January 2026 limits: Anderson 89,073 to 3,159, Calero 9,850
to 4,472, and Coyote 22,541 to 11,843. Other restricted dams need their
operator's actual acre-foot limits researched before their effect is known.

The current payload carries one capacity. Its twelve monthly percentages are
all computed against that current figure, so changing a denominator today also
changes how prior months appear. A restriction that starts or ends must not
rewrite what “full” meant on the earlier observation date.

## Decision

While an enforceable or owner-adopted operating restriction is active, its
acre-foot limit is the headline full level. Physical capacity remains separate
metadata and is never discarded.

Every restricted full level must carry the authority, source URL, date checked,
effective start date and, when known, end date. A statement that a restriction
exists is insufficient when it does not publish the corresponding acre-foot
limit.

Capacity is time-versioned. A historical observation is divided by the full
level effective on that observation date. Current maps and rollups use the
version effective on the observation's `as_of` date. Ending a restriction adds
a new version; it does not overwrite the restricted period.

The version applies to percent-full calculations and full-level reference
lines. Storage changes and seasonal comparisons remain in acre-feet and are
unchanged. Regional totals use the effective full level of each included
observation, so the denominator and numerator describe the same date.

No current denominator changes until the roster can retain the physical
capacity and dated operating versions and the operator's acre-foot limit has
been reviewed.

## Consequences

The current roster needs a restriction audit. California provides a useful
statewide index of affected dams, but the operator remains necessary for the
actual restricted volume. Other states and federal projects need equivalent
authority checks.

The payload and client need one compact capacity-history array per affected
reservoir. This is preferable to copying a capacity into every monthly point;
the client can select the dated interval and provenance stays in one place.

Vail is eligible after this representation is implemented. Success Lake's
March 2025 enlargement uses the same version mechanism in the other direction:
the earlier and later full levels can coexist without applying today's larger
pool to 2019.

## Rejected alternatives

- **Always use physical capacity.** It understates fullness while an operator
  is legally or voluntarily limited to a lower safe pool.
- **Replace physical capacity with the restriction.** It loses a stable fact
  about the structure and makes restoration of full operation look like a new
  reservoir.
- **Apply today's denominator to all history.** It rewrites earlier percentages
  whenever a restriction starts, ends or a spillway is enlarged.
- **Exclude restricted reservoirs.** Their storage remains a real and useful
  measurement; the denominator, rather than roster membership, needs to state
  the operating condition.
