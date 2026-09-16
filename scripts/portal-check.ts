// Checks the portal bundles after `npm run build:poki` and `npm run build:crazygames`.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
function report(label: string, ok: boolean): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures += 1;
}

for (const portal of ["poki", "crazygames"] as const) {
  const dir = join("dist", portal);
  const html = existsSync(join(dir, "index.html")) ? readFileSync(join(dir, "index.html"), "utf8") : "";
  report(`${portal}: index.html built`, html.includes("<title>Bowdle</title>"));
  report(`${portal}: assets load from relative paths`, html.includes("./assets/") && !html.includes('"/assets/'));
  report(`${portal}: privacy and terms pages included`, existsSync(join(dir, "privacy.html")) && existsSync(join(dir, "terms.html")));
  const assets = join(dir, "assets");
  const scripts = existsSync(assets) ? readdirSync(assets).filter((file) => file.endsWith(".js")) : [];
  const code = scripts.map((file) => readFileSync(join(assets, file), "utf8")).join("\n");
  report(`${portal}: talks to the bowdle.io game server`, code.includes("https://bowdle.io"));
  report(`${portal}: loads its portal SDK`, code.includes(portal === "poki" ? "game-cdn.poki.com/scripts/v2/poki-sdk.js" : "sdk.crazygames.com/crazygames-sdk-v3.js"));
}

console.log(failures === 0 ? "portal bundles passed" : `portal bundles failed: ${failures} check(s)`);
process.exitCode = failures === 0 ? 0 : 1;
