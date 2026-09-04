# Architecture decision records

Why the project is built the way it is. Code shows what was built; these
explain why, and what was rejected on the way.

Each record is written when the decision is made and **not edited afterwards**
except to change its status. When a decision changes, add a new record that
supersedes the old one — the history is the point. The procedure is
[`.claude/skills/adr/SKILL.md`](../../.claude/skills/adr/SKILL.md).

Index checked 2026-08-27. Current architecture is described in
[`docs/architecture/`](../architecture/README.md); these records say why it is
that way. Read the **start here** record for your domain first, then only the
records it points at — the full numeric table is at the bottom and is not
meant to be read end to end.

## Routing by domain

### Build, deploy and runtime data
How the site is built, what ships, and why the daily payload is fetched rather
than bundled. **Start with ADR-002.**

- Current: [ADR-001](ADR-001-adopt-a-build-step.md),
  [ADR-002](ADR-002-data-is-copied-never-bundled.md),
  [ADR-018](ADR-018-reference-data-ships-as-one-versioned-export.md),
  [ADR-051](ADR-051-revalidate-do-not-refetch.md),
  [ADR-052](ADR-052-write-the-snow-calendar-once.md),
  [ADR-031](ADR-031-retire-comparison-implementations-and-redirect-their-urls.md)
- Superseded, read only for history: ADR-012, ADR-019

### Reservoir admission, identity and source authority
Which reservoirs are published, how one is identified, and which figure is the
denominator. **Start with ADR-070, then ADR-072, then ADR-003.**

- Current: [ADR-003](ADR-003-capacity-from-the-national-inventory-of-dams.md),
  [ADR-015](ADR-015-confirm-a-dam-by-position-before-name.md),
  [ADR-020](ADR-020-every-published-reservoir-is-reachable.md),
  [ADR-057](ADR-057-a-dam-identifier-names-a-project-not-a-structure.md),
  [ADR-065](ADR-065-the-ceiling-is-the-largest-figure-the-record-holds.md),
  [ADR-066](ADR-066-a-reservoir-is-keyed-by-its-station-not-its-name.md),
  [ADR-069](ADR-069-deduplicate-reservoirs-by-dam-identity.md),
  [ADR-070](ADR-070-the-operators-own-full-level-is-the-denominator.md),
  [ADR-072](ADR-072-divide-by-a-figure-the-water-has-not-been-seen-above.md),
  [ADR-077](ADR-077-publish-what-drains-to-a-reservoir-as-an-upstream-set.md),
  [ADR-097](ADR-097-filter-snow-by-the-committed-upstream-set.md),
  [ADR-099](ADR-099-admit-an-operator-measured-reservoir-with-no-dam-inventory-record.md),
  [ADR-102](ADR-102-admit-the-army-corps-of-engineers-as-a-provider.md),
  [ADR-104](ADR-104-admit-lake-pleasant-from-the-central-arizona-projects-endpoint.md),
  [ADR-106](ADR-106-confirm-a-point-by-dam-position-and-never-by-a-dams-name.md)
- Freshness and withdrawal:
  [ADR-056](ADR-056-withdraw-a-reading-that-belongs-to-another-season.md)
- Procedure: [`docs/operations/source-admission.md`](../operations/source-admission.md)

### Scope, geography, levels and URL state
The four different scopes, the hydrologic level, and what a link carries.
**Start with ADR-063, then ADR-068, ADR-064 and ADR-073.**

- Current: [ADR-010](ADR-010-colorado-and-great-basin-systems-only.md),
  [ADR-013](ADR-013-count-reservoirs-whose-waterbody-intersects-utah.md),
  [ADR-017](ADR-017-map-geography-comes-from-the-drainage-areas.md),
  [ADR-044](ADR-044-the-view-envelope-is-the-views-own.md),
  [ADR-050](ADR-050-the-drawn-level-is-the-scopes-not-the-views.md),
  [ADR-053](ADR-053-scope-the-west-by-drainage-not-longitude.md),
  [ADR-062](ADR-062-admit-lake-mead-and-generalize-the-dominant-reservoir-control.md),
  [ADR-063](ADR-063-draw-the-west-and-open-on-the-roster.md),
  [ADR-064](ADR-064-offer-two-levels-and-let-the-reader-choose.md),
  [ADR-067](ADR-067-retire-the-state-mask.md),
  [ADR-068](ADR-068-move-the-roster-scope-west-and-decouple-the-opening-box.md),
  [ADR-071](ADR-071-one-drainage-area-control-to-a-page.md),
  [ADR-073](ADR-073-draw-the-regions-too-and-read-them-from-their-own-publisher.md),
  [ADR-074](ADR-074-compare-the-week-with-the-one-before-it.md),
  [ADR-076](ADR-076-nest-the-place-menus-and-let-the-heading-carry-the-state.md),
  [ADR-085](ADR-085-gate-snows-drainage-rows-to-the-drawn-tier.md),
  [ADR-086](ADR-086-open-the-place-chooser-from-every-page-header.md),
  [ADR-087](ADR-087-retire-the-utah-reservoir-scope.md),
  [ADR-088](ADR-088-offer-huc-8-on-drought-first.md),
  [ADR-103](ADR-103-offer-huc-8-on-every-surface.md),
  [ADR-090](ADR-090-remove-retired-readiness-fields-with-the-controls.md),
  [ADR-091](ADR-091-order-drought-place-filters-from-state-to-area.md),
  [ADR-092](ADR-092-separate-drought-place-controls-from-presentation-controls.md),
  [ADR-093](ADR-093-align-drought-layer-actions-and-summary-cards.md),
  [ADR-094](ADR-094-order-snowpack-place-controls-and-separate-site-options.md),
  [ADR-095](ADR-095-order-storage-map-place-filters-from-state-to-area.md),
  [ADR-096](ADR-096-publish-point-location-without-publishing-new-geography.md),
  [ADR-097](ADR-097-filter-snow-by-the-committed-upstream-set.md),
  [ADR-105](ADR-105-open-on-the-areas-the-map-draws.md),
  [ADR-108](ADR-108-apply-reviewed-waterbody-points-without-refreshing-readings.md)
- Boundary sourcing: [ADR-024](ADR-024-use-full-resolution-watersheds-for-snow-sites.md),
  [ADR-034](ADR-034-hosted-boundary-layers-with-a-deadline.md),
  [ADR-037](ADR-037-refetch-the-boundaries-at-the-resolution-the-source-stops-adding.md)
- Superseded, read only for history: ADR-005, ADR-009, ADR-011, ADR-014,
  ADR-084
- Current architecture: [`docs/architecture/scopes.md`](../architecture/scopes.md)

### Measurement method and statistical honesty
What a published number means and what may not be done to it. **Start with
ADR-041.**

- Current: [ADR-041](ADR-041-let-the-reader-choose-the-comparison-period.md),
  [ADR-046](ADR-046-never-subtract-shares-with-different-denominators.md),
  [ADR-055](ADR-055-measure-area-geodesically-and-keep-the-sampler-spherical.md),
  [ADR-058](ADR-058-assign-the-county-from-the-water-not-the-dam.md),
  [ADR-059](ADR-059-not-measured-is-not-no-drought.md),
  [ADR-060](ADR-060-three-questions-about-a-state.md),
  [ADR-081](ADR-081-divide-snows-summed-water-by-summed-normals-once.md),
  [ADR-082](ADR-082-publish-a-drought-severity-and-coverage-index.md),
  [ADR-083](ADR-083-anchor-the-monthly-normal-window-once-per-chart.md),
  [ADR-100](ADR-100-a-sub-daily-providers-day-is-its-last-reading.md)
- Current architecture: [`docs/architecture/hydrology-methods.md`](../architecture/hydrology-methods.md)

### Visible language, accessibility and naming
**Start with ADR-006.**

- Current: [ADR-006](ADR-006-simplified-technical-english.md),
  [ADR-026](ADR-026-quote-machine-identifiers-in-api-documentation.md),
  [ADR-036](ADR-036-accessibility-is-a-gate-and-a-measured-content-policy.md),
  [ADR-045](ADR-045-name-the-site-for-the-water-and-each-page-for-its-subject.md),
  [ADR-078](ADR-078-every-water-this-site-measures-is-a-reservoir.md),
  [ADR-079](ADR-079-rename-through-a-former-name-table-and-publish-the-operator.md),
  [ADR-089](ADR-089-put-reservoir-state-facts-in-their-own-csv-columns.md)

### Symbology, cartography and map interaction
Colour tables, label placement, layer order and basemaps. **Start with
ADR-008, then ADR-032 and ADR-061.**

- Colour: [ADR-008](ADR-008-one-class-break-table.md),
  [ADR-028](ADR-028-use-equal-bands-and-a-colorblind-safe-ramp.md),
  [ADR-032](ADR-032-one-colour-language-per-map-across-pages.md),
  [ADR-038](ADR-038-split-the-snow-classes-and-move-to-a-scientific-colour-map.md),
  [ADR-039](ADR-039-draw-percent-full-with-a-sequential-ramp.md),
  [ADR-074](ADR-074-compare-the-week-with-the-one-before-it.md),
  [ADR-075](ADR-075-draw-the-spread-chart-rather-than-configure-it.md)
- Layers and basemaps: [ADR-033](ADR-033-open-every-map-on-the-oceans-basemap.md),
  [ADR-101](ADR-101-bound-the-basemap-chain-and-draw-the-data-without-it.md),
  [ADR-042](ADR-042-sink-the-basemaps-reference-layers-below-the-data.md),
  [ADR-061](ADR-061-reference-geometry-over-continuous-data-only.md)
- Labels and symbols: [ADR-035](ADR-035-a-label-ladder-tied-to-containment.md),
  [ADR-047](ADR-047-let-the-label-engine-place-drainage-names.md),
  [ADR-048](ADR-048-publish-the-roster-not-the-polygons.md),
  [ADR-049](ADR-049-stop-publishing-the-drainage-polygons.md)
- Views and interaction: [ADR-021](ADR-021-snow-telemetry-goes-on-a-view-of-its-own.md),
  [ADR-023](ADR-023-fill-the-empty-drainage-areas.md),
  [ADR-029](ADR-029-the-table-narrows-where-the-map-dims.md),
  [ADR-040](ADR-040-open-the-snow-map-on-the-season-peak.md),
  [ADR-086](ADR-086-open-the-place-chooser-from-every-page-header.md)
- Superseded, read only for history: ADR-007, ADR-016, ADR-022, ADR-025,
  ADR-027, ADR-030, ADR-043, ADR-054
- Current architecture: [`docs/architecture/frontend.md`](../architecture/frontend.md)

### Credentials and third-party services
**Start with ADR-004.**

- Current: [ADR-004](ADR-004-no-api-key-and-refuse-credential-challenges.md),
  [ADR-098](ADR-098-use-a-pipeline-only-key-for-the-usgs-ogc-service.md)
- Superseded, read only for history: ADR-080

## Every record, in order

| | Decision | Status |
|---|---|---|
| [ADR-001](ADR-001-adopt-a-build-step.md) | Adopt a build step, retiring the zero-build constraint | Accepted |
| [ADR-002](ADR-002-data-is-copied-never-bundled.md) | Runtime data is copied into the published output, never bundled | Accepted |
| [ADR-003](ADR-003-capacity-from-the-national-inventory-of-dams.md) | Take reservoir capacity from the National Inventory of Dams | Accepted; ADR-070 prefers the operator's own figure where there is one, ADR-099 admits one reservoir the inventory has no record of |
| [ADR-004](ADR-004-no-api-key-and-refuse-credential-challenges.md) | Run the ArcGIS map without an API key, and refuse credential challenges | Accepted; narrowed by ADR-098 for pipeline-only source credentials |
| [ADR-005](ADR-005-commit-generalized-watershed-boundaries.md) | Commit one generalized watershed boundary file | Superseded by ADR-037 |
| [ADR-006](ADR-006-simplified-technical-english.md) | Write all visible text in Simplified Technical English | Accepted |
| [ADR-007](ADR-007-two-rendering-engines.md) | Keep two rendering engines, and keep the old pages live | Superseded by ADR-016 |
| [ADR-008](ADR-008-one-class-break-table.md) | One class-break table is the single source of truth for colour | Accepted |
| [ADR-009](ADR-009-geography-is-drainage-areas-that-touch-utah.md) | The dashboard's geography is drainage areas that intersect Utah | Superseded by ADR-010 |
| [ADR-010](ADR-010-colorado-and-great-basin-systems-only.md) | Narrow the geography to the Colorado and Great Basin systems | Accepted |
| [ADR-011](ADR-011-separate-location-scope-from-lake-powell.md) | Separate reservoir location from Lake Powell inclusion | Superseded by ADR-013 |
| [ADR-012](ADR-012-build-phase-2-beside-production.md) | Build the Phase 2 shell beside the production pages | Superseded by ADR-019 |
| [ADR-013](ADR-013-count-reservoirs-whose-waterbody-intersects-utah.md) | Count reservoirs whose waterbody intersects Utah | Accepted |
| [ADR-014](ADR-014-use-the-ugrc-utah-state-boundary.md) | Use the maintained UGRC Utah state boundary | Superseded by ADR-067 |
| [ADR-015](ADR-015-confirm-a-dam-by-position-before-name.md) | Confirm a reservoir's dam by position before name | Accepted; ADR-099 accepts the operator's own location for one reservoir with no record to confirm against |
| [ADR-016](ADR-016-arcgis-is-the-primary-application.md) | Make ArcGIS the primary application and keep legacy pages for comparison | Superseded by ADR-019 |
| [ADR-017](ADR-017-map-geography-comes-from-the-drainage-areas.md) | The map's geography is derived from the drainage areas | Accepted |
| [ADR-018](ADR-018-reference-data-ships-as-one-versioned-export.md) | Capacity and geography ship as one versioned reference export | Accepted |
| [ADR-019](ADR-019-cut-over-the-root-and-chain-refresh-deploys.md) | Put ArcGIS 5.1 at the root and deploy successful refreshes | Superseded by ADR-031 |
| [ADR-020](ADR-020-every-published-reservoir-is-reachable.md) | Every published reservoir is reachable from the map | Accepted |
| [ADR-021](ADR-021-snow-telemetry-goes-on-a-view-of-its-own.md) | Snow telemetry goes on a view of its own | Accepted |
| [ADR-022](ADR-022-scale-the-reservoir-symbols-with-the-view.md) | Scale the reservoir symbols with the view | Superseded by ADR-025 |
| [ADR-023](ADR-023-fill-the-empty-drainage-areas.md) | Add reviewed sites to the empty drainage areas | Accepted |
| [ADR-024](ADR-024-use-full-resolution-watersheds-for-snow-sites.md) | Use full-resolution watersheds for snow sites | Accepted |
| [ADR-025](ADR-025-keep-map-symbols-fixed-and-label-each-drainage-area-once.md) | Keep map symbols fixed and label each drainage area once | Superseded by ADR-027 |
| [ADR-026](ADR-026-quote-machine-identifiers-in-api-documentation.md) | Quote machine identifiers in API documentation | Accepted |
| [ADR-027](ADR-027-use-css-pixels-for-map-symbols-and-opening-labels.md) | Use CSS pixels for map symbols and opening labels | Superseded by ADR-030 |
| [ADR-028](ADR-028-use-equal-bands-and-a-colorblind-safe-ramp.md) | Use equal storage bands and a colorblind-safe ramp | Accepted |
| [ADR-029](ADR-029-the-table-narrows-where-the-map-dims.md) | The table narrows where the map dims | Accepted |
| [ADR-030](ADR-030-draw-drainage-area-names-below-reservoirs.md) | Draw drainage-area names below reservoir symbols | Superseded by ADR-047 |
| [ADR-031](ADR-031-retire-comparison-implementations-and-redirect-their-urls.md) | Retire comparison implementations and redirect their URLs | Accepted |
| [ADR-032](ADR-032-one-colour-language-per-map-across-pages.md) | One colour language per map, enforced across pages | Accepted |
| [ADR-033](ADR-033-open-every-map-on-the-oceans-basemap.md) | Open every map on the Oceans basemap | Accepted |
| [ADR-034](ADR-034-hosted-boundary-layers-with-a-deadline.md) | Take state and county boundaries from hosted services, against a deadline | Accepted |
| [ADR-035](ADR-035-a-label-ladder-tied-to-containment.md) | A label ladder tied to containment, shared with the symbols | Accepted |
| [ADR-036](ADR-036-accessibility-is-a-gate-and-a-measured-content-policy.md) | Make accessibility a gate, and write the content policy from measurement | Accepted |
| [ADR-037](ADR-037-refetch-the-boundaries-at-the-resolution-the-source-stops-adding.md) | Refetch the drainage boundaries at the resolution the source stops adding detail | Accepted |
| [ADR-038](ADR-038-split-the-snow-classes-and-move-to-a-scientific-colour-map.md) | Split the bottom snow class, and take the ramp from a scientific colour map | Accepted |
| [ADR-039](ADR-039-draw-percent-full-with-a-sequential-ramp.md) | Draw percent full with a sequential ramp, and free the ring from it | Accepted |
| [ADR-040](ADR-040-open-the-snow-map-on-the-season-peak.md) | Open the snow map on the season's peak snow | Accepted |
| [ADR-041](ADR-041-let-the-reader-choose-the-comparison-period.md) | Let the reader choose the comparison period, and open on the standard one | Accepted |
| [ADR-042](ADR-042-sink-the-basemaps-reference-layers-below-the-data.md) | Sink the basemap's reference layers below this project's data | Accepted |
| [ADR-043](ADR-043-shade-thematic-fills-from-above-with-a-no-key-hillshade.md) | Shade thematic fills from above, with a hillshade that needs no key | Superseded by ADR-054 |
| [ADR-044](ADR-044-the-view-envelope-is-the-views-own.md) | The zoom envelope belongs to the view, not to the frozen module | Accepted |
| [ADR-045](ADR-045-name-the-site-for-the-water-and-each-page-for-its-subject.md) | Name the site for the water, and each page for its own subject | Accepted |
| [ADR-046](ADR-046-never-subtract-shares-with-different-denominators.md) | Never subtract two shares with different denominators | Accepted |
| [ADR-047](ADR-047-let-the-label-engine-place-drainage-names.md) | Let the label engine place the drainage-area names | Accepted |
| [ADR-048](ADR-048-publish-the-roster-not-the-polygons.md) | Publish the drainage roster, not the drainage polygons | Accepted |
| [ADR-049](ADR-049-stop-publishing-the-drainage-polygons.md) | Stop publishing the drainage polygons | Accepted |
| [ADR-050](ADR-050-the-drawn-level-is-the-scopes-not-the-views.md) | The drawn level is the scope's, not the view's | Accepted |
| [ADR-051](ADR-051-revalidate-do-not-refetch.md) | Revalidate, do not refetch | Accepted |
| [ADR-052](ADR-052-write-the-snow-calendar-once.md) | Write the snow calendar once | Accepted |
| [ADR-053](ADR-053-scope-the-west-by-drainage-not-longitude.md) | Scope the west by where the water goes, not by longitude | Accepted |
| [ADR-054](ADR-054-make-the-terrain-the-ground-under-the-drought-classes.md) | Make the terrain the ground under the drought classes | Superseded by ADR-061 |
| [ADR-055](ADR-055-measure-area-geodesically-and-keep-the-sampler-spherical.md) | Measure area geodesically, and keep the sampler spherical | Accepted |
| [ADR-056](ADR-056-withdraw-a-reading-that-belongs-to-another-season.md) | Withdraw a reading that belongs to another season | Accepted |
| [ADR-057](ADR-057-a-dam-identifier-names-a-project-not-a-structure.md) | A dam identifier names a project, not a structure | Accepted |
| [ADR-058](ADR-058-assign-the-county-from-the-water-not-the-dam.md) | Assign the county from the water, not the dam | Accepted |
| [ADR-059](ADR-059-not-measured-is-not-no-drought.md) | Not measured is not no drought | Accepted |
| [ADR-060](ADR-060-three-questions-about-a-state.md) | Three questions about a state | Accepted |
| [ADR-061](ADR-061-reference-geometry-over-continuous-data-only.md) | Reference geometry may sit over continuous data, never over discrete | Accepted |
| [ADR-062](ADR-062-admit-lake-mead-and-generalize-the-dominant-reservoir-control.md) | Admit Lake Mead, and generalize the dominant-reservoir control | Accepted |
| [ADR-063](ADR-063-draw-the-west-and-open-on-the-roster.md) | Draw the whole west, and open on the areas that hold reservoirs | Accepted; roster/opening coupling narrowed by ADR-068 |
| [ADR-064](ADR-064-offer-two-levels-and-let-the-reader-choose.md) | Offer two hydrologic levels, and let the reader choose | Accepted |
| [ADR-065](ADR-065-the-ceiling-is-the-largest-figure-the-record-holds.md) | The ceiling is the largest figure the record holds, plus a surcharge | Accepted |
| [ADR-066](ADR-066-a-reservoir-is-keyed-by-its-station-not-its-name.md) | A reservoir is keyed by its station, not by its name | Accepted |
| [ADR-067](ADR-067-retire-the-state-mask.md) | Retire the state mask, and stop publishing the state boundary | Accepted |
| [ADR-068](ADR-068-move-the-roster-scope-west-and-decouple-the-opening-box.md) | Move the roster scope west, and decouple the opening box from it | Accepted |
| [ADR-069](ADR-069-deduplicate-reservoirs-by-dam-identity.md) | Deduplicate reservoirs by dam identity | Accepted |
| [ADR-070](ADR-070-the-operators-own-full-level-is-the-denominator.md) | Where the operator publishes a full level, that is the denominator | Accepted; narrows ADR-003's implementation, not its reasoning |
| [ADR-071](ADR-071-one-drainage-area-control-to-a-page.md) | One drainage-area control to a page | Superseded by ADR-084 |
| [ADR-072](ADR-072-divide-by-a-figure-the-water-has-not-been-seen-above.md) | Divide by a figure the water has not been seen above | Accepted; narrows ADR-003's implementation, not its reasoning |
| [ADR-073](ADR-073-draw-the-regions-too-and-read-them-from-their-own-publisher.md) | Draw the regions too, and read them from their own publisher | Accepted; extends ADR-064 to a third level |
| [ADR-074](ADR-074-compare-the-week-with-the-one-before-it.md) | Compare the week with the one before it | Accepted; narrows ADR-063's one-archive decision |
| [ADR-075](ADR-075-draw-the-spread-chart-rather-than-configure-it.md) | Draw the spread chart rather than configure it | Accepted |
| [ADR-076](ADR-076-nest-the-place-menus-and-let-the-heading-carry-the-state.md) | Nest the place menus and let the heading carry the state | Accepted; amends ADR-058's reader-facing-label clause |
| [ADR-077](ADR-077-publish-what-drains-to-a-reservoir-as-an-upstream-set.md) | Publish what drains to a reservoir as an unordered upstream set | Accepted; precomputed against NLDI, keyed per ADR-066, geometry never published |
| [ADR-078](ADR-078-every-water-this-site-measures-is-a-reservoir.md) | Every water this site measures is a reservoir | Accepted; type follows roster membership, no per-record field, natural lakes keep their names |
| [ADR-079](ADR-079-rename-through-a-former-name-table-and-publish-the-operator.md) | Rename through a former-name table, and publish the operator | Accepted; 26 provider names normalized, old spellings resolve forever, operator searchable |
| [ADR-080](ADR-080-build-the-usgs-provider-against-the-keyless-legacy-service-now.md) | Build the USGS provider against the keyless legacy service now | Superseded by ADR-098 |
| [ADR-081](ADR-081-divide-snows-summed-water-by-summed-normals-once.md) | Divide snow's summed water by summed normals, once, and floor the curve's denominator at the drawing | Accepted; supersedes the snow rollups' mean of ratios, adds a method version to `snowpack.json` |
| [ADR-082](ADR-082-publish-a-drought-severity-and-coverage-index.md) | Publish a Drought Severity and Coverage Index over measured land | Accepted; derived client-side from published shares, thinly measured areas marked never dropped |
| [ADR-083](ADR-083-anchor-the-monthly-normal-window-once-per-chart.md) | Anchor the monthly normal window once per chart, not once per month | Accepted; narrows ADR-041's per-month rule for the live twelve-month line, no version bump |
| [ADR-084](ADR-084-two-place-menus-to-a-page.md) | Two place menus to a page: Where (state, county) and Drainage area (across levels) | Superseded by ADR-095 |
| [ADR-085](ADR-085-gate-snows-drainage-rows-to-the-drawn-tier.md) | Gate snow's drainage rows to the drawn tier and coarser | Accepted; coarser-row presentation superseded by ADR-094, publishability gate retained |
| [ADR-086](ADR-086-open-the-place-chooser-from-every-page-header.md) | Open the place chooser from every page header | Accepted |
| [ADR-087](ADR-087-retire-the-utah-reservoir-scope.md) | Retire the Utah reservoir scope | Accepted; browser-readiness compatibility clause superseded by ADR-090 |
| [ADR-088](ADR-088-offer-huc-8-on-drought-first.md) | Offer HUC-8 on drought first | Accepted; its across-level drought menu presentation is superseded by ADR-091; extended to storage and snow by ADR-103 |
| [ADR-089](ADR-089-put-reservoir-state-facts-in-their-own-csv-columns.md) | Put reservoir state facts in their own CSV columns | Accepted |
| [ADR-090](ADR-090-remove-retired-readiness-fields-with-the-controls.md) | Remove retired readiness fields with their controls | Accepted; supersedes one clause of ADR-087 |
| [ADR-091](ADR-091-order-drought-place-filters-from-state-to-area.md) | Order drought place filters from state to area | Accepted; map-options grouping superseded by ADR-092 |
| [ADR-092](ADR-092-separate-drought-place-controls-from-presentation-controls.md) | Separate drought place controls from presentation controls | Accepted; layer-control placement superseded by ADR-093 |
| [ADR-093](ADR-093-align-drought-layer-actions-and-summary-cards.md) | Align drought layer actions and summary cards | Accepted; supersedes ADR-092 only for layer-control placement |
| [ADR-094](ADR-094-order-snowpack-place-controls-and-separate-site-options.md) | Order Snowpack place controls and separate site options | Accepted; supersedes ADR-084's snow presentation and ADR-085's coarser rows |
| [ADR-095](ADR-095-order-storage-map-place-filters-from-state-to-area.md) | Order Storage map place filters from state to area | Accepted; supersedes ADR-084 for the Storage map |
| [ADR-096](ADR-096-publish-point-location-without-publishing-new-geography.md) | Publish point location without publishing new geography | Accepted; HUC path from payload rosters, visible table rows exported as WGS84 points |
| [ADR-097](ADR-097-filter-snow-by-the-committed-upstream-set.md) | Filter snow by the committed upstream set | Accepted; extends ADR-077 and keeps ADR-081's estimator |
| [ADR-098](ADR-098-use-a-pipeline-only-key-for-the-usgs-ogc-service.md) | Use a pipeline-only key for the USGS OGC service | Accepted; supersedes ADR-080 and narrows ADR-004 |
| [ADR-099](ADR-099-admit-an-operator-measured-reservoir-with-no-dam-inventory-record.md) | Admit an operator-measured reservoir with no dam inventory record | Accepted; extends ADR-003 and ADR-015 for one admission, screens unchanged elsewhere |
| [ADR-100](ADR-100-a-sub-daily-providers-day-is-its-last-reading.md) | A sub-daily provider's day is its last reading | Accepted; no method version bump, the method is unchanged and the code now performs it |
| [ADR-101](ADR-101-bound-the-basemap-chain-and-draw-the-data-without-it.md) | Bound the basemap chain, and draw the data without it | Accepted; the chain gets one 15s budget, an exhausted budget draws the reservoirs on a plain background |
| [ADR-102](ADR-102-admit-the-army-corps-of-engineers-as-a-provider.md) | Admit the Army Corps of Engineers as a provider | Accepted; eighth provider, the Columbia Basin under the `NWDP` office, republished and forecast series refused |
| [ADR-103](ADR-103-offer-huc-8-on-every-surface.md) | Offer HUC-8 on every surface | Accepted; extends ADR-088 to storage and snow, every record carries its own `huc8` |
| [ADR-104](ADR-104-admit-lake-pleasant-from-the-central-arizona-projects-endpoint.md) | Admit Lake Pleasant from the Central Arizona Project's endpoint | Accepted; ninth provider, one current record a day grown in the dense-history cache, inventory denominator with the operator's percentage recorded as a finding |
| [ADR-105](ADR-105-open-on-the-areas-the-map-draws.md) | Open on the areas the map draws, not on the box saved links resolve to | Accepted |
| [ADR-106](ADR-106-confirm-a-point-by-dam-position-and-never-by-a-dams-name.md) | Confirm a published point by dam position, and never take a dam's name for the water's | Accepted; sixth source in point review, four rows settled, Scofield's wrong coordinate stated rather than hidden |
| [ADR-108](ADR-108-apply-reviewed-waterbody-points-without-refreshing-readings.md) | Apply six reviewed waterbody points without refreshing readings | Accepted; separate outlet points retained |

## Relationship to the historical journal

[`docs/history/modernization-2026.md`](../history/modernization-2026.md) is a
journal: it changed as phases landed, and it records measurements, spikes and
things noticed while testing. These records are the opposite — each one is
fixed at the moment of decision. Where the two overlap, the journal is the
narrative and the record is the decision. Neither is current architecture;
that is [`docs/architecture/`](../architecture/README.md).
