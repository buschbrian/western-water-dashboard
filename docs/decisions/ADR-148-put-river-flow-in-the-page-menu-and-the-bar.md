# ADR-148: Put river flow in the page menu and the bar

- Status: Accepted
- Date: 2026-10-31
- Supersedes: ADR-136's reader-surface clause (reached from the methods
  glossary and the data page, not from the bar); the rest of ADR-136 stands
- Relates to: ADR-119 (the lakes page, still reached from methods and data
  only), ADR-120 and ADR-086 (the first-visit chooser and the place chooser),
  ADR-045 (each page named for its subject)

## Context

ADR-136 put `rivers.html` on the methods glossary and the data page only,
"not from the bar, as ADR-119 did for the lakes". Its reasons were a branch
then rewriting the page header, and a page of four shaped gauges with no
comparison. Both have changed: the header rewrite landed, and ADR-144 and
ADR-145 compare four natural gauges with normal. The 2026-10-31 display review
(question Q7) found the page reachable from two documentation pages only, so a
reader who does not open methods never finds the newest dataset.

The owner's ruling (U8, 2026-10-31): river flow goes in the header menu, and
not in the first-visit chooser.

## Decision

**River flow is a seventh entry in the page table** (`PAGES` in
`src/ui/page-header.ts`), between Drought and Methods, so the narrow page menu
and the wide bar offer it from the one table, as every other page link is
offered. The menu says "River flow". The button's screen-reader label is
"Open the daily river flow".

**It is not in the first-visit chooser.** The chooser asks where to start, a
place, and offers the pages a place narrows. A gauge list is not narrowed by a
place.

**The bar keeps fitting.** `calcite-navigation` clips rather than scrolls. The
storage map's bar measured 1,054 px at 1,024 px before this change (its last
action already clipped) and 1,108 px with a seventh icon. Between 64rem and
72rem every page-link button shows its icon alone; the river flow button keeps
its icon alone up to 75rem, the first width where its label fits beside the
other six. The menu below 64rem is unchanged in form. Each button keeps its
`label` for a screen reader at every width.

## Rejected

- **A "More" menu at wide widths.** A second menu beside six buttons is two
  ways to reach pages, and the bar's rule is that exactly one of the menu and
  the buttons shows at a width.
- **Fold river flow under Methods.** It is a reading page, not documentation.
- **Text on every button at every wide width.** The storage map's bar clips
  its panel actions at 1,024 px.
- **The chooser.** See the decision; the owner ruled it out.

## Consequences

Every page's header links to `rivers.html`, carrying the place like every
other link (ADR-103). The lakes page stays off the bar (ADR-119). The browser
suite's page-menu checks list seven pages and six buttons at wide widths, and
measure the river flow button against the viewport with the others. Between
1,024 and 1,151 px a sighted reader sees every page link as an icon alone,
which costs some recognition there; each keeps its label for a screen reader.
