import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = 900;
const ASSETS = "dist/client/assets";

let bytes = 0;
for (const file of readdirSync(ASSETS)) {
  if (file.endsWith(".js")) bytes += gzipSync(readFileSync(join(ASSETS, file))).length;
}

const kb = Math.round(bytes / 1024);
console.log(`Client JS gzipped: ${kb} KB (budget ${BUDGET_KB} KB)`);
if (kb > BUDGET_KB) {
  console.error("Over the size budget. See docs/TECH.md, Performance budgets.");
  process.exit(1);
}
