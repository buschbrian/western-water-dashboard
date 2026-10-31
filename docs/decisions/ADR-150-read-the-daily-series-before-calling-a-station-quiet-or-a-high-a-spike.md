# ADR-150: Read the daily series before calling a station quiet or a high a spike

- Status: Accepted
- Date: 2026-10-31
- Extends: ADR-116 (the screen still reports and a person still decides)
- Qualifies: the California audit's quiet screen and ADR-065's spike screen,
  as `tools/audit_cdec_stations.py` applies them

## Context

The California audit reads one series per station: the monthly one. That was
a measured choice -- thirty times fewer rows, and the dam-match screen only
asks how much water has ever been seen -- and the audit's own docstring says
so. Two of its screens then read more into that series than it holds.

**The quiet screen asks whether the monthly series reported within the year.**
Guadalupe Reservoir (`GDR`) answers that it did not: its monthly series holds
three months, the last in December 2021. Its daily series reports every day to
30 October 2026. The audit listed it as quiet, and the withheld note had to say
that the audit was wrong about it.

**The spike screen reads the third-highest monthly reading.** Guadalupe's three
monthly readings are 1,762, a middle month and 402 acre-feet, so the highest is
more than `SPIKE_RATIO` times the third and the screen fires. The daily series
reads 1,762 on 31 December 2021, the day the monthly value describes, after a
storm fill from 391 acre-feet on 12 December. The high is a measurement.

The same audit lists 50 stations as dormant -- listed against the storage
sensor and never answering with a monthly reading. On 2026-10-31, 24 of them
answered with a daily reading within the year.

A second question arrived the same day from the published payload rather than
the audit. Nine California reservoirs published a record high or record low no
reservoir could have set: Lake Almanor's record high was 8,918,440 acre-feet
against a full level of 1,140,000, and its record low was zero between readings
near 1,100,000. `summarize` computes both as the maximum and minimum of the
series the adapter returns, so a single bad daily reading becomes a published
figure. ADR-116's exclusions apply in the adapter and therefore already reach
those figures; what was missing was anything that would report the next one.

## Decision

**A station is quiet only when neither series has reported within the year.**
The audit reads the daily series for every station its monthly series leaves
silent or stopped (`screening_series`). Where the monthly series reports, it is
screened as before, because the screens were measured on it. Where it does not
and the daily series does, the daily series is the one screened: its readings,
its observed maximum and its three highest readings. A stopped monthly series
does not describe the reservoir; Guadalupe's three months would put its
observed maximum at 1,762 when the daily series has seen 2,175.

**A monthly high is not a spike when the daily reading on the day it describes
confirms it.** Where the spike screen would fire on a monthly series, the audit
asks for the daily reading on the month's last day (`highest_daily_check`). If
the two agree inside the month-end tolerance the `--monthly-daily` screen
already uses -- 100 acre-feet or 5% of the larger -- `discrepancies` is told the
high is confirmed and the spike screen stays quiet. A missing daily reading
confirms nothing. The other screens are unchanged and still read the monthly
figure. Each evidence row says which series it was screened on and carries the
daily check.

**A published record figure the water cannot have set is reported, never
removed.** `admission.record_figure_findings` runs inside `summarize` for every
provider, on the series after reviewed exclusions, and the refresh prints each
finding as a `::warning` named "Record figure for review". Two screens:

- a record high above the largest full level the record has had, plus
  `SURCHARGE_ALLOWANCE` -- the largest, so a reservoir held below its full
  level today is not reported for water it held before the limit (ADR-111);
- a record low far below the readings either side of it: each neighbour within
  45 days at least twice the low and above it by 5% of the full level. A real
  low is reached gradually, so it sits among readings close to it; a reservoir
  drained to zero for months has no such neighbours and stays quiet.

A finding is a referral. A confirmed fault becomes an ADR-116 exclusion with
its own reason, source, date and issue.

**This applies to every station**, and admits none. The audit reports; whether
a station joins the roster is still a reviewed decision with its own evidence.

## What it changes, measured on 2026-10-31

The California audit, before and after, over the same 236 stations:

| | before | after |
|---|---:|---:|
| dormant | 50 | 23 |
| quiet for over a year | 2 | 5 |
| screened on the daily series | 0 | 24 |
| candidates | 11 | 30 |
| candidates the screens would not hold | 4 | 16 |

Five of the 24 daily stations are already published. Four stations are newly
quiet -- Iron Canyon, Juncal, Olivenhain and Loch Lomond -- and were dormant
before: their daily series answered, but not within the year. Guadalupe left
the quiet list.

Of the eleven withheld stations, one changes findings and none changes status.
Guadalupe is screened on its daily series, and neither the quiet nor the spike
finding applies; it stays held for its full level under ADR-111. Bon Tempe is
still quiet: its daily series last reported on 19 November 2023. No withheld
station's spike screen fired after the exclusions already in force, so the
daily check changed no other verdict.

The record-figure screen, run on the nine reservoirs' daily series before the
116 exclusions this change also commits, reports every one of them. In the
California refresh that regenerated the payload after them, it reports none
of the nine, and 31 findings at 30 other California reservoirs: ten record
highs between 11% and 262% above the full level (Huntington Lake at 277,789
against 89,166, Mountain Meadows at 89,729 against 24,800) and 21 record lows
far below their neighbours, nine of them zeros. Each is a referral for a
person; none is excluded here.

## Rejected alternatives

- **Screen every station on its daily series.** It answers more precisely, and
  the screens' thresholds were measured on monthly figures. Thirty times the
  rows, and a change of every verdict at once rather than of the ones the
  monthly series could not answer.
- **Treat a stopped monthly series as current while the daily one reports.**
  It clears the quiet finding and keeps a stale series as the evidence. The
  observed maximum it reports is not the reservoir's.
- **Drop the spike screen for a station that has a daily series.** The daily
  series can be wrong too; Lake Almanor's 8,918,440 is a daily reading. The
  check confirms one named high on one named day, and nothing else.
- **Remove a record figure the screen reports.** That is ADR-116's first
  rejected alternative under another name: a rule that decides the series is
  wrong on the strength of the series.
- **Hold the record-figure screen in a test of `reservoirs.json`.** A test that
  reads the morning's numbers turns the build red when no code changed, and a
  red build freezes the published numbers.

## Consequences

The audit makes more requests: one daily request for each ten silent stations,
and one request for each monthly candidate whose spike screen fires. It is
still a tool a person runs, not a build step.

Sixteen candidates now carry no disagreement. Twelve of them are new, and some
are known to need a person's eye before any admission: Farmington and Mariposa
Creek are flood-control dams, and Clifton Court is a forebay.

The record-figure warning appears on the refresh run page. It is not yet one
of the signals the workflow turns into a tracking issue (`emit_ci_signals`);
that is a separate change.

## Related

- [ADR-116](ADR-116-exclude-a-reviewed-reading-and-never-repair-one.md): the
  exclusions that answer a confirmed fault, applied in the adapter so they
  reach every published figure.
- [ADR-065](ADR-065-the-ceiling-is-the-largest-figure-the-record-holds.md):
  `SURCHARGE_ALLOWANCE`, reused here for the record high.
- [ADR-111](ADR-111-use-the-current-operating-limit-as-full.md): why the record
  high is compared with the largest full level, and why Guadalupe stays held.
