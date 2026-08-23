# ADR-093: Align drought layer actions and summary cards

## Status

Accepted

## Date

2026-08-23

## Context

ADR-092 separated drought place controls from presentation controls and put
the optional map layers below the three Map options selects. The layer row was
smaller, but it still read as a trailing fourth row instead of as the action
set for the Map options pane. Show every area already established an outlined
action treatment in the card's upper-right corner.

The four drought summary cards had a second alignment problem. Their values
were forced onto one line. A long value such as Exceptional drought could draw
through the next card at medium widths. The extreme-or-worse card also carried
a much longer heading and note than the other three, so equal card boxes did
not produce an equal reading rhythm.

## Decision

**Map-layer choices become upper-right actions in the Map options pane, and
the drought summary uses aligned text rows.**

- The Map options heading and the two layer choices share one header row.
- Show reservoirs and Show snowpack sites use the same outlined-action visual
  language as Show every area, but remain inside Map options because they
  change map layers rather than place scope.
- At phone widths the two layer actions share a row below the Map options
  heading. The three selects still stack below them.
- Each drought summary card reserves the same height for its heading and
  value. Long condition names may wrap inside that value row.
- The second summary heading becomes Extreme or exceptional areas. Its note
  names D3 or D4 and states partial coverage in fewer words. The count and its
  method do not change.

## Alternatives considered

**Put the layer actions beside Show every area.** Rejected because the reset
changes place and URL state, while the layer actions change only what the map
draws. Matching their visual treatment gives congruency without mixing their
scope.

**Keep the layer actions below the selects.** Rejected because their trailing
position reads as another filter row and leaves the Map options heading
without its actions.

**Clip or reduce a long condition value.** Rejected because the worst class is
the summary's primary result. It must remain readable at every supported
width.

## Consequences

The two control panes keep their semantic separation while their upper-right
actions now use one visual language. Drought summary values and notes stay
inside equal-height cards at wide, medium and phone widths.

No payload, URL parameter, drought calculation or map-layer behavior changes.
Browser coverage must measure card containment and the layer-action position.

## Related

- Supersedes only ADR-092's layer-control placement.
- Keeps ADR-092's place and presentation panes and its three-select grid.
