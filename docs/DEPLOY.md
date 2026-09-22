# Deploy Bowdle to Render

Status: **v3.0.1** (tag `v3.0.1` on `main`). Deploy that tag. Do not deploy `v3.0.0`: it was tagged before the launch gates were green, and 9 map commits landed after it.

Deploy a tagged release only after `npm run check`, `npm run smoke`, `npm run soak` and the full Playwright suite pass on the release commit.

Bowdle runs as one Node process: Express serves `dist/client`, Colyseus serves the game WebSocket on the same origin, and `GET /health` reports readiness. Render terminates HTTPS and secure WebSockets at the public edge.

## 1. Prove the production image locally

From the repository root:

```bash
docker build -t bowdle:local .
docker run --rm -p 2567:2567 -e PORT=2567 bowdle:local
```

Open `http://localhost:2567/` and check `http://localhost:2567/health`. Play from two browser windows before publishing.

Without Docker, the same checks run from a normal checkout:

```bash
npm ci
npm run build
npm run smoke
```

`npm run smoke` starts the production server on port 2599 (override with `SMOKE_PORT`), checks `/health` (JSON includes `database`: `postgres` | `pglite` | `memory`), the served client page and a WebSocket join on `tdm`, then shuts down.

## 2. Create the Render service

1. Push the intended release commit and tag to GitHub.
2. In Render, choose **New â†’ Web Service** and connect `tanayvasishtha/Bowdle`.
3. Select the `main` branch and **Docker** runtime. Render discovers the root `Dockerfile`; no build or start override is needed.
4. Choose a paid instance with at least 1 GB memory so the real-time server does not sleep between matches.
5. Set the health-check path to `/health` (JSON includes `database`: `postgres` | `pglite` | `memory`).
6. Add `NODE_ENV=production`. Render provides `PORT`; do not hard-code or override it.
   - `DATABASE_URL`: a Render Postgres internal URL. Without it, accounts live in memory and vanish on restart (the server logs `databaseInMemory`).
   - `TRUST_PROXY=1`, so the guest sign-up rate limit sees real client addresses behind the Render proxy.
   - Optional sign-in: `PUBLIC_URL=https://bowdle.io` plus `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`, and/or `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Register `https://bowdle.io/api/auth/discord/callback` and `https://bowdle.io/api/auth/google/callback` as redirect URLs. A provider stays hidden until all three of its values are set.
7. Turn on auto-deploy only after the first manual deploy passes. Deploy the service.

The client defaults to its own origin, so this single-host deployment needs no `VITE_SERVER_URL`. For a separately hosted portal build, set `VITE_SERVER_URL` at build time to the public HTTPS origin; the client will use the corresponding secure WebSocket connection.

## 3. Verify HTTPS and WebSockets

After Render reports healthy:

```bash
curl --fail --show-error https://YOUR-SERVICE.onrender.com/health
curl --fail --show-error https://YOUR-SERVICE.onrender.com/
```

Open the HTTPS URL on two different networks, join a match from both, move and fire, and confirm each browser sees the other. Watch the service logs for one `serverMetrics` JSON record every 10 seconds. With two full rooms, `averageTickMs` must remain below 3.

## 4. Attach `bowdle.io`

1. In the serviceâ€™s **Settings â†’ Custom Domains**, add `bowdle.io` and `www.bowdle.io`.
2. At the DNS provider, create the exact A/ANAME and CNAME records Render displays. Remove conflicting records for those hostnames.
3. Wait for Render to mark both domains verified and issue certificates.
4. Redirect `www.bowdle.io` to `bowdle.io` in Render.
5. Repeat the health, page, and two-network match checks at `https://bowdle.io`. Confirm the browser network panel shows a secure `wss://bowdle.io` game connection.

## 5. Release and roll back

Record the deployed commit and tag in the release notes. To roll back, open **Events**, select the last known-good deploy, and choose **Rollback**. Render redeploys that immutable image. Recheck `/health` (JSON includes `database`: `postgres` | `pglite` | `memory`), the root page, and a two-player match. Do not force-push or move release tags to simulate a rollback.

## Portal builds (Poki and CrazyGames)

1. `npm run build:portals` builds `dist/poki` and `dist/crazygames` and checks them. Both use relative asset paths and talk to `https://bowdle.io`; set `VITE_SERVER_URL` before building to point them elsewhere.
2. Zip the contents of the folder (not the folder itself) and upload it in the portal's developer dashboard.
3. Portal builds load the portal SDK, report loading and gameplay, show a midgame ad before "Play again" with audio and input paused, and hide purchases, Discord and Google sign-in, and Share on X.
4. The game server answers cross-origin API calls (Colyseus sends the CORS headers), so no extra setup is needed on bowdle.io.
5. Test locally with each portal's own testing tool before submitting; the SDK falls back to no-ops when its script cannot load.

## Retention report

`npm run retention` prints day 1 and day 7 return rates, daily signups and activity, the share of play days with two or more matches, and challenge completion. Run it with `DATABASE_URL` set to the production database (read only is enough). Server logs also carry `matchFinished`, `levelUp` and `challengeCompleted` JSON lines with account ids only.

## Production checks

- First visible frame is under 3 seconds on the target laptop and network.
- A match at 1080p holds 60 fps or adapts render scale without falling below 60%.
- Draw calls stay at or below 150 and visible triangles stay at or below 300,000.
- Client JavaScript is below 900 KB gzipped.
- Average server tick is below 3 ms with 8 players and 20 arrows.
- The latency procedure in `docs/NETCODE.md` passes at about 150 ms against `https://bowdle.io`.

## Multi-region

Each region is its own Bowdle process (and usually its own Render service) with a shared Postgres.

1. Set `REGION` on the server to a short id such as `eu` or `us`. Health checks stay on `/health` (JSON includes `database`: `postgres` | `pglite` | `memory`).
2. At client build time set `VITE_REGIONS` to a JSON list of `{ "id", "url" }` entries, for example:

```bash
VITE_REGIONS='[{"id":"eu","url":"https://eu.bowdle.example"},{"id":"us","url":"https://us.bowdle.example"}]'
```

3. On boot the client probes `/health` (JSON includes `database`: `postgres` | `pglite` | `memory`) on every entry, picks the lowest ping, shows that ping in the HUD, and lets players override the region in Settings.
4. Ranked queue and public matches stay on the chosen region endpoint (`VITE_SERVER_URL` is only the fallback when `VITE_REGIONS` is empty).


## Ranked seasons

When a new season id first appears, the ranked queue soft-resets ratings from the previous season via `softResetSeasonRatings` (RD opens back up; rating drifts toward the mean). You can also run it manually from a server shell if you need to force a soft reset.

## Launch checklist (v3.0.0)

1. `npm run check` green on the release commit.
2. `npm run smoke` green against a production build.
3. `npm run soak` green (Lobby bots and Village Defense / Expedition waves).
4. Environment: `NODE_ENV=production`, `DATABASE_URL` (or durable PGlite dir), `TRUST_PROXY=1` behind a load balancer.
5. Run migrations once against production, then confirm `GET /health` returns ready with a durable `database` mode.
6. Domain and HTTPS up; WebSocket joins work from two networks.
7. Ten-minute playtest of Training, Play (Village Defense), and Lobby with two people on the production URL.
   - One of the two should be far from the server region, or use the latency procedure in `docs/NETCODE.md` (about 150 ms). This has not been done for v3 yet, and it is the only check that shows whether grapple, zip lines and shooting feel right for players who are not next to the server.
8. Error logging visible (service logs); guest and report rate limits engaged.
9. Rollback: redeploy the previous known-good image or tag; do not force-push release tags.

## Capacity

Not measured under real load yet. A rough ceiling from the tick budget:

- The server ticks 30 times a second, so each tick has about 33 ms, and all rooms in one Node process share one thread.
- A room is budgeted at 3 ms per tick (`tests/server/performance.test.ts` checks an 8 player room with 20 arrows). At that cost one process tops out around 10 busy rooms before ticks start running late, and it is wise to plan for about half that.
- So plan on roughly 5 busy rooms per process at launch (up to 50 Lobby players or 20 Village Defense players), then measure.

To measure: open rooms against a production build and watch the tick time in the `serverMetrics` log lines as rooms are added.

If `averageTickMs` stays under 3 with your target room count, keep a single process. To scale further, run several identical processes behind the load balancer (sticky sessions or Colyseus presence when you outgrow one node). Do not add a presence driver until measured load requires it.

