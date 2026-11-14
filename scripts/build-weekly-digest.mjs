import { createServer } from "vite";
import { parseArgs } from "node:util";
import { resolve } from "node:path";

const { values } = parseArgs({ options: { output: { type: "string" } } });
const server = await createServer({ configFile: false, logLevel: "error", appType: "custom",
  server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
try {
  const { writeWeeklyDigest } = await server.ssrLoadModule("/src/build/weekly-digest.ts");
  const result = await writeWeeklyDigest(process.cwd(), values.output ? { output: resolve(values.output) } : {});
  console.log(result);
} finally {
  await server.close();
}
