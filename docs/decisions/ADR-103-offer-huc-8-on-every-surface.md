# ADR-103: Offer HUC-8 on every surface

- Status: Accepted
- Date: 2026-08-29

## Context

ADR-088 offered HUC-8 subbasins on the drought page first, and said why not
everywhere: "the condition is a figure behind every offered area, not a
boundary that can be drawn." Drought met it because its roster of measurable
areas is the published roster itself. Storage and snow did not, for a reason
that was structural rather than a matter of cost: every reservoir and every
snow site carried a six-digit `huc6`, and both pages regroup records for a
coarser level by slicing that code (`huc6.slice(0, level)`). A subbasin code
is eight digits and is a prefix of nothing, so there was no honest way to put
a storage or snow figure behind a subbasin without a finer assignment for
every point.

ADR-064 had deferred the level for the hosted outline cost -- 571 areas is
eight times HUC-6 -- and for the archive question. Drought has drawn those
outlines since 2026-08-23 without incident, and the drought archive question
was answered there: HUC-8 starts without one (ADR-088). Neither reason
survives for the other two pages.

What remained was the assignment. The boundary file (`west-huc8`, 571
subbasins) is committed and reviewed; the pipeline already assigns each
reservoir a basin from its dam or outlet point, and each snow site from its
station point. Asking the same point the same question one level finer is
the same method at a finer key, which is exactly how ADR-088 described
drought's HUC-8 coverage.

## Decision

**Every surface offers levels 2, 4, 6 and 8.** `DRAWN_SCOPES` gains
`west-huc8`; `drought_scopes` is kept as a published field of the reference
export and no longer differs from `drawn_scopes`.

**Each reservoir and each snow site carries its subbasin beside its basin**,
as `huc8` and `huc8_name`. The reservoir's subbasin is assigned from the same
point as its basin, divide fallback included, so the two codes cannot
disagree about which ridge the water leaves over. The snow site's is assigned
at refresh time from the committed level-8 scope by the station's own point,
so an inventory written before the field existed still publishes it. Both
fields are optional in the client contract and null when no subbasin outline
holds the point; `huc6` is untouched, because it is a contract with every
saved payload and every saved link.

**A subbasin figure is a regrouping of records at their own finest key, never
a slice.** `drainageCodeAtLevel` in `src/data/huc.ts` is the one place that
answers "this record's code at this level": a slice of `huc6` for anything
coarser than the basin, the record's own `huc8` for the subbasin, and null --
the record left out -- when it has none. A six-digit code filed among
eight-digit ones would draw as an area nothing on the map is named for.

**Each payload publishes a `subbasins` name table** beside `subregions` and
`regions`, built from the records' own `huc8` codes. It is the one roster
that cannot be rolled up from the basins below it.

**Snow keeps its reporting floor at level 8.** The client regrouping carries
the pipeline's minimum-reporting-sites floor down rather than lowering it, so
a subbasin with one station reads "not measured" (ADR-059). Many will. That
is the honest answer for one station's worth of snow, and it is the same
gating rule ADR-085 already applies at the drawn tier.

**A link no longer coarsens between pages.** `portableSearch` carried an
eight-digit `?area=` and `?level=8` only to drought and methods, and cut them
to the basin for storage and snow; every page now carries them whole.

## Rejected alternatives

- **Slice `huc6` and let the boundary decide.** Impossible, not merely
  wrong: an eight-digit code cannot be derived from a six-digit one.
- **Rename `huc6` to a level-neutral field.** It is read by every saved
  payload, every saved link, the frozen oracle's harness and the validators.
  A second, optional field costs two keys per record and breaks nothing.
- **Publish HUC-8 rollups from the snow pipeline instead of regrouping in
  the client.** The client already regroups levels 2 and 4 from sites with
  the pipeline's own rule and floor (ADR-081's one-implementation concern
  was settled by carrying the rule, not by duplicating the estimator).
  Level 8 is the same arithmetic on the same sites with a different key.
- **Keep the drought-only offer.** The condition ADR-088 set is now met on
  every surface, and a level a reader can choose on one map and not another
  is the "two answers to one question" ADR-064 was written against.

## Consequences

- Storage and snow readers can choose Subbasins from the level control, pick
  a subbasin row from the Drainage-area menu, and arrive by a `?level=8`
  link. The storage map draws the 571 outlines the drought map already
  draws.
- `reservoirs.json` and `snowpack.json` each gain two small fields per
  record and one name table. `reference.json` does not change; the HUC-8
  roster was already in it.
- `huc.subbasin_roster` and `huc.load_units_at` join the drainage helpers;
  `describe` takes the finer units as an argument.
- A reservoir or site the finer scope does not hold is absent from every
  subbasin figure and present in every coarser one. The refresh logs count
  them the way they count basin assignment.
- The HUC-8 drought archive question is unchanged: still no `previous`
  block, still a separate decision (ADR-088).

## Related

- Extends ADR-064 and ADR-073's offered levels to a fourth on every surface.
- Extends ADR-088 from drought to storage and snow; that record's method and
  reference-size decisions stand.
- Leaves ADR-085's snow gating in force at the drawn tier, including level 8.
- Applies ADR-050 (the drawn level is the scope's) and ADR-048 (rosters, not
  polygons) unchanged.
