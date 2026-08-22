# Build brief — hydrologic statistics review remediation

**Repository:** `utah-reservoir-dashboard` (western water dashboard: ArcGIS 5.1 + Calcite 5 frontend, Python pipelines)
**Mode:** build. Implement the work below. Do not re-do the analysis — it is finished and its conclusions are given as fact.
**Planner:** review completed 2026-08-22 against the committed payloads and the running dev server.

---

## 0. Read this before you touch anything

This repository has an unusually strict contract and it is cheaper to obey than to rediscover.

1. **Read `AGENTS.md` first, then the nearest `AGENTS.md` to the files you are editing.** It routes; it is not the rule book.
2. **Read `docs/architecture/hydrology-methods.md` before changing any estimator.** The seasonal estimator, the drought sampler and the capacity precedence rules look like ordinary arithmetic and are not.
3. **Load the applicable skill in `.claude/skills/` before starting each stage.** `science-method-change` for Stages 1 and 4A, `dashboard-ui` for Stages 2 and 3, `adr` for every decision record, `verify` before declaring anything complete.
4. **Never hand-edit a generated payload.** `data/generated-files.json` names every generated path and its writer; `tests/test_generated_files.py` enforces it. Change the generator and run it.
5. **Accepted ADRs are immutable history.** Add a successor and change only the old record's status. Update `docs/decisions/README.md`.
6. **Visible text is Simplified Technical English** (ADR-006). This includes `aria-label`s, live regions, chart titles and `<title>` elements. The vocabulary is in `.claude/rules/visible-language.md`. `src/content-language.test.ts` and `tests/smoke-modern.mjs` enforce it. No `text-transform` anywhere.
7. **Tests must not assert today's numbers.** A test with a literal percentage in it turns the build red on a morning when no code changed, and a red build freezes the published numbers. Compare against the payload's own fields or the frozen oracle in `src/data/legacy-harness.ts`.
8. **Python runs from the checked-in virtual environment:** `.venv/bin/python`.
9. **Never run `npx playwright install`.** Use an installed Chrome via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Restore Playwright with `npm install --no-save --no-package-lock playwright`.
10. **Headless Chromium renders the ArcGIS canvas blank.** A screenshot is not evidence that a map drew. Verify hand-built SVG charts by reading the DOM (`read_page`, or query the rendered `<svg>`), not by screenshotting.

**Verification targets — pick one, do not assemble your own command list:**

```bash
npm run verify:fast       # typecheck + unit tests — the inner loop
npm run verify:frontend   # + SDK budget + production build
npm run verify:pipeline   # pytest + committed drought-pair check
npm run verify:browser    # build, then both Playwright smoke suites
npm run verify:all        # everything, before a cross-cutting merge
```

State which target you ran before calling any stage complete.

---

## 1. What is being fixed and why

A statistics and geospatial review found twelve items. Three are high severity and coupled; the rest are presentation, disclosure or latent-bug fixes. The full findings report is summarised inline below — **you do not need to reproduce the analysis, only to implement the remedies.**

The single most important fact: **the snow half of this site and the reservoir half disagree with each other on the same methodological question.** `storageByArea` in `src/drought-model.ts` correctly computes a combined percentage as a ratio of sums and says so in a comment. `build_rollups` in `refresh_snowpack.py` averages per-site ratios instead. That is the root of Stage 1.

---

## 2. Work order and dependencies

Do the stages in order. Stage 1's two tasks **must ship in the same change** — see the warning in 3.1.

| Stage | Tasks | Kind | Needs an ADR |
|---|---|---|---|
| **1** | Snow estimator + denominator floor + axis | Method change | Yes — one ADR |
| **2** | Chart marks that contradict the payload | Presentation | No |
| **3** | Drought coverage disclosure + severity index | Presentation + one new published figure | Yes — one ADR for the index |
| **4** | Baseline windows and thin-sample presentation | 4A method change, 4B presentation | Yes — one ADR for 4A |
| **5** | Latent bug, docstrings, method notes | Housekeeping | No |

Commit each stage separately with its own verification evidence.

---

## 3. Stage 1 — the snow estimator (HIGH)

Load `.claude/skills/science-method-change/SKILL.md` before starting.

### 3.1 Task S1-A — replace mean-of-ratios with ratio-of-sums

**File:** `refresh_snowpack.py`, function `build_rollups`.

Today it collects each site's `percent_of_normal_median` for a date and takes the arithmetic mean. The Natural Resources Conservation Service computes a basin figure the other way: sum the snow water equivalent across sites, sum the medians across the same sites, divide once. The two agree only when every site has a similar denominator, and they routinely do not — a site whose median is 0.1 inches reading 4.1 inches contributes 4,100% and outvotes a site whose median is 40 inches.

**Measured impact on the committed payload:** across 10,131 basin-days that clear the reporting floor, 2,005 (19.8%) differ from the ratio of sums by more than 10 percentage points and 436 by more than 25. Published values reach 1,187% of normal.

Replace the accumulation with:

```python
def build_rollups(sites: list[dict], huc_names: dict[str, str]) -> list[dict]:
    # Ratio of sums, never a mean of ratios. A basin percentage divides the
    # water that is there by the water that is normally there, once -- the same
    # rule `storageByArea` states for reservoirs ("a sum of acre-feet in both
    # cases, not an average of percentages"). Averaging each site's own ratio
    # let a site with a 0.1-inch median outvote a site with a 40-inch one.
    totals = defaultdict(lambda: defaultdict(lambda: {"value": 0.0, "normal": 0.0, "sites": 0}))
    ...
        # Population: a site-day contributes when it has BOTH a reading and a
        # median. The per-site `median > 0` guard goes away with the division --
        # a site with real snow where none is normal genuinely belongs in the
        # numerator, and the basin-level denominator floor (S1-B) is what keeps
        # the answer meaningful.
```

Rules for the new implementation:

- **Population:** a site-day contributes when `value is not None and median is not None`. Drop the per-site `median > 0` requirement — with a single division it is no longer needed, and excluding those sites biases the numerator downward.
- **Guard:** publish `None` when `sites < MIN_ROLLUP_SITES` (unchanged) **or** `sum(normal) <= 0`.
- `reporting_site_count` keeps its meaning: how many sites contributed that day.
- Round to one decimal as today.

**Do not change `normalize_site`.** The per-site `percent_of_normal_median` stays exactly as it is — it is a correct per-site statistic and it is part of the published data API.

### ⚠️ 3.2 Task S1-B — the basin denominator floor (must ship with S1-A)

**S1-A on its own makes some values worse, not better.** Ratio-of-sums is correct arithmetic, and correct arithmetic on a meaningless denominator is still meaningless: Clearwater on 2025-10-20 has a mean depth of 0.62 inches against a mean normal of 0.04 inches, which is a true and useless 1,550% of normal — higher than the 375% currently published. **Ship S1-A and S1-B together or the change is a regression.**

The guard already exists and is applied in the wrong place. `src/snow-model.ts` defines:

```ts
export const MEANINGFUL_NORMAL_INCHES = 1;
export function percentIsMeaningful(point: CurvePoint): boolean { ... }
```

…and the comment beside `headlineFloor` describes the failure exactly — *"in mid-October a handful of high stations divide small readings by small normals and produce a 115% of normal that describes almost nothing."* But the code then says the curve keeps the pipeline's floor because this is *"a presentation rule, not a data rule"*, so every point the headline refuses is still plotted.

**That reasoning is backwards and reversing it is the fix.** The headline is a number a reader weighs against the note beside it. The curve is a shape, and a shape carries no note — the 1,283% point is never shown as text anywhere; it acts only by silently rescaling the axis.

**Implement in the model, not the renderer** (this repository puts arithmetic in the model and keeps renderers dumb):

- Add an exported function in `src/snow-model.ts`, e.g. `curveForDrawing(points: readonly CurvePoint[]): CurvePoint[]`, returning the same points with `percent` set to `null` wherever `percentIsMeaningful` is false.
- Call it in `src/snow.ts` at every site that passes points to `renderSnowCurve`.
- `renderSnowCurve` already treats a null as a line break rather than bridging it, so no renderer change is needed for this task.
- Leave `newestHeadline`, `monthReadings` and the KPI path reading the unfiltered points — they already apply their own, stricter floor.

**Do not null these values in the payload.** They are honest raw data, `data.html` publishes them as a public API, and removing fields is against the repository's readiness rule. The floor belongs at the drawing layer.

### 3.3 Task S1-C — the frontend must move in lockstep

`src/snow-model.ts::regionCurve` recomputes the same mean-of-ratios client-side for the whole-region curve, while `basinCurve` reads the pipeline's figure. **If you fix only the pipeline, the region curve and the basin curves will use two different estimators on the same page.**

Change `regionCurve` to accumulate `sum(value)` and `sum(median)` over the same population and divide once.

**A pleasing consequence, worth putting in the commit message:** `meanNormalsByDate` already computes, per date, the mean depth and the mean normal over that day's reporting sites — and `mean(v) / mean(m)` is identically `sum(v) / sum(m)`. So after this change the percent the curve draws is finally consistent with the `normalInches` and `meanInches` pair the same curve already carries. Today they contradict each other: Puget Sound on 2025-10-15 shows 0.17 inches against a 0.02-inch normal — 1,140% — while publishing 150%.

While you are there, make `meanNormalsByDate` use exactly the same population as the percentage (both require `value` and `median` non-null) so the two can never diverge again.

### 3.4 Task S1-D — bound the snow curve axis

**File:** `src/viz/snow-curve.ts`.

The axis is `Math.max(150, ceil(max × 1.08 / 50) × 50)` with a gridline every 50, so a single autumn point sets the scale for the whole water year. Confirmed in the running page: the Yakima basin curve renders **29 axis labels running 0 to 1,400%** while Yakima's actual winter peaks at 68.9%. The range 0–150% — everything a reader came for, the "Normal" line included — occupies **10.7% of the plot height**. On a 375 px viewport the SVG scales to 0.518, so the fixed 10 px axis text renders at 19.3 user units against a 7.4-unit gridline pitch: roughly 2.6× overlap.

S1-A and S1-B together fix this at source. **Measured target: after both, 0 of 48 basins have an axis top above 300%, and the worst case falls from 1,400% to 200%.** Use that as your acceptance criterion.

Still add cheap insurance against regression:

- Make the gridline step adaptive rather than fixed at 50, so the label count stays bounded whatever the range — pick a step from `[25, 50, 100, 250, 500]` such that the number of gridlines never exceeds about 8.
- Keep `Math.max(150, …)` — the reasoning in the existing comment is right and should stay: *"the axis always reaches 150 so 'just under normal' cannot fill the frame and read as a good year."*
- Add a unit test asserting the gridline count stays bounded for a range of synthetic maxima including a pathological one. Do not assert against today's data.

### 3.5 Task S1-E — give the snow payload a method version

The reservoir payload has `METHOD_VERSION`. The drought coverage file has `method.version` and a test holding both levels to it. **The snow payload has neither — only `schema_version: 2`.**

That is a real gap and this change makes it urgent: you are about to alter every published snow figure with nothing in the file to say which estimator produced it, and an archive consumer comparing two weeks would have no way to know they were measured differently.

- Add a `method` block to `build_payload` in `refresh_snowpack.py`, mirroring the shape `tools/compute_drought_coverage.py` already uses: a `version` string, plus the rules that define the estimator (`"ratio of summed water to summed medians"`, the reporting floor, the normal period).
- Bump `schema_version` 2 → 3.
- Teach `src/data/snow-validate.ts` about the new block. **Additive only — readiness fields are added, never removed.**
- Update `src/data-docs-schema.ts` so `data.html` documents the new fields. Machine identifiers stay quoted there (ADR-026).

### 3.6 Stage 1 deliverables

- **ADR** recording the estimator change: what it was, what it is, why the mean of ratios was wrong, the measured impact (the 19.8% / 2,005-of-10,131 figure), and why the denominator floor had to move to the curve. Follow `.claude/skills/adr/SKILL.md`; update `docs/decisions/README.md`.
- Update `docs/architecture/hydrology-methods.md` with a snow section stating the rule. It currently has nothing on snow — it should, in the same voice as *"Every year gets one vote."*
- Regenerate `snowpack.json` by **running `refresh_snowpack.py`**, never by editing it.
- Do **not** touch the reservoir `METHOD_VERSION`. It names the reservoir seasonal estimator; the doc is explicit that bumping it for an unrelated change would force a network-wide normals rebuild that changed nothing.

**Verify:** `npm run verify:pipeline`, then `npm run verify:browser`.

---

## 4. Stage 2 — chart marks that contradict the payload

Load `.claude/skills/dashboard-ui/SKILL.md`.

### 4.1 Task S2-A — stop silently clamping percent full at 100

ADR-072 is explicit that a reservoir operating a surcharge above its conservation pool *"keeps it and publishes just above 100, which is what a surcharge is."* Five reservoirs do today:

| Reservoir | Percent full | Drainage area |
|---|---:|---|
| Thompson Falls Reservoir | 104.0% | Pend Oreille |
| Black Canyon Reservoir | 103.3% | Middle Snake-Boise |
| Billy Clapp Lake | 101.1% | Upper Columbia |
| Painted Rocks Lake | 100.4% | Pend Oreille |
| Flathead Lake | 100.2% | Pend Oreille |

Every percent axis pins them. Three of the five are in Pend Oreille, so that box plot's whisker is drawn exactly on the axis maximum and is indistinguishable from one ending at 100.0. The `<title>` still reports the true value, so the number survives and only the mark is wrong — the harder error to notice.

**Keep the 0–100 axis.** The existing comment gives the right reason and it should stay: *"Percent full runs 0 to 100 whatever is on the chart, so a box's width means the same thing on every render and between one filter and the next."* An axis that stretches to 104 when one reservoir is in view and back to 100 when it is filtered out is worse.

**Instead, make an over-range value look over-range:**

- **`src/viz/spread.ts`** — when `box.high > AXIS_MAX`, draw the whisker cap as an outward-pointing chevron rather than a flat cap. Draw an outlier above `AXIS_MAX` as a marker that reads as clipped (a half marker at the edge, or a small triangle) rather than a circle identical to an in-range one. The `<title>` text already carries the true figures; leave it.
- **`src/overview-charts.ts`** — `PERCENT_AXIS = { min: 0, max: 100 }` feeds the ArcGIS bar chart, and **`rank = "percent"` is reachable from the UI** (`#chart-rank` offers "Percent full"), so a 104% reservoir sorts to the top of that chart. Determine what the SDK actually does with an over-max value — clip, overflow, or drop — by loading the page and reading the rendered chart. If it clips, add a visible cue or let the axis carry a small fixed headroom. **Do not discover this by reasoning; check it in the browser.**
- **`src/viz/drought-scatter.ts`** — the same clamp exists on both axes. The vertical one is **latent only**: the highest combined basin figure today is Lower Colorado at 96.4% and no basin exceeds 100. Leave the behaviour, but add a code comment recording that it is latent so a future reader does not assume it was checked and found impossible.

- Add a page-copy sentence wherever a percent chart can show a surcharge, explaining that a reservoir can hold more than its full level. Simplified Technical English.

### 4.2 Task S2-B — show the sample size on the box plot

**File:** `src/viz/spread.ts`, and the chart's page copy in `src/overview.ts` (around line 390).

`spreadBoxes` uses `minimum = 3`, and the reasoning given for refusing two — *"quartiles that are just the two values again"* — applies nearly as strongly to three. At n = 3 the hinges are midpoints of adjacent pairs, the interquartile range is half the full range, and the Tukey fences are wide enough that an outlier is effectively unreachable. A three-reservoir box and a forty-reservoir box are drawn identically. The count is currently only in the `<title>`.

On a chart whose stated subject is *which points are outliers*, the count is the one number a reader needs in order to weigh what they are seeing.

- **Do not** append it to the area name. The name is `text-anchor: end` in a 162 px lane sized for two lines, and long names such as "Escalante Desert-Sevier Lake" would overflow the viewBox to the left.
- Widen `PAD_RIGHT` from 18 to about 40 and draw the count as a right-aligned `<text>` in that margin, one per row.
- Add a sentence to the chart's page copy naming what the number is — the existing paragraph already explains the box, the whiskers and the dots, so extend it in the same voice. Simplified Technical English; no bare `n =`.
- Leave `minimum = 3` alone. Showing the count costs nothing and hides nothing; raising the floor would drop areas a reader may be looking for, and that is a published-behaviour change needing its own justification.

**Verify:** `npm run verify:browser`. Confirm the new marks and text by querying the rendered `<svg>`, not by screenshot.

---

## 5. Stage 3 — drought coverage disclosure

### 5.1 Task S3-A — surface partial coverage on the area cards

ADR-059 built the `measured` block so a basin crossing a border cannot publish phantom drought-free land, and **the pipeline does its half correctly**: 19 of 75 areas carry one, and `src/types.ts` even names Kootenai's 24.8% in a comment.

The card a reader sees handles only the binary case. `isMeasured` returns whether the shares exist at all, not how much land they rest on. So Rio De La Concepción's card reads **"100.0% of the land is in a drought class or abnormally dry"** on the strength of **1.3%** of its area. I searched the rendered page: the word "measured" in this sense appears nowhere on it.

| Drainage area | Land measured | Card states |
|---|---:|---|
| Rio De La Concepción | 1.3% | 100.0% abnormally dry or worse |
| Kootenai | 24.8% | 21.7% in severe drought |
| Rio Sonoyta | 31.2% | 58.6% in severe drought |
| Rio De Bavispe | 42.2% | — |
| Upper Columbia | 48.2% | 26.5% in severe drought |

**File:** `src/drought.ts`, the area card text builder (around line 490).

The comment there already anticipates the shape of the fix — *"Three sentences for three facts: some drought, none measured as in drought, and not measured at all."* There is a fourth: measured over only part of the area. Add it.

- When `unit.measured` is present and its `percent_of_area` is below 100, add a sentence naming the share the figures rest on.
- Change the class bar's segment `title` from "…of the land" to wording that says *measured* land, for partly measured areas.
- Simplified Technical English. Keep it short and plain — the page's existing voice is short declaratives ("A reservoir holds water that arrived in earlier years.").

### 5.2 Task S3-B — mark thinly measured areas in the ranked surfaces

The same binary predicate gates the analysis, not just the prose. An area passes `isMeasured` and then enters the scatter, the ranked gap list, the worst-class histogram and the "Areas in extreme drought or worse — 29 of 75" tile on equal footing with a fully measured area. The tile is the most exposed, because it counts an area in on *any* land at D3 or D4 — an extent-insensitive rule applied to shares that, for nineteen areas, already divide by a partial denominator.

**Mark; do not drop.** The class shares are shares of *measured* land, which is a well-defined quantity for any non-zero measured area. The problem is that the reader cannot see the denominator. Excluding areas would change published counts and is a decision for the maintainer, not for this pass.

- Add `isWellMeasured(unit)` beside `isMeasured` in `src/drought-model.ts`, with a named threshold constant and a comment stating that it exists for **marking only** and must never be used to exclude an area from a count. Keeping the two predicates distinct in the type system is the point.
- Use it to mark: a distinguishable point in the scatter, and an indicator in the ranked gap list.
- Add a qualifying sentence under the "Areas in extreme drought or worse" tile when any area in scope is thinly measured.
- **Record as an open question for the maintainer** (in the ADR's consequences section, not as code): whether a 1.3%-measured area should be counted in a severity headline at all. That is a published-behaviour change and needs its own decision record.

### 5.3 Task S3-C — publish the Drought Severity and Coverage Index

The Drought Monitor's own summary statistic — the DSCI, the sum of the cumulative D0–D4 shares, running 0 to 500 — **appears nowhere in this repository.** It is precisely the continuous severity measure the drought page wants: one number that respects extent, comparable across areas and across weeks.

It needs no pipeline change. It is `percent_of_area_at_least.d0 + d1 + d2 + d3 + d4`, all of which the payload already carries.

- Add `droughtSeverityIndex(unit)` to `src/drought-model.ts` with unit tests. Assert against constructed fixtures and against the payload's own fields — never against today's numbers.
- Surface it as a figure in the "Each drainage area" card, and consider offering it as an ordering for the ranked list.
- **Do not change the scatter's point colour to a DSCI ramp.** The USDM palette is the page's colour language (ADR-008, ADR-032) and readers who know the national map recognise those exact yellows and reds. Breaking that for a nicer ramp is a bad trade.
- Because the index is derived from measured land, the S3-A disclosure must cover it too.

**Related, and cheap:** the D0–D4 ramp runs yellow through orange to dark red and is hard to separate under deuteranopia. Keeping it for recognition is defensible. Make sure the class name appears **in text** wherever the colour is the only cue — audit the ranked list in `src/viz/drought-gap.ts` and the bar segments, and add text where it is missing.

### 5.4 Stage 3 deliverables

- **ADR** for the severity index: what it is, that it is the Drought Monitor's own published statistic, that it is derived client-side from existing fields, and that it is reported over measured land.
- Note in the ADR's consequences the open question from S3-B.

**Verify:** `npm run verify:browser`.

---

## 6. Stage 4 — baselines and thin samples

### 6.1 Task S4-A — remove the January seam from the twelve-month normal (method change)

Load `.claude/skills/science-method-change/SKILL.md`.

**File:** `pipeline/history.py`, function `monthly_history`.

`normal_af` is the median of that calendar month's mean across years **strictly earlier than the month's own**. On a chart spanning September 2025 to August 2026, the 2025 months draw on 2015–2024 and the 2026 months on 2015–2025 — one extra year, recent, and in a drought record probably dry. The rule is defensible per point; drawn as a continuous line it is two baselines joined at the year end.

**Fix:** anchor the window once for the whole chart.

- Take the anchor year from the **earliest month in the returned window**.
- Compute every one of the twelve months' normals over calendar years strictly less than that anchor year. For a September 2025 – August 2026 window that is 2015–2024 for all twelve months: one population, no seam.
- When the window falls inside a single calendar year the anchor equals that year and the behaviour is unchanged from today.
- **Add a per-row count of the years behind the normal.** This repository's own rule is that *"a median never appears without the number of years behind it"* — `monthly_history` currently breaks it. Additive field.
- Surface the count in the details panel beside the normal.

**Do not change `month_normals` in `tools/build_normal_baselines.py`.** It computes over the closed 1991–2020 period, so every month already has the full thirty years and there is no seam.

**Do not bump `METHOD_VERSION`.** Apply the test the architecture doc gives: *"whether a committed normal built under the old version is still a correct answer."* `normals.json` holds the 1991–2020 day-of-year and month medians; this change touches only the *recent* monthly normal computed live from the series. No committed normal is invalidated, so bumping the version would force a full network rebuild that changed nothing and would claim the estimator had changed when it had not. **The change carries its own ADR instead** — this is exactly the case ADR-072 established the rule for.

I could not isolate the size of the resulting step from the payload alone, because the sample change is confounded with real December-to-January seasonality. Do not try to assert a magnitude in a test. Assert the *structure*: that all twelve rows report the same year count.

### 6.2 Task S4-B — stop printing a percentile a four-year sample cannot support

**File:** `src/state/detail.ts`, function `rankWithYears`.

The recent baseline starts in 2015, so `seasonal_sample_years` tops out at 11. **69 of 375 reservoirs have fewer than 10 prior years.** With four prior years, `mean(population < current) × 100` can only ever return 0, 25, 50, 75 or 100 — yet it prints as "0.0%", which reads as a measurement. San Vicente, El Capitan and Calaveras all publish 0.0; Lake Piru and Rollins publish 100.0.

The project has already done the hard part: the ordinal leads, the sample size travels with it, and the details-panel note says outright that the rank *"is an indication rather than a measurement."* **Nothing about the arithmetic is wrong** — the rank and percentile are internally consistent, since `(r−1)/(N−1)` is exactly `below/n`. This is purely about what a small denominator should be allowed to print.

- Keep `"3rd-lowest of 12, 18.2%"` when the sample supports it — `rankOf >= 11`, i.e. ten or more prior years.
- Print the rank alone, `"1st-lowest of 5"`, below that.
- Put the threshold in a named constant with a comment giving the reason (with n prior years the percentile can take only n+1 distinct values, 100/n apart).
- **Do not change the payload.** `seasonal_percentile` stays exactly as published — it is part of the public data API and the arithmetic is correct. This is a presentation rule.
- `src/state/detail.test.ts` around lines 417–426 asserts the current strings. Update those tests and add cases for the new threshold on both sides of it.

**Verify:** `npm run verify:pipeline` for S4-A, `npm run verify:fast` then `npm run verify:browser` for S4-B.

---

## 7. Stage 5 — latent bug and method notes

### 7.1 Task S5-A — remove the record-max fallback from the basin denominator

**File:** `src/drought-model.ts`, function `storageByArea`.

```ts
group.capacity += reservoir.capacity_af ?? reservoir.record_max_af;
```

All 375 reservoirs currently carry a `capacity_af`, so this never fires. If one ever arrives without, its **highest observed storage** would enter a basin denominator alongside true capacities — and that reservoir could then never read below its own record. That is the family of error ADR-046 exists to prevent.

- Drop the fallback. Skip a reservoir with no capacity, and exclude it from `reservoirCount` too so the count and the ratio describe the same set.
- Add a unit test with a fixture containing a capacity-less reservoir, asserting it is excluded from both.

### 7.2 Task S5-B — disclose the mixed capacity basis

Per reservoir, ADR-003 and ADR-072 choose the denominator carefully and `capacity_basis` records which was chosen. Summed into a basin figure, that care is averaged away. Today's roster:

| Basis | Reservoirs |
|---|---:|
| `normal_storage` | 226 |
| `max_storage` | 86 |
| `cdec_reservoir_report` | 33 |
| `awdb_reservoir_metadata` | 25 |
| `reclamation_project_record` | 4 |
| `nid_storage` | 1 |

"Colorado Headwaters: 44.6% full" divides by a mixture of conservation pools and maximum pools. This is the best available answer rather than a wrong one, and the ratio-of-sums form is right. It deserves a sentence, in the same spirit as the reservoir detail panel naming the basis for a single reservoir.

- Add it to `methods.html` / `src/methods.ts`, and to the drought page where combined figures appear.
- Simplified Technical English. Note that `capacity_basis` is a machine identifier and stays quoted in API documentation (ADR-026).

### 7.3 Task S5-C — record the real limit of the drought error budget

**File:** `tools/compute_drought_coverage.py` module docstring, and a line in `docs/architecture/hydrology-methods.md`.

The convergence study is careful and its conclusion holds: at `DEFAULT_STEP = 0.002` the sampling term is about 0.001 points and the sphere-versus-ellipsoid term about 0.004, against a rounding boundary of 0.05. ADR-037 already moved the drainage boundaries to about 56 m so they sit below the grid. **The ordering of the error budget is right and nothing here needs changing.**

What no measurement covers is the input geometry on the other side. The Drought Monitor classes and the land mask are both fetched at roughly 100 m, and the grid step is about 185 m of latitude — the same order. Because `tools/measure_drought_convergence.py` compares finer steps over *the same simplified polygons*, it cannot see this term at all.

Add a paragraph saying so. The practical consequence is only that **a step finer than 0.002° buys nothing until the geometry tolerance is measured too** — worth recording so a future reader does not spend seventy more seconds a morning chasing it.

**Documentation only. Do not change the step, the tolerances, or any fetch.**

---

## 8. Explicitly out of scope

Do not do these. They were considered and rejected or deferred.

- **Do not** change the reservoir `METHOD_VERSION`. See 6.1.
- **Do not** re-colour the drought scatter by a severity ramp. See 5.3.
- **Do not** exclude thinly measured areas from counts. See 5.2 — it is the maintainer's decision and needs its own ADR.
- **Do not** null low-denominator snow values in `snowpack.json`. See 3.2.
- **Do not** add `mean_normal_inches` to the rollup series. It was considered — it would let a payload consumer apply the denominator floor — but the client can already derive it from the sites, and payload cost is measured gzipped under ADR-051. Record it as a deferred idea, do not implement it.
- **Do not** change the drought sampling step, the boundary tolerances, or any fetch tolerance.
- **Do not** touch `shared/reservoir-viz.js`, `huc6.geojson`, `utah-boundary.geojson`, `OPENING_SCOPE_HUC6_BOUNDS`, the `admitted_*.json` rosters, or any accepted ADR body.

---

## 9. Definition of done

- [ ] Each stage is a separate commit naming the verification target that was run and its result.
- [ ] Three ADRs written (Stage 1 estimator, Stage 3 severity index, Stage 4A monthly normal window), `docs/decisions/README.md` updated.
- [ ] `docs/architecture/hydrology-methods.md` gained a snow section and the drought error-budget note.
- [ ] `snowpack.json` regenerated by running `refresh_snowpack.py`, not edited.
- [ ] **Measured acceptance criterion for Stage 1:** no basin snow curve has an axis top above 300%, and the worst case is at or below 200%. Confirm by loading `snow.html` and reading the rendered `<svg>` axis labels for the previously worst basins — Yakima (170300), Puget Sound (171100), Kootenai (170101).
- [ ] Region curve and basin curves demonstrably use the same estimator.
- [ ] All new visible text passes `src/content-language.test.ts` and the smoke suite.
- [ ] No test asserts a number that changes when the data refreshes.
- [ ] `npm run verify:all` green.

---

## 10. If something does not match this brief

The analysis behind it was done against the payloads committed on 2026-08-22. If a figure you observe differs materially — say the snow payload has been refreshed and the worst basin is no longer Yakima — **the remedies still stand; only the illustrative numbers move.** Do not abandon a task because its example is stale. Recompute the example, note the new figure in your commit message, and carry on.

If you find that a remedy is wrong on the merits, say so plainly with the evidence and stop that task rather than implementing something you believe to be incorrect. Finish every other task in full.
