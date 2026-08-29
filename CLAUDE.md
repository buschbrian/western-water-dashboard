@AGENTS.md

# Claude-specific guidance

`AGENTS.md` above is the repository contract and routes to everything else.
This file adds only what is specific to working here as Claude.

- **Load the applicable skill before specialised work.** `.claude/skills/`
  holds the procedures: `verify`, `reservoir-source`, `science-method-change`,
  `dashboard-ui`, `scope-state`, `data-refresh`, `adr`. A skill is cheaper than
  rediscovering the same rules from the code.
- **Do not infer scientific methodology from surrounding code.** The seasonal
  estimator, the drought sampler and the capacity precedence rules all look
  like ordinary arithmetic and are not. Read
  [`docs/architecture/hydrology-methods.md`](docs/architecture/hydrology-methods.md)
  before changing any of them.
- **Path-scoped rules load from `.claude/rules/`**, and the nearest `AGENTS.md`
  applies to whichever directory you are editing. Read the scoped file, not the
  whole set.
- **Use the repository verification targets** — `npm run verify:fast`,
  `verify:frontend`, `verify:pipeline`, `verify:browser`, `verify:all` — and
  state which one you ran before calling work complete. Do not assemble your own
  command list.
- **Browser suites need Playwright and a Chromium binary.** Prefer an installed
  Chrome through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; restore Playwright with
  `npm install --no-save --no-package-lock playwright` rather than adding it to
  the lockfile.
- **Python runs from the checked-in virtual environment** where one exists:
  `.venv/bin/python -m pytest tests/ -q`.
- **Headless Chromium renders the ArcGIS canvas blank**, so a Playwright
  screenshot is not evidence that a map drew. Say so rather than implying a
  visual check happened.
- **A real browser does draw it**, and the in-app browser pane is one. The map
  renders there in full -- basemap, drainage boundaries, every reservoir
  circle -- so a genuine visual check *is* available for the one thing the
  smoke suites cannot judge. What it costs: the view needs roughly half a
  minute to settle, the canvas lives inside the map component's shadow root so
  a bare `document.querySelectorAll("canvas")` finds nothing, and `view.updating`
  stays true forever once the portal request is refused (ADR-004) even with
  every layer view settled -- read the layer views, not the view. A capture
  taken while the pane is hidden can be a stale frame, so confirm the pane is
  showing before believing a screenshot that looks half-drawn.
