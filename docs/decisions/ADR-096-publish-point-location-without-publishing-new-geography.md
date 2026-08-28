# ADR-096: Publish point location without publishing new geography

## Status

Accepted

## Date

2026-08-27

## Context

Each reservoir and snow station already carries a WGS84 point and a HUC-6
assignment. The payloads also carry the HUC-2 and HUC-4 name rosters used by
the place controls. The interface showed only the HUC-6 name in a few detail
rows and offered CSV files, so a reader could not see the full containment
path, copy a coordinate, or take the visible points into GIS software.

The reservoir payload contains two point concepts. `lat` and `lon` are the
published waterbody point. `huc_assignment_point`, where present, is the dam
or outlet point used to assign drainage. They may disagree, and one label
must not make them look interchangeable. Publishing client-built watershed
polygons would also conflict with ADR-048 and ADR-049: the browser owns
assignments and hosted services own shapes.

## Decision

**Detail surfaces show the existing point and its containing hydrologic path;
table surfaces export their visible points as GeoJSON.**

- A hydrologic path is Region, Subregion and Basin. Parent codes are the first
  two and four digits of the verified six-digit HUC code. Parent names come
  from the payload's own `regions` and `subregions` rosters. A missing name is
  left missing; the client never invents a geography table.
- Reservoir coordinates are labelled **Published point**. Snow coordinates
  are labelled **Station point**. Decimal degrees show five places and a
  hemisphere; degrees, minutes and seconds are shown beside them. Copying
  produces plain `latitude, longitude` decimal values.
- The optional reservoir dam or outlet assignment point is not silently
  substituted for the published point. Any future surface that shows it must
  label it as a different fact.
- The Storage and Snowpack table exports write GeoJSON `FeatureCollection`
  point features in WGS84 longitude-first order, `[lon, lat]`. They contain
  exactly the rows currently visible and keep raw numeric values in named
  properties.
- A reservoir feature uses its provider station or item identifier as its
  feature identity. A snow feature uses its station identifier.
- No watershed polygon is created, copied from a hosted layer, or included in
  these downloads.

## Alternatives considered

**Publish the HUC-6 name only.** Rejected because it hides the containment
already encoded in the code and named by the payload rosters.

**Show the dam point as the reservoir coordinate.** Rejected because it
answers where stored water leaves, not where the published waterbody point
lies. The payload keeps both because they answer different questions.

**Export watershed polygons with the points.** Rejected because it would
make the browser a second publisher of boundary geometry and make a filtered
point download much larger and less precise in purpose.

**Export every payload record regardless of the table.** Rejected because
the existing download promise is that the file contains the visible rows in
their visible order. GeoJSON keeps the same contract as CSV.

## Consequences

The storage details panel carries compact HUC rows and the reservoir and snow
detail pages carry the full path, decimal coordinates, DMS coordinates and a
copy action. The Storage and Snowpack tables gain GeoJSON downloads beside
their existing table controls. Serializers are pure and unit-tested for row
order, raw values and longitude-first geometry.

## Related

- Keeps ADR-048 and ADR-049's boundary ownership unchanged.
- Applies ADR-058 and ADR-060's rule that one point cannot answer every place
  question.
- Keeps ADR-089's structured-export approach and ADR-066's source identity.
