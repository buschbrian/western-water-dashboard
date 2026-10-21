# ADR-121: Show present snow conditions, not the season's peak

## Status

Accepted; supersedes ADR-040

## Date

2026-10-21

## Context

ADR-040 opened the snow map on the day the region held the most snow, so that
a visit late in the melt season did not open on the most depleted day. That
rule was written in August, against a complete season.

On 2026-10-21 the payload holds twenty days of water year 2027. The peak-depth
rule opened the map on 2026-10-14, a mean of 0.16 inches of snow water, and
the slider reading called it the "season high point". The summary's second
card, "Best against normal", answers a question about the whole season too,
and in October it has no qualifying day at all. Through the winter both point
a reader at a day that is not today, while the reader's question during the
accumulation season is what the snow is doing now.

## Decision

The snow page describes present conditions.

- **The map opens on the newest day at least half the sites reported.** That
  was ADR-040's fallback. Depth, not percent of normal, decides which days
  qualify, so near-zero October normals cannot refuse every day. The slider
  reading marks the opening day as the "newest day".
- **"Best against normal" becomes "Change in the last 7 days"**, in the summary
  and in a drainage area's card. It is the mean of each site's own change in
  snow water, counting only sites with a value on both days, and it states how
  many sites gained and lost snow. Paired rather than two means subtracted: a
  site that went quiet or came back would otherwise move the mean by its whole
  depth. A change that rounds to under a tenth of an inch is neither a gain
  nor a loss, because a tenth is the step the snow pillows report in. The
  figure holds the summary's own floor of half the sites in view.
- **A site's card gives its own 7-day change** in place of its season high
  point.
- **The measurement-site card counts the sites with snow on the ground** on
  the newest day. In autumn and late spring that count is the most honest
  single number on the page.
- **A "Snow by elevation" table** gives, for each band the site filter already
  offers, the sites with values, the sites with snow, the mean snow water and
  the 7-day change. Snow builds first and lasts longest at the high sites, so
  a regional mean in the shoulder seasons mostly measures how many low sites
  are bare.

Every one of these is a depth or a count from values the payload already
publishes. No estimator changes, and `method.version` does not move.

## Rejected

- **Keep the peak opening day and add the present-day figures beside it.** The
  map is the first thing a reader sees, and a map opening on a different day
  from every number around it is the confusion this record removes.
- **A percent-of-normal change** (points gained against normal over the week).
  It inherits the October denominator problem ADR-081 floors, and it moves when
  the normal moves even if no snow fell.
- **Percent of the normal season's peak** as the headline. It answers "how
  much of a normal winter's snow is already here" without the autumn
  denominator problem, but it is a new published estimator and goes through
  its own method review.

## Consequences

ADR-040's problem comes back by design: from late spring to the end of
September the map opens on a day with little or no snow, and in high summer
most sites carry no percentage because their normal is zero. That is an
accurate picture of the present. The curve, the slider and each site's season
still show the season's peak.

`?day=` is unaffected. A link without it now opens on the newest day rather
than the peak.

The page carries the same five summary cards, so the equal-height layout of
PR 75 holds.
