# ADR-086: Open the place chooser from every page header

## Status

Accepted

## Date

2026-08-23

## Context

The first-visit chooser already asks two useful questions in one place: which
subject to open and whether to start from a state, a hydrologic region, or the
whole west. It also builds the destination from an empty query string, so a
new choice does not inherit a selected reservoir, reporting filter, date,
chart order, or another page-owned setting.

Its only way back was a **Choose another place** button inside the storage
map's analysis panel. The chooser could send a reader to snow or drought, but
neither destination could reopen it. Storage charts, methods, data, and one-
reservoir pages could not reach it at all. This made a site-level navigation
tool look like one map's filter.

The shared Calcite navigation clips instead of scrolling. At phone width its
page links already collapse into one menu because another full-width header
button would be cut off.

## Decision

**Every page that carries the shared header can open the same place chooser.**

- A wide header carries a compact **Choose another place** action.
- At the width where page links collapse, that action moves into the existing
  page menu. It does not occupy a second mobile-header slot.
- The chooser offers four destinations: storage map, storage charts,
  snowpack, and drought.
- Picking a destination and place starts from an empty query string, remembers
  the chosen place, and writes only the place parameters needed by the new
  page. This is the requested reset: page-owned filters and selections do not
  travel into the new view.
- State and region choices come from `reference.json`. A page that cannot load
  that export hides the action rather than opening an empty chooser.
- The automatic first-visit question remains limited to the storage map and
  retains its existing rule: it never opens over any query string, a stored
  place, or a previous dismissal. The header action is explicit and may open
  the chooser at any time.

No new URL parameter is introduced. The chooser navigates through the same
`?state=` and `?area=` contract the place menus already use.

## Alternatives considered

**Keep the action in the storage panel.** Rejected because the chooser already
navigates between subjects and resets a view; it is site navigation, not a
storage analysis filter.

**Add a full text button to the phone header.** Rejected because the header
clips rather than scrolls. The existing page menu is the one bounded place for
optional navigation at that width.

**Carry the current query into the chosen destination.** Rejected because the
reader explicitly asked to start again. Only the newly selected place belongs
in the destination.

## Consequences

The storage panel loses its `reopen` slot. All shared-header surfaces load the
same chooser builder, and browser verification covers both the direct header
action and its mobile-menu form. The methods and data pages may make one small,
deadline-bounded reference request after their own content is already usable;
failure costs the chooser only.

## Related

- Extends ADR-084's two place menus with one site-level way to start over.
- Keeps ADR-068's four scope questions separate: the chooser changes selected
  scope and does not move the default, roster, or opening contracts.
