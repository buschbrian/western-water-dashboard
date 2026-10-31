# ADR-145: Hold the first-visit shell below 256 KiB gzip

## Status

Accepted; extends ADR-120

## Date

2026-10-31

## Context

ADR-120 moved the map SDK behind the first-visit question. The shell's static
entry path now measures about 0.18 MiB gzip, but its budget still allowed
2.3 MiB. An accidental eager SDK import could undo that work without failing
the budget. The complete optional graph remains about 23.68 MiB raw and
8.26 MiB gzip; its total size answers a different question.

## Decision

Cap the real shell's static import path at 256 KiB gzip in `budget:sdk`.
Keep the existing measurement of transitive static imports, their CSS and
assets. Dynamic imports remain outside that sum. Keep the total graph's
26 MiB raw and 9 MiB gzip limits.

The cap leaves about 40% headroom above the current shell for patch releases
while refusing the deferred map SDK. A failed budget calls for examining the
new imports, not automatically raising the cap.

## Alternatives considered

Keep the 2.3 MiB cap: rejected because it no longer protects the first-visit
loading boundary. Cap the complete graph at 256 KiB: rejected because it
would measure optional maps and charts as if every first visit loaded them.

## Consequences

The existing frontend gate catches substantially smaller eager-import
regressions. SDK updates still have room to move. No runtime loading policy,
public URL, data payload, chart, or compatibility alias changes.
