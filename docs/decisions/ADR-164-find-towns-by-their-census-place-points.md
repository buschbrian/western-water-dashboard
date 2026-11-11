# ADR-164: Find towns by their Census place points

- Status: **Proposed** (for Brian Busch's approval)
- Date: 2026-11-11

## Context

The November product-review plan chose town search without a live geocoder.
The existing search offers reservoir, drainage and snow-site names. ADR-103
publishes drainage levels 2, 4, 6 and 8; ADR-036 keeps search on our own host.
A town boundary can cross a drainage divide, and a drainage area does not
establish a water-supply service area.

## Decision

Use the Census Bureau's [2026 national places gazetteer](https://www.census.gov/geographies/reference-files/time-series/geo/gazetteer-files.2026.html).
Its internal point assigns each place in the eleven western states to the
committed level-8 drawn scope through the existing point-in-polygon helper.
Do not guess a nearest area for a point outside coverage. Names drop only the
terminal legal suffix city, town, village, CDP or municipality. Census place
identifiers remain distinct, including identical names within one state.

Towns only fill the result space that reservoirs, drainage areas and snow
sites leave, so adding them never moves or removes an existing result. Enter
decides on the existing kinds first and opens a town only when none matched.
The search shows existing places as soon as their index loads and adds towns
when the separate town file arrives.

`tools/build_town_index.py --input <downloaded-zip>` writes the separate
`data/assistant/towns.json` reference from the source alone, and refuses
a different source vintage without a reviewed migration. It carries the
source, vintage and check date. The first output contains 4,283 places,
289,002 raw bytes and 48,735 gzip bytes; its enforced budget is 96 KiB gzip.
No polygons or coordinates travel to the browser.

Search fetches the town reference with the existing index only on first
focus, using the shared deadline. Town-reference failure keeps the original
search and states that towns could not load. The original index adds each
published reservoir's existing `huc8`, with no new geographic assignment.
For a town, choose the finest published containing area with at least one
currently published reservoir, walking 8, 6, 4, 2. Never choose a nearby area.
A result says its state and that its point is in the named area. The search
also says drainage areas do not show where a town gets water.

The town's link carries the resolved `state=all`, `area`, and non-default
`level`. It opens the current topic where areas exist, otherwise storage.
No town query parameter or stored town preference is added: the destination
is an area, and sharing or later filtering it retains exactly that meaning.
Only selected geography changes; drawn, roster and opening scopes stay fixed.

## Alternatives and consequences

A live geocoder would add a host, availability and privacy dependency. Full
place boundaries would cost more and still would not establish supply areas.
A town query parameter would imply a persistent town view on pages whose
figures describe an area. These alternatives are rejected.

The Census vintage must be refreshed deliberately. Places outside the drawn
coverage are omitted. Area choices follow the current reservoir index and
can widen after a withdrawal; previously shared area links remain unchanged.
This adds a search reference, not a measured element or estimator. It
supersedes no accepted record.
