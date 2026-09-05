# Documentation guide

Checked 2026-09-04 against `main`.

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
| [Operating-restriction review](OPERATING-RESTRICTION-REVIEW.md) | Published reservoirs affected by current dam-safety operating limits and the evidence still needed. |
| [Operating-character census](OPERATING-CHARACTER-CENSUS.md) | Proposed operating characters (ADR-114) for all 404 published reservoirs, from dam-inventory and hydrography evidence. Candidates for review; nothing applied. Written by `tools/audit_operating_character.py`. |
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
reopen control, the nine reservoir providers, the mountain snow network, the
upstream sets, four area sizes on every map, accessibility gates and
compatibility redirects are in production. What remains, in the order it
should be worked:

1. **The human visual review** of every page and viewport. The ArcGIS canvas
   is blank in headless Chromium, so colour balance, terrain, density and
   visual hierarchy have no automated evidence at all.
2. **Implement the reviewed full-level decisions.** ADR-110 permits government
   water reports and owner records where NID has no corresponding dam; ADR-111
   uses a dated operating restriction as full while retaining physical
   capacity. Topaz, Vail and Success are the first candidates. The current
   restriction impact and remaining source work are measured in
   [`OPERATING-RESTRICTION-REVIEW.md`](OPERATING-RESTRICTION-REVIEW.md).
3. **Keep the automatic late and withdrawn feed reports under review.**
4. **The two vendor accessibility items and the content policy**, both due on
   the next SDK upgrade: the `aria-prohibited-attr` entry in `AXE_EXCEPTIONS`,
   the unnamed Calcite slider handle that `src/ui/slider-label.ts` works
   around, and the `script-src` measurement behind ADR-036.
5. **Build the terminal-lake path accepted by ADR-112.** Walker Lake is the
   first volume-and-elevation candidate. Great Salt Lake needs an arm-aware
   model before it can follow; neither belongs in reservoir rollups or percent
   full.
6. **The remaining reservoir coverage gaps, now much narrower.** The Corps of
   Engineers' Columbia Basin service (ADR-102) covers Idaho, Oregon and
   Washington, and the Central Arizona Project (ADR-104) closed Arizona's
   largest hole. What is left is not a missing survey: Wyoming's other large
   reservoirs are on the Missouri side, outside the drawn areas by decision;
   Nevada's terminal lakes now have a separate accepted path; Washington keeps
   several utility-owned reservoirs whose
   operators publish nothing a program can read; and Alamo Lake sits under a
   Corps district office this site does not yet read. Item 5 of
   [`WATER-BODY-AND-NAVIGATION-SCOPING.md`](WATER-BODY-AND-NAVIGATION-SCOPING.md)
   carries the survey, and every location kept out names its finding in
   [`admitted_cwms_reservoirs.json`](../admitted_cwms_reservoirs.json).
7. **Two deferred decisions, neither blocking.** Whether to order the upstream
   sets — the flowline-navigation slice
   [`UPSTREAM-TRACE-SCOPING.md`](UPSTREAM-TRACE-SCOPING.md) deliberately left
   out — and whether to give the first-visit chooser its counts, which needs
   three payloads without making the chooser wait on them.

The repository wiki is a reader-oriented summary. The repository remains the
source of truth for implementation details, measurements and decisions.
