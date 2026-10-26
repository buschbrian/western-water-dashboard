# Private gauge review source

This is the source of the private Claude Artifact review, not a dashboard
route. Vite does not publish this directory. `gauge-review.csv` remains the
review worksheet; this page does not edit that file or admit gauges.

The original page and its cached basin/map data were prepared in Claude's
scratch directory on 2026-10-24. Keep this source in git; keep runtime data and
private review records outside the public deployment.

## Prepare and publish

1. Use the existing Artifact's `gauges.json` and `maps/*.jpg` assets. Do not
   replace them with a new network fetch simply to update the page. The local
   preview currently links to Claude's cached assets; copy that bundle to
   durable local storage before deleting the scratch directory.
2. Republish this `index.html` to the **existing** private Artifact. Keep its
   identity, existing assets, runtime contract and private access. Do not create
   a new Artifact or clear its database. Read back the existing `rulings`
   collection before and after, without writing probe records.
3. Preserve the existing `db` rules (read `view`, write `admin` at the root)
   and `user` capability, and add `downloads: {}`. A nonempty capabilities
   declaration is a full replacement: restate all three. The database document
   schema stays `{ruling, notes, updatedAt}` keyed by USGS site number.
4. CSV and GeoJSON exports use the documented Artifact `downloads.save` API.
   The basin's file extension is `.json`: the runtime permits JSON but does
   not list `.geojson` among its accepted extensions. The content is GeoJSON
   in longitude/latitude and opens in GIS software. Confirm the actual export
   in the published runtime.
5. Browser-check a flagged gauge, an untraced gauge and a long-record gauge;
   test notes followed immediately by Next and map-layer changes; test save
   rejection/retry and Agree-next with the unruled filter. Check 320, 768,
   1024 and 1440 px, keyboard access, and the downloads permission prompt.
   Use the chrome-devtools MCP. The dashboard smoke suites serve `dist/` and
   do **not** exercise this private page.

For a local read-only preview, supply the two cached assets beside this file
and serve the directory with `python3 -m http.server 8794 --bind 127.0.0.1`.
Outside Claude the saved-review controls are read-only. No local mock record
is sent to the Artifact.

## Refresh the page's evidence

The worksheet owns the suggestion, its reason, the review queue, the
watershed name and the storage evidence. After
`tools/build_gauge_review.py --evidence --basins <bundle>/gauges.json`,
carry them into a copy of the bundle, offline:

```bash
python3 tools/build_gauge_review_page.py \
  --bundle /home/brian/Documents/utah-gauge-review-2026-10-24/gauges.json \
  --output /path/outside/the/repo/gauges.json
```

Outlines, map frames and nearby points are kept as they were. The tool
refuses a bundle and worksheet that list different gauges. Publish the new
`gauges.json` beside the page; the topographic maps do not change.

## Review safeguards

- Gauges are grouped by watershed (HUC 8), and the queue can be narrowed to
  the rows safe to agree as a group or the ones that need a look. A
  watershed's "Agree with N safe suggestions" asks once and saves on a second
  press within six seconds. It rules only open `bulk` rows the list shows,
  each as its suggestion, and leaves rulings and drafts already made.

- Editing waits for the initial saved-review snapshot and write permission.
- Local drafts are retained through navigation and server snapshots. Failed
  saves stay flagged, can be retried, and do not count as saved review.
- Agree-next waits for success and uses the queue before its current row is
  removed by the unruled filter.
- CSV exports contain only touched gauges, keyed by site number, including
  notes-only and explicitly cleared records. `save_state=unsaved` marks local
  drafts. A fresh export must be reviewed and explicitly merged; it is not a
  pipeline input. Preserve site numbers as text in spreadsheet software.
- Use one editing session at a time. This retains the existing last-write-wins
  document store; it does not add cross-device conflict resolution. A timeout
  cannot cancel a write already sent to the store; inspect a fresh server
  read before reconciling competing edits.
- No ruling establishes record completeness, a flow normal, a regulation
  finding or a corrected drainage boundary. Those remain separate gates.

## Merge an exported review

Keep the private export outside the checkout. Preview it first:

```bash
.venv/bin/python tools/import_gauge_rulings.py /path/to/gauge-rulings.csv
```

The JSON report lists the old and new ruling and notes for each changed site.
It writes nothing. Review every change, then repeat with `--apply` to merge
the saved records into `gauge-review.csv`. Rows absent from the export and
all screen, trace and suggestion columns are preserved. Site numbers stay
text, including leading zeroes. Notes may contain commas, quotes or newlines.

Changing or clearing any existing ruling **or notes** needs `--replace SITE`,
repeated for each intended replacement. For example:

```bash
.venv/bin/python tools/import_gauge_rulings.py /path/to/gauge-rulings.csv --replace 10163000
.venv/bin/python tools/import_gauge_rulings.py /path/to/gauge-rulings.csv --replace 10163000 --apply
```

Any malformed record, duplicate/unknown site, unsaved draft, invalid tier or
missing timestamp refuses the whole batch. A changed ruling that differs
from its suggestion needs a reason in notes. Conflicts exit 2, including in
preview; nothing is applied until every conflicting site is explicitly
named. There is no blanket overwrite flag. Reapplying an unchanged export is
a no-op. Use one worksheet editor at a time, and review the git diff after
applying. No real export has been imported as part of building this tool.

The export timestamp is shown as evidence, not used to decide which review
wins: the worksheet has no per-row review timestamps. Inspect the current
worksheet before choosing to replace its review. Importing a review does not
admit a gauge or add observations to the public dashboard (ADR-130).

## Open the daily-flow prototype

The local prototype fetches one metadata record and 30 daily values for each
of the three candidate gauges in the Provo pilot. It reads only the saved
review bundle; the page makes no agency requests. It replaces the snapshot
after all three series pass identity, date, unit and value checks. A full
30-day refetch replaces older revisions. Failure leaves the last complete
local snapshot in place. The prototype is not published, scheduled or an
admitted gauge roster.

```bash
python3 tools/build_flow_prototype.py \
  --review-bundle /home/brian/Documents/utah-gauge-review-2026-10-24 \
  --output /home/brian/Documents/wwd-provo-flow-preview \
  --end 2026-10-23
python3 -m http.server 8761 \
  --directory /home/brian/Documents/wwd-provo-flow-preview \
  --bind 127.0.0.1
```

Open `http://127.0.0.1:8761/`. Stop the server with Ctrl+C. Choose an output
directory outside the repository. `--demo` builds a clearly labelled,
synthetic snapshot without contacting the service. Agency access uses the
existing optional `USGS_API_KEY` environment variable, if present; never put
it in a URL or a page. The official [daily collection schema](https://api.waterdata.usgs.gov/ogcapi/v1/collections/daily/schema?f=html)
names the `time_series_id`, `approval_status`, `qualifier`, `time`, `value`
and `unit_of_measure` fields. The page retains provisional status and other
flags; it does not convert them into approval.

Verify the offline provider and browser model without using the network:

```bash
PATH=/home/brian/Developer/western-water-dashboard/.venv/bin:$PATH npm run verify:pipeline
node --test tools/flow-pilot/checks.mjs
```

Only the shared checked-in dashboard's published pages are covered by
`npm run verify:browser`; its served `dist/` does not include this local preview.

## Drainage area interpretation

`tools/build_gauge_review.py` calls the gauge-indexed NLDI basin endpoint
without `splitCatchment` or `simplified` overrides. The service documents this
as **full upstream catchments**, simplified by default, including the whole
local catchment. It does not subtract basins above intervening reservoirs.
The reservoir index uses a reviewed dam point to choose a COMID, then requests
its upstream basin; this is a different starting-location path.

The committed reservoir index dated 2026-08-30 gives Jordanelle about 252 sq mi
and Deer Creek about 547 sq mi. The latter set includes Jordanelle and three
listed headwater reservoirs. Subtracting the nested Jordanelle basin suggests
about 295 sq mi between the dams (roughly 54% of Deer Creek's full basin), but
no difference polygon has been validated here. That percentage does not
measure runoff, reservoir inflow or stored water. For multiple upstream
reservoirs, subtract the **union** of verified upstream basins, not their sum.

Published areas need matching outlets and definitions: full upstream versus
between-reservoir, and total versus contributing area. Whole catchments,
noncontributing land, simplification and wrong flowlines are separate possible
causes of a discrepancy. A 25% flag cannot identify its cause. Daniels Creek's
404 versus 50.1 sq mi remains unresolved; Deer Creek's expected inclusion of
Jordanelle does not validate a tributary gauge's outline.

Storage is a sum of the `current_storage_af` of distinct reservoir members,
not an area fraction. `src/upstream-model.ts` uses the committed upstream set;
the builder excludes the target reservoir. Summing several upstream-card
totals can count the same reservoir more than once.

Sources checked 2026-10-24:

- [USGS basin endpoint and split-catchment defaults](https://api.water.usgs.gov/docs/nldi/basin/)
- [USGS total and contributing drainage area](https://water.usgs.gov/themes/hydrofabric/drainage-area/)
- [USGS Deer Creek reservoir: 547 sq mi](https://waterdata.usgs.gov/monitoring-location/USGS-10159000/)
- [USGS Provo River below Jordanelle: 252 sq mi](https://waterdata.usgs.gov/monitoring-location/USGS-10155100/)
- [USGS Daniels Creek: 50.1 sq mi](https://waterdata.usgs.gov/monitoring-location/USGS-10157500/)

## Verification

Run `node tools/gauge-review/checks.mjs`. It uses Node's test runner and a small
DOM/store harness; it checks save failures, timeouts, navigation, drafts,
snapshots, exports and area flags. It does not prove browser layout, real
Artifact permissions, actual file delivery or the basin's hydrologic validity.
Run the repository's `npm run verify:fast` for documentation/code integration.
The importer's synthetic round-trip, refusal and replacement checks run in
`npm run verify:pipeline` (`tests/test_import_gauge_rulings.py`).
