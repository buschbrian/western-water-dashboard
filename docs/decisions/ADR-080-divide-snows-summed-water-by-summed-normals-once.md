# ADR-080: Divide snow's summed water by summed normals, once

- Status: Accepted
- Date: 2026-08-22

## Context

The snow half of the site and the reservoir half disagreed on the same
methodological question. `storageByArea` in `src/drought-model.ts` computes a
basin's percent full as a ratio of sums and says so in a comment — "a sum of
acre-feet in both cases, not an average of percentages." `build_rollups` in
`refresh_snowpack.py`, and `regionCurve` and `seriesOverSites` in
`src/snow-model.ts` alongside it, averaged each site's own
percent-of-normal instead.

The two agree only when every site has a similar denominator, and snow sites
routinely do not. A site whose normal median is 0.1 inches reading 4.1 inches
contributes 4,100% and, under a mean of ratios, carries as much weight as a
site whose median is 40 inches reading 30. Measured across the committed
payload: of 10,131 basin-days that clear the reporting floor, 2,005 (19.8%)
differ from the ratio of sums by more than 10 percentage points and 436 by
more than 25; published values reached 1,187% of normal.

**A second defect shared the root.** `src/snow-model.ts` already defined
`MEANINGFUL_NORMAL_INCHES` and `percentIsMeaningful`, with a comment beside
`headlineFloor` describing the failure exactly — *"in mid-October a handful of
high stations divide small readings by small normals and produce a 115% of
normal that describes almost nothing"* — but kept the floor off the curve on
the grounds that it was "a presentation rule, not a data rule". That reasoning
was backwards. A headline is a number a reader weighs against a note; the
curve is a shape, and a shape carries no note. The thin-denominator points
were never shown as text anywhere — they acted only by silently rescaling the
axis, which is how the Yakima curve came to render 29 axis labels running to
1,400% over a winter that peaked at 68.9%, with everything below 150%
occupying about a tenth of the plot height.

## Decision

**A basin percentage divides summed water by summed normals, once.**
Population: a site-day contributes when it has both a reading and a median.
The per-site `median > 0` guard goes away with the single division — a site
with real snow where none is normal genuinely belongs in the numerator, and
excluding it biased the old figure downward besides distorting its weighting.
The guard that remains publishes `None` when fewer than
`MIN_ROLLUP_SITES` contributed or the summed normal is zero or less.
`normalize_site` is untouched: the per-site percentage stays exactly as it
was, because it is a correct per-site statistic and part of the public data
API.

The same rule now runs in all three places it was computed:
`build_rollups` in the pipeline, and `regionCurve` and `seriesOverSites`
in the client. `meanNormalsByDate` already accumulated over the same
population, and `mean(v) / mean(m)` is identically `sum(v) / sum(m)`, so the
percent a curve draws finally agrees with the mean depth and mean normal the
same point carries — before, Puget Sound could show 0.17 inches against a
0.02-inch normal while publishing 150%.

**The denominator floor moves from the headline to the drawing.**
`curveForDrawing(points)` in `src/snow-model.ts` returns the same points with
`percent` nulled wherever `percentIsMeaningful` is false, and every call into
`renderSnowCurve` passes through it. `renderSnowCurve` already treats a null
as a line break rather than bridging one, so the renderer needed no change.
`newestHeadline`, `monthReadings` and the KPI path keep reading the unfiltered
points, which apply their own stricter floors. **Nothing is nulled in the
payload**: the values are honest raw data, `data.html` publishes them as a
public API, and removing fields would breach the readiness rule. The floor
belongs at the drawing layer because the drawing is where the damage was done.

**The axis step is adaptive.** `snowAxisScale` picks a gridline step from
25, 50, 100, 250 and 500 so the gridline count stays at about eight whatever
the range does, keeping the existing rule that the axis always reaches 150 so
"just under normal" cannot fill the frame and read as a good year.

**The payload names its estimator.** The reservoir file carries
`METHOD_VERSION` and the drought coverage file carries `method.version`; the
snow file carried neither while this change altered every published rollup
figure. `snowpack.json` now carries a `method` block mirroring the drought
file's shape — version, estimator, reporting floor, normal period — and bumps
`schema_version` 2 → 3. Additive only downstream.

Measured result on the refreshed payload: no basin's drawable season exceeds
173.2% of normal (Kootenai), against 8,800% raw before the floor; every basin
curve's axis top is at or below 200%.

## Alternatives rejected

**Fixing only the pipeline.** The client recomputes the whole-region curve
and rebuilds narrowed payloads' series from their sites; leaving either on the
mean of ratios would have put two estimators on one page.

**Nulling thin-denominator values in the payload.** Tempting, because it
would let any consumer apply the floor — but the values are true observations,
the client can derive what it needs, and payload cost is measured gzipped
(ADR-051). A related idea, publishing `mean_normal_inches` in the rollup
series, was deferred for the same reason.

**Clamping or capping the axis instead.** A cap lies about the shape; an
adaptive step bounds the label count without touching where the line goes.

## Consequences

Every published basin-day rollup figure moved where denominators are unequal;
archive consumers comparing files across the `snow-2026-08-22-ratio-of-sums`
boundary are comparing two estimators, which is why the version string ships
with this change rather than after it.

## Related

- Extends [ADR-046](ADR-046-never-subtract-shares-with-different-denominators.md)'s
  principle in its additive direction: shares with unequal denominators do not
  average any more than they subtract.
- Follows [ADR-059](ADR-059-not-measured-is-not-no-drought.md): null means not
  measured, and the curve keeps its holes rather than bridging them.
- Method rule recorded in
  [`docs/architecture/hydrology-methods.md`](../architecture/hydrology-methods.md).
