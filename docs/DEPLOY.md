# Deploy Bowdle to Render

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

## Production checks

- First visible frame is under 3 seconds on the target laptop and network.
- A match at 1080p holds 60 fps or adapts render scale without falling below 60%.
- Draw calls stay at or below 150 and visible triangles stay at or below 300,000.
- Client JavaScript is below 900 KB gzipped.
- Average server tick is below 3 ms with 8 players and 20 arrows.
- The latency procedure in `docs/NETCODE.md` passes at about 150 ms against `https://bowdle.io`.
