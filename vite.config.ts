import { copyFile, cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
// From vitest/config rather than vite: it is the same defineConfig with the
// `test` block added to the type. Vite's own does not know that key exists.
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

const root = process.cwd();
const outDir = resolve(root, "dist");

function preserveRuntimeDataAndRedirects(): Plugin {
  return {
    name: "preserve-runtime-data-and-retired-route-redirects",
    apply: "build",
    async closeBundle() {
      await mkdir(resolve(outDir, "data"), { recursive: true });
      await mkdir(resolve(outDir, "api"), { recursive: true });
      await mkdir(resolve(outDir, "legacy"), { recursive: true });
      await mkdir(resolve(outDir, "maplibre"), { recursive: true });
      // Every drought file the pages fetch, and not the one they do not.
      // `usdm-previous.geojson` is last week's polygons, kept so a change
      // between two weeks can be measured from shapes rather than from basin
      // shares. Nothing fetches it, and it is about two megabytes: publishing
      // it would put that in every deploy for nobody, which is the same
      // reason no boundary polygon is here (ADR-048).
      await cp(resolve(root, "data", "drought"), resolve(outDir, "data", "drought"),
        {
          recursive: true,
          filter: (source) => !source.endsWith("usdm-previous.geojson")
        });
      await cp(resolve(root, "data", "assistant"), resolve(outDir, "data", "assistant"),
        { recursive: true });
      // Each finished snow season, frozen (ADR-121). Fetched only when a
      // reader asks for that season or the season chart sets it beside this
      // one, never on first paint.
      await cp(resolve(root, "data", "snow"), resolve(outDir, "data", "snow"),
        { recursive: true });

      // Boundary GeoJSON joins the runtime data for the same reason as the
      // other files: it is fetched, never imported. It is also what lets the pages
      // stop querying the USGS service on every load -- a page that draws
      // its own committed boundaries cannot disagree with the assignments in
      // reservoirs.json, and cannot go blank when that service is down.
      // `reference.json` is the capacity table and the geography in one
      // versioned payload (ADR-018), and it is what the typed stack fetches.
      //
      // No boundary polygon file is here and that is deliberate (ADR-048).
      // `data/watersheds/west-huc6.geojson` is the drawn scope the pipeline
      // assigns and measures against and `huc6.geojson` the roster scope the
      // map opens on (ADR-063); `data/watersheds/west-huc2.geojson` is the
      // region scope registered so `reference.json` can publish the five
      // region names (OPENING-SCOPE-AND-THE-WESTERN-ROSTER.md, decision D3).
      // All three stay committed -- but no page has fetched a polygon file
      // since the outlines became the hosted layer's, and publishing one put
      // megabytes in every deploy, twice, for nobody. It is reviewable in the repository
      // like `normals.json`, which is the same arrangement for the same
      // reason. The Utah state boundary joined them under ADR-067: no map
      // draws a mask from it any more, so the reviewed polygon stays
      // committed for Python's point-in-state classification and stops
      // being copied here.
      for (const file of [
        "reservoirs.json", "lakes.json", "snow_sites.json", "snowpack.json",
        "reference.json", "capacities.json", "upstream_index.json",
        // ADR-125: the daily precipitation file and its committed history.
        "precipitation.json", "precipitation_history.json",
        // ADR-142: the daily soil-moisture file.
        "soil_moisture.json"
      ]) {
        await copyFile(resolve(root, file), resolve(outDir, file));
        await copyFile(resolve(root, file), resolve(outDir, "data", file));
      }
      // Stable public API aliases. These are second copies of the same
      // runtime files, never imports and never a second source of truth.
      for (const file of ["reservoirs.json", "lakes.json", "snowpack.json", "reference.json"]) {
        await copyFile(resolve(root, file), resolve(outDir, "api", file));
      }
      await copyFile(resolve(root, "legacy", "index.html"),
        resolve(outDir, "legacy", "index.html"));
      await copyFile(resolve(root, "maplibre", "index.html"),
        resolve(outDir, "maplibre", "index.html"));

      // public/photos/ is copied whole. Only the photographs are published:
      // not its README, and not an `exiftool` `*_original` backup that still
      // carries the fields the procedure strips.
      const photos = resolve(outDir, "photos");
      for (const name of await readdir(photos).catch(() => [])) {
        if (!name.endsWith(".jpg")) await rm(resolve(photos, name), { recursive: true });
      }
    }
  };
}

export default defineConfig({
  base: "./",
  // Agent worktrees are checkouts of this repository inside this repository,
  // so an unqualified test glob collects every copy of every test file and
  // reports five times the real count -- passing, and meaningless.
  test: {
    // .atlas and .agents are gitignored local skill installs that carry their
    // own test files; CI never sees them, but a local run would collect them.
    exclude: ["**/node_modules/**", "**/dist/**", ".claude/**", ".atlas/**", ".agents/**"],
    // The roster tests walk every published reservoir: about 2 s each on an
    // idle laptop, past the 5 s default when the machine is loaded (measured
    // 6.2 s at a load average of 40 on 2026-10-24). They test correctness,
    // not speed, so a timeout there is noise that can redden a build.
    testTimeout: 20000
  },
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        modern: resolve(root, "modern.html"),
        overview: resolve(root, "overview.html"),
        precipitation: resolve(root, "precipitation.html"),
        snow: resolve(root, "snow.html"),
        drought: resolve(root, "drought.html"),
        methods: resolve(root, "methods.html"),
        data: resolve(root, "data.html"),
        reservoir: resolve(root, "reservoir.html"),
        lakes: resolve(root, "lakes.html"),
        // ADR-128: the story views, for embedding. Not in the navigation.
        story: resolve(root, "story.html"),
        explore: resolve(root, "explore.html"),
        terms: resolve(root, "terms.html"),
        landscape: resolve(root, "landscape.html")
      }
    }
  },
  plugins: [preserveRuntimeDataAndRedirects()]
});
