# ADR-174: Count river gauges on the rivers share picture

- Status: Accepted (Brian Busch, 2026-11-23)
- Date: 2026-11-23
- Extends: ADR-154 (the share frame and its capture), ADR-168 (every bulk-queue river gauge)
- Relates to: ADR-136 and ADR-145 (the rivers page and its groups), ADR-144 (the five flow classes)

## Context

The rivers page's share picture, `share/page-rivers.png`, put one line on the
frame for each gauge: its name, its flow and its reading date. With four
gauges that fit. ADR-168 made it 142. The frame is 1200 by 630 pixels, and on
2026-11-23 the drawn document was 1200 by 5317, so the capture failed every
deploy and the picture kept its figure-free fallback (issue #157). No font
size or spacing puts 142 lines in the frame.

## Decision

**The rivers picture gives counts, not one line per gauge.** Brian Busch chose
this on 2026-11-23.

- The figure stays the number of published gauges.
- The lines say the newest reading date; how many gauges are compared with
  normal, with a count for each of the five flow classes that has one; how
  many natural gauges are not compared, on one line for each reason the page
  gives (10 years of record or fewer, or no normal for this date); and how
  many show flow only because dams are upstream.
- The footer keeps the source and the count of gauges with late data.
- The counts come from the page's own model (`groupGauges`, `summaryDate`,
  `FLOW_CLASS_WORDS`), so the picture and the page cannot disagree about a
  gauge's group or class.

## Rejected alternatives

- **Keep the fallback and stop reporting it.** The link preview would show no
  figure at all, and the issue would hide a real gap.
- **List the first gauges and say how many more.** Any cut favours some rivers
  over others, and the page has no order that makes one gauge more important.
- **Smaller type or two columns.** 142 lines still do not fit, and the next
  roster growth breaks it again.

## Consequences

- The picture no longer gives any single gauge's flow; a reader opens the page
  for that.
- The frame's size no longer grows with the roster, so admitting more gauges
  does not break the capture.
- The page itself does not change.
