# Test rules (`tests/`, `src/**/*.test.ts`)

- **A test must not depend on today's numbers.** The build runs the unit
  suite, so a literal percentage turns the build red on a morning when no code
  changed — and a red build freezes the published numbers. Compare against the
  frozen oracle through `src/data/legacy-harness.ts`, against synthetic series,
  or against the payload's own declared fields.
- **Seasonal tests read a frozen season, not the daily file.** `snowpack.json`
  restarts at one snowless day every 1 October, and tests that needed a
  headline or a peak froze the deploy from 2026-10-02. Read
  `readSnowpackSeasonFixture()` (`tests/fixtures/snowpack-wy2026.json`, classed
  `frozen`) for model behaviour; keep `readSnowpack()` for what today's file
  must satisfy, which is the validator.
- **Tests about where a reservoir is read the roster, never `reservoirs.json`**,
  or a quiet feed silently retires the assertion (ADR-056).
- **Size budgets are gzipped**, never raw. A budget in the wrong unit fails on
  the wrong thing.
- **Python tests do not touch the network.** Stub the provider helper in
  `pipeline.providers` and drive the rest with synthetic frames.
- **Prefer converting a prose rule into a check here** over writing it into an
  agent file. `src/architecture.test.ts`, `src/content-language.test.ts`,
  `src/deploy.test.ts`, `tests/test_generated_files.py` and
  `tests/test_reference_freshness.py` are where repository invariants live.
- Browser suites serve `dist/`, not `src/`. Rebuild before running them, or you
  are testing the previous build.
- One accessibility violation is accepted, in a vendor component;
  `AXE_EXCEPTIONS` in `tests/smoke-modern.mjs` says why.

Verify: `npm run verify:fast` for unit work, `npm run verify:pipeline` for
pytest, `npm run verify:browser` for either smoke suite.
