# Deploy Bowdle to Render

Status: **v2.0.0** (tag `v2.0.0` on `main`). Deploy the tagged release after `npm run check`, smoke, soak and balance pass on the release candidate.

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

`npm run smoke` starts the production server on port 2599 (override with `SMOKE_PORT`), checks `/health`, the served client page and a WebSocket join on `tdm`, then shuts down.

## 2. Create the Render service

1. Push the intended release commit and tag to GitHub.
2. In Render, choose **New → Web Service** and connect `tanayvasishtha/Bowdle`.
3. Select the `main` branch and **Docker** runtime. Render discovers the root `Dockerfile`; no build or start override is needed.
4. Choose a paid instance with at least 1 GB memory so the real-time server does not sleep between matches.
5. Set the health-check path to `/health`.
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

1. In the service’s **Settings → Custom Domains**, add `bowdle.io` and `www.bowdle.io`.
2. At the DNS provider, create the exact A/ANAME and CNAME records Render displays. Remove conflicting records for those hostnames.
3. Wait for Render to mark both domains verified and issue certificates.
4. Redirect `www.bowdle.io` to `bowdle.io` in Render.
5. Repeat the health, page, and two-network match checks at `https://bowdle.io`. Confirm the browser network panel shows a secure `wss://bowdle.io` game connection.

## 5. Release and roll back

Record the deployed commit and tag in the release notes. To roll back, open **Events**, select the last known-good deploy, and choose **Rollback**. Render redeploys that immutable image. Recheck `/health`, the root page, and a two-player match. Do not force-push or move release tags to simulate a rollback.

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

1. Set `REGION` on the server to a short id such as `eu` or `us`. Health checks stay on `/health`.
2. At client build time set `VITE_REGIONS` to a JSON list of `{ "id", "url" }` entries, for example:

```bash
VITE_REGIONS='[{"id":"eu","url":"https://eu.bowdle.example"},{"id":"us","url":"https://us.bowdle.example"}]'
```

3. On boot the client probes `/health` on every entry, picks the lowest ping, shows that ping in the HUD, and lets players override the region in Settings.
4. Ranked queue and public matches stay on the chosen region endpoint (`VITE_SERVER_URL` is only the fallback when `VITE_REGIONS` is empty).
