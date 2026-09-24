import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src", "tests"];
// Replacement char, or classic UTF-8-as-Latin1 double-encoding markers.
const bad = [/\uFFFD/, /Â·/, /Â /, /â€/, /Ã¢/, /Ã—/, /Ã©/, /Ã¨/, /Ã /];
// A byte order mark, or raw control characters (other than tab, newline and carriage return) that scripted edits can
// leave behind: a literal NUL once slipped into a string in OnlineSession.ts.
bad.push(/\uFEFF/, /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walk(path);
    else if (/\.(ts|tsx|js|mjs|css|html|md)$/.test(name)) {
      const text = readFileSync(path, "utf8");
      for (const re of bad) if (re.test(text)) { hits.push(`${path} (${re})`); break; }
    }
  }
}

for (const root of roots) walk(root);
if (hits.length) {
  console.error("mojibake markers found:");
  for (const hit of hits) console.error(" ", hit);
  process.exit(1);
}
console.log("mojibake check passed");
