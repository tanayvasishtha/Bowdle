// Production smoke test: run after `npm run build`. Starts the real server in production mode on a
// spare port, checks the health route, the served client page and a WebSocket join, then shuts down.
import { Client } from "@colyseus/sdk";

process.env.NODE_ENV = "production";
const { server } = await import("../src/server/app.config.ts");
const { closeGameDatabase } = await import("../src/server/db/GameDatabase.ts");

const port = Number(process.env.SMOKE_PORT ?? 2599);
const base = `http://localhost:${port}`;
let failures = 0;

function report(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

await server.listen(port);

const health = await fetch(`${base}/health`);
const healthBody: unknown = await health.json();
report("GET /health", health.ok && typeof healthBody === "object" && healthBody !== null && (healthBody as { ok?: unknown }).ok === true);

const page = await fetch(`${base}/`);
const html = await page.text();
report("GET / serves the built client", page.ok && html.includes("<title>Bowdle</title>") && html.includes("/assets/"));

const guest = await fetch(`${base}/api/auth/guest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Smoke" }) });
const guestBody = await guest.json() as { token?: string };
report("POST /api/auth/guest", guest.status === 201 && typeof guestBody.token === "string");
const preflight = await fetch(`${base}/api/profile`, { method: "OPTIONS", headers: { Origin: "https://games.poki.com", "Access-Control-Request-Method": "GET" } });
report("API allows portal origins", preflight.status === 204 && ["*", "https://games.poki.com"].includes(preflight.headers.get("access-control-allow-origin") ?? "") && (preflight.headers.get("access-control-allow-headers") ?? "").includes("Authorization"));
const profile = await fetch(`${base}/api/profile`, { headers: { Authorization: `Bearer ${guestBody.token}` } });
report("GET /api/profile", profile.ok);
await fetch(`${base}/api/profile`, { method: "DELETE", headers: { Authorization: `Bearer ${guestBody.token}` } });

try {
  const client = new Client(base);
  const room = await client.joinOrCreate("tdm", { name: "Smoke" });
  report("WebSocket join on tdm", room.sessionId.length > 0, `room ${room.roomId}`);
  await room.leave();
} catch (error) {
  report("WebSocket join on tdm", false, error instanceof Error ? error.message : String(error));
}

await server.gracefullyShutdown(false);
await closeGameDatabase();
console.log(failures === 0 ? "production smoke passed" : `production smoke failed: ${failures} check(s)`);
process.exitCode = failures === 0 ? 0 : 1;
