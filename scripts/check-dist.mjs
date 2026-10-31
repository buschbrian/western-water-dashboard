// Checks dist/ against scripts/published-files.json, the list vite.config.ts
// builds and copies from, and that the payload was not bundled (ADR-002).
// Run after `npm run build`; exits 1 with a GitHub annotation per problem.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const dist = join(root, "dist");
const list = JSON.parse(readFileSync(join(root, "scripts", "published-files.json"), "utf8"));

const required = [
  ...list.pages,
  ...list.runtime_data.flatMap((file) => [file, `data/${file}`]),
  ...list.api_aliases.map((file) => `api/${file}`),
  ...list.other_paths
];

let failed = false;
for (const path of required) {
  const file = join(dist, path);
  if (!existsSync(file) || statSync(file).size === 0) {
    console.log(`::error title=Missing from dist::${path}`);
    failed = true;
  }
}

// A bundled reservoirs.json would make every daily refresh depend on a
// successful rebuild, so the built JS must not contain the payload's stamp.
const asOf = JSON.parse(readFileSync(join(root, "reservoirs.json"), "utf8")).generated_at;
const assets = join(dist, "assets");
for (const name of existsSync(assets) ? readdirSync(assets, { recursive: true }) : []) {
  const file = join(assets, String(name));
  if (statSync(file).isFile() && readFileSync(file, "utf8").includes(asOf)) {
    console.log(`::error title=Data was bundled::dist/assets/${name} contains the payload's generated_at; data must be fetched at runtime, not built in`);
    failed = true;
  }
}

if (!failed) console.log(`dist/ holds all ${required.length} published paths, and no bundled payload`);
process.exit(failed ? 1 : 0);
