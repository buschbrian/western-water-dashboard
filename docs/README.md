# Documentation guide

Checked 2026-08-24 against `main`.

## Which file is the current truth?

One authority per question. Nothing else needs to be consulted to answer it.

| Question | Authority |
|---|---|
| How does the system work today? | [`architecture/`](architecture/README.md) |
| Why is it that way, and what superseded it? | [`decisions/`](decisions/README.md) |
| How do I run a recurring procedure? | [`operations/`](operations/) |
| What was tried during the modernization? | [`history/`](history/README.md) |
| What must an agent obey on every task? | [`../AGENTS.md`](../AGENTS.md) |
| What must an agent obey in one subsystem? | the nearest `AGENTS.md`, plus [`../.claude/rules/`](../.claude/rules/) |
| What is the step-by-step for a recurring task? | [`../.claude/skills/`](../.claude/skills/) |
| What is actually enforced? | the tests, validators, types and scripts |
| What does the product do, and how do I run it? | [`../README.md`](../README.md) |
| What changed for readers? | [`../CHANGELOG.md`](../CHANGELOG.md) |

**Executable truth outranks prose.** Where prose and a passing test disagree,
the test is right and the prose is the bug.

## Current architecture

| Document | Owns |
|---|---|
| [Architecture index](architecture/README.md) | Product shape, generated-versus-source ownership, the authority map. |
| [Frontend](architecture/frontend.md) | SDK boundaries, layers, colour, readiness, accessibility, solved layout constraints. |
| [Pipeline](architecture/pipeline.md) | Pipeline modules, runtime-data contract, payload cost, freshness, drought coverage. |
| [Hydrology methods](architecture/hydrology-methods.md) | The seasonal estimator, method version, change intervals, area measurement. |
| [Scopes](architecture/scopes.md) | Drawn, roster, opening and selected scope; levels; URL state; dominant reservoirs. |

## Operations

| Document | Procedure |
|---|---|
| [Verification](operations/verification.md) | Which verify target to run, and what each suite can and cannot see. |
| [Data refresh](operations/data-refresh.md) | The daily job, its failure behaviour, and the long-lived rebuilds. |
| [Source admission](operations/source-admission.md) | Adding, replacing or reviewing a reservoir provider. |

## Maintained references

| Document | Role |
|---|---|
| [Source inventory](AUTHORITATIVE-SOURCE-INVENTORY.md) | Source ownership, endpoints, copy rules, failure behaviour. Read by `src/source-inventory.test.ts`. |
| [Data transfer](data-transfer.md) | Measured payload and hosted-layer costs. Re-measure after payload or layer changes. |
| [Western source candidates](WESTERN-SOURCE-CANDIDATES.md) | Survey of non-federal and additional federal services, fetched live. |
| [Colorado and California API review](CDSS-CDEC-API-REVIEW.md) | Measured source value, limits and integration cost. |
| [Upstream trace scoping](UPSTREAM-TRACE-SCOPING.md) | What it would take to say what drains to a reservoir. Measured against the U.S. Geological Survey network index. Built as ADR-077, except the ordering slice. |
| [Streamflow scoping](STREAMFLOW-SCOPING.md) | What a river-flow page would take, and what it would make this site. The data is the same service, key and collection the reservoir provider already reads; the obstacle is ADR-078, which says every water this site measures is a reservoir. Recommends nothing be built yet. |
| [Water-body and navigation scoping](WATER-BODY-AND-NAVIGATION-SCOPING.md) | Name normalization, lake-versus-reservoir type, nested navigation, reopening the chooser, and the states still unsourced. Four of its five items are closed; the state survey is the one that is open. |

## Historical material

Every plan, phase and admission journal is listed in
[`history/README.md`](history/README.md), which also says which ones stayed in
this directory and why. Each carries a banner at the top of the file. They are
evidence about a date, never a description of the present.

## Current work

The typed ArcGIS application, western geography, the opening choice and its
reopen control, the seven reservoir providers, the mountain snow network, the
upstream sets, drought at four area sizes, accessibility gates and
compatibility redirects are in production. What remains, in the order it
should be worked:

1. **The human visual review** of every page and viewport. The ArcGIS canvas
   is blank in headless Chromium, so colour balance, terrain, density and
   visual hierarchy have no automated evidence at all.
2. **Settle the held candidates** — 12 California and 4 U.S. Geological Survey
   candidates held for source disagreements, each named with its finding in
   its own roster file.
3. **Keep the automatic late and withdrawn feed reports under review.**
4. **The two vendor accessibility items and the content policy**, both due on
   the next SDK upgrade: the `aria-prohibited-attr` entry in `AXE_EXCEPTIONS`,
   the unnamed Calcite slider handle that `src/ui/slider-label.ts` works
   around, and the `script-src` measurement behind ADR-036.
5. **The four published points with no water body in any askable source.**
6. **The remaining coverage gaps** — Idaho, Oregon and Wyoming outright, plus
   further Nevada and Washington reservoirs. Both sources the 2026-08-28
   follow-up found are now built: SRP's four additive Arizona reservoirs and
   DNRC's one in-scope Montana reservoir are published, and DNRC's nine
   remaining sensors drain to the Gulf of Mexico rather than being a gap.
   Item 5 of
   [`WATER-BODY-AND-NAVIGATION-SCOPING.md`](WATER-BODY-AND-NAVIGATION-SCOPING.md)
   carries the survey.
7. **Two deferred decisions, neither blocking.** Whether to order the upstream
   sets — the flowline-navigation slice
   [`UPSTREAM-TRACE-SCOPING.md`](UPSTREAM-TRACE-SCOPING.md) deliberately left
   out — and whether to give the first-visit chooser its counts, which needs
   three payloads without making the chooser wait on them.

The repository wiki is a reader-oriented summary. The repository remains the
source of truth for implementation details, measurements and decisions.
